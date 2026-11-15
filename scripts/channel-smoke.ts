import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Client, ComponentType, Events, GatewayIntentBits } from 'discord.js';
import { StatusClient } from '../src/api.js';
import { loadConfig } from '../src/config.js';
import { MonitorService, UserError } from '../src/service.js';
import { acquireLock, Store } from '../src/store.js';
import { DiscordTransport, textChannel } from '../src/transport.js';

// Deliberately opt-in: this test creates messages. No destination is hardcoded.
const { values } = parseArgs({
  options: {
    step: { type: 'string' },
    guild: { type: 'string' },
    channel: { type: 'string' },
    'data-dir': { type: 'string' },
  },
});
type Manifest = {
  version: 1;
  botId: string;
  guildId: string;
  channelId: string;
  cards: Array<{ id: string; messageId: string; edition: string }>;
  checks: string[];
};

async function main() {
  if (
    !['prepare', 'verify', 'cleanup'].includes(values.step ?? '') ||
    !/^\d{17,20}$/.test(values.guild ?? '') ||
    !/^\d{17,20}$/.test(values.channel ?? '') ||
    !values['data-dir']
  ) {
    throw new Error(
      'Use --step prepare|verify|cleanup --guild ID --channel ID --data-dir ISOLATED_TEST_DIRECTORY.',
    );
  }
  const config = loadConfig({ ...process.env, DATA_DIR: resolve(values['data-dir']) });
  const release = await acquireLock(config.dataDir);
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    rest: { timeout: 15000, retries: 1 },
  });
  try {
    await new Promise<void>((done, fail) => {
      const timer = setTimeout(() => fail(new Error('Gateway timeout.')), 20000);
      client.once(Events.ClientReady, () => {
        clearTimeout(timer);
        done();
      });
      client.login(config.token).catch(() => {
        clearTimeout(timer);
        fail(new Error('Gateway login failed.'));
      });
    });
    const guildId = values.guild!;
    const channelId = values.channel!;
    const channel = await textChannel(client, guildId, channelId);
    const store = await Store.load(config.dataDir);
    const api = new StatusClient(config.apiBase);
    const service = new MonitorService(store, api, new DiscordTransport(client), config);
    const path = join(config.dataDir, 'channel-smoke.json');
    let manifest: Manifest;
    if (values.step === 'prepare') {
      assert.equal(store.list().length, 0, 'Use an empty isolated test DATA_DIR.');
      try {
        await readFile(path);
        throw new Error(
          'An earlier manifest exists. Verify or clean it up before starting a new test.',
        );
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
      manifest = { version: 1, botId: client.user!.id, guildId, channelId, cards: [], checks: [] };
      await writeFile(path, JSON.stringify(manifest, null, 2));
      for (const [address, edition, language] of [
        ['mc.hypixel.net', 'java', 'tr'],
        ['play.cubecraft.net:19132', 'bedrock', 'en'],
      ] as const) {
        const m = await service.add({
          guildId,
          channelId,
          address,
          edition,
          language,
          alerts: false,
          label: `MCAPI Test · ${edition === 'java' ? 'Java' : 'Bedrock'}`,
        });
        manifest.cards.push({ id: m.id, messageId: m.messageId!, edition });
        await writeFile(path, JSON.stringify(manifest, null, 2));
        console.log(JSON.stringify({ check: 'created', edition, messageId: m.messageId }));
      }
      manifest.checks.push('real-sdk-cards-created');
    } else {
      manifest = JSON.parse(await readFile(path, 'utf8')) as Manifest;
      assert.equal(manifest.version, 1);
      assert.equal(manifest.botId, client.user!.id);
      assert.equal(manifest.guildId, guildId);
      assert.equal(manifest.channelId, channelId);
      assert.equal(manifest.cards.length, 2);
      for (const saved of manifest.cards) {
        const before = await channel.messages.fetch(saved.messageId);
        assert.equal(
          before.author.id,
          client.user!.id,
          'Only this bot’s test messages may be changed.',
        );
        const m = service.find(saved.id, guildId);
        assert.equal(m.channelId, channelId);
        assert.equal(m.messageId, saved.messageId);
        if (values.step === 'verify') {
          await service.refresh(m.id);
          const edited = await channel.messages.fetch({ message: saved.messageId, force: true });
          assert.equal(edited.id, saved.messageId);
          assert.ok(edited.editedTimestamp);
          assert.equal(edited.embeds[0]?.title, m.label);
          assert.equal(edited.components.length, 1);
          const row = edited.components[0];
          assert.ok(row && row.type === ComponentType.ActionRow);
          assert.equal(row.components.length, 3);
          await service.pause(m.id, guildId, true);
          assert.equal(store.get(m.id)?.paused, true);
          await service.pause(m.id, guildId, false);
          assert.equal(store.get(m.id)?.paused, false);
          await assert.rejects(
            service.add(m),
            (e: unknown) => e instanceof UserError && e.key === 'duplicate',
          );
          assert.throws(() => service.find(m.id, '111111111111111111'), UserError);
          console.log(
            JSON.stringify({
              check: 'same-message-refresh-pause-resume-duplicate-and-guild-boundary',
              edition: m.edition,
              messageId: edited.id,
            }),
          );
        } else {
          await service.remove(m.id, guildId);
          await assert.rejects(
            channel.messages.fetch({ message: saved.messageId, force: true }),
            (e: unknown) => typeof e === 'object' && e !== null && 'code' in e && e.code === 10008,
          );
          assert.equal(store.get(m.id), undefined);
          console.log(JSON.stringify({ check: 'test-card-deleted', messageId: saved.messageId }));
        }
      }
      manifest.checks.push(
        values.step === 'verify' ? 'persisted-cards-verified' : 'test-cards-cleaned',
      );
    }
    await writeFile(path, JSON.stringify(manifest, null, 2));
  } finally {
    client.destroy();
    await release();
  }
}
void main().catch((error) => {
  // No raw REST/SDK exception payloads; assertions are emitted only from our explicit checks.
  console.error(
    error instanceof assert.AssertionError
      ? `Channel smoke assertion failed: ${error.message}`
      : 'Channel smoke failed. Check the explicit target IDs, bot permissions and isolated data directory. No credentials logged.',
  );
  process.exitCode = 1;
});
