import { describe, expect, it, vi } from 'vitest';
import { MessageFlags, type Client, type Interaction } from 'discord.js';
import type { StatusClient } from '../src/api.js';
import { loadConfig } from '../src/config.js';
import { createHandler } from '../src/handlers.js';
import { copy } from '../src/i18n.js';
import type { MonitorService } from '../src/service.js';
import { monitor, observation } from './fixtures.js';

function setup(command = 'status', strings: Record<string, string> = {}, button?: string) {
  const m = monitor();
  const i = {
    locale: 'en-US',
    guildId: m.guildId,
    channelId: m.channelId,
    user: { id: '523456789012345678' },
    message: { id: m.messageId },
    commandName: command,
    customId: button ?? '',
    deferred: false,
    replied: false,
    memberPermissions: { has: vi.fn().mockReturnValue(true) },
    isAutocomplete: vi.fn().mockReturnValue(false),
    isButton: () => Boolean(button),
    isChatInputCommand: () => !button,
    isRepliable: () => true,
    reply: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn(async () => {
      i.deferred = true;
    }),
    respond: vi.fn(),
    options: {
      getString: vi.fn((key: string) => strings[key] ?? null),
      getBoolean: vi.fn().mockReturnValue(false),
      getSubcommand: () => strings.sub ?? 'list',
      getFocused: () => '',
      getChannel: () => ({ id: m.channelId }),
    },
  };
  const api = { get: vi.fn().mockResolvedValue(observation()) };
  const service = {
    store: { list: vi.fn().mockReturnValue([m]), get: vi.fn().mockReturnValue(m) },
    find: vi.fn().mockReturnValue(m),
    refresh: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(m),
    remove: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
  };
  const client = {
    channels: {
      fetch: vi
        .fn()
        .mockResolvedValue({
          guildId: m.guildId,
          type: 0,
          guild: { members: { me: {} } },
          permissionsFor: () => ({ has: () => true }),
        }),
    },
  };
  const run = createHandler(
    client as unknown as Client,
    api as unknown as StatusClient,
    service as unknown as MonitorService,
    loadConfig({ DISCORD_TOKEN: 'x'.repeat(40) }),
  );
  return { i, api, service, m, run: () => run(i as unknown as Interaction) };
}
describe('command routing', () => {
  it('defers privately before a status query and uses the selected SDK mode', async () => {
    const { i, api, run } = setup('status', { address: 'MC.HYPIXEL.NET', edition: 'bedrock' });
    await run();
    expect(i.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(api.get).toHaveBeenCalledWith('mc.hypixel.net', 'bedrock');
    expect(i.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });
  it('only publishes the one-off response when requested', async () => {
    const { i, run } = setup('status', { address: 'example.org' });
    i.options.getBoolean.mockReturnValue(true);
    await run();
    expect(i.deferReply).toHaveBeenCalledWith({});
  });
  it('rejects malformed status addresses before querying', async () => {
    const { i, api, run } = setup('status', { address: 'https://example.org' });
    await run();
    expect(api.get).not.toHaveBeenCalled();
    expect(i.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: copy('en').invalidAddress }),
    );
  });
  it.each(['help', 'about'])('renders %s privately', async (command) => {
    const { i, run } = setup(command);
    await run();
    expect(i.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });
  it('creates a configured monitor after channel permission validation', async () => {
    const { i, service, run, m } = setup('monitor', {
      sub: 'add',
      address: 'example.org',
      edition: 'legacy',
      name: 'Survival',
      language: 'tr',
    });
    await run();
    expect(service.add).toHaveBeenCalledWith(
      expect.objectContaining({
        address: 'example.org',
        edition: 'legacy',
        label: 'Survival',
        language: 'tr',
        alerts: false,
        guildId: m.guildId,
      }),
    );
    expect(i.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining(m.messageId!) }),
    );
  });
  it('returns a bounded monitor list', async () => {
    const { i, run } = setup('monitor');
    await run();
    expect(i.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });
  it.each(['remove', 'pause', 'resume'])(
    'routes management %s with the correct guild',
    async (sub) => {
      const { service, m, run } = setup('monitor', { sub, id: monitor().id });
      await run();
      if (sub === 'remove') expect(service.remove).toHaveBeenCalledWith(m.id, m.guildId);
      else expect(service.pause).toHaveBeenCalledWith(m.id, m.guildId, sub === 'pause');
    },
  );
  it('responds to autocomplete only for managers', async () => {
    const { i, run, m } = setup('monitor');
    i.isAutocomplete.mockReturnValue(true);
    await run();
    expect(i.respond).toHaveBeenCalledWith([expect.objectContaining({ value: m.id })]);
    const denied = setup('monitor');
    denied.i.isAutocomplete.mockReturnValue(true);
    denied.i.memberPermissions.has.mockReturnValue(false);
    await denied.run();
    expect(denied.i.respond).toHaveBeenCalledWith([]);
  });
});
describe('card interactions', () => {
  it('returns the server address privately', async () => {
    const { i, run, m } = setup('', {}, `address:${monitor().id}`);
    await run();
    expect(i.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: `\`${m.address}\``, flags: MessageFlags.Ephemeral }),
    );
  });
  it('refreshes a known card', async () => {
    const { i, service, run, m } = setup('', {}, `refresh:${monitor().id}`);
    await run();
    expect(service.refresh).toHaveBeenCalledWith(m.id);
    expect(i.editReply).toHaveBeenCalledWith(copy('en').refreshed);
  });
  it('rejects copied buttons on an unrelated message', async () => {
    const { i, service, run } = setup('', {}, `refresh:${monitor().id}`);
    i.message.id = '923456789012345678';
    await run();
    expect(service.refresh).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ content: copy('en').gone }));
  });
  it('rejects refresh while paused', async () => {
    const { i, service, m, run } = setup('', {}, `refresh:${monitor().id}`);
    service.find.mockReturnValue({ ...m, paused: true });
    await run();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ content: copy('en').paused }));
  });
  it('checks the owner of a private pagination button', async () => {
    const { i, run } = setup('', {}, 'list:1:someone-else');
    await run();
    expect(i.update).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: copy('en').permission }),
    );
  });
  it('updates a manager’s own paginated list', async () => {
    const { i, run } = setup('', {}, 'list:1:523456789012345678');
    await run();
    expect(i.update).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });
  it('applies user cooldown without repeating the SDK request', async () => {
    const { i, api, run } = setup('status', { address: 'example.org' });
    await run();
    await run();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ content: copy('en').slowDown }));
  });
  it('does not expose unexpected exception payloads', async () => {
    const { i, api, run } = setup('status', { address: 'example.org' });
    api.get.mockRejectedValue(new Error('private-runtime-value'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await run();
    expect(JSON.stringify(i.editReply.mock.calls)).not.toContain('private-runtime-value');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-runtime-value');
    log.mockRestore();
  });
});
