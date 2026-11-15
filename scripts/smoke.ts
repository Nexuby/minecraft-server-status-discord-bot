import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  type RESTGetCurrentApplicationResult,
} from 'discord.js';
import { StatusClient } from '../src/api.js';
import { loadConfig } from '../src/config.js';

async function main() {
  const config = loadConfig();
  const api = new StatusClient(config.apiBase);
  for (const [address, edition] of [
    ['mc.hypixel.net', 'java'],
    ['play.cubecraft.net:19132', 'bedrock'],
  ] as const) {
    const result = await api.get(address, edition);
    if (result.kind !== 'status')
      throw new Error(`MCAPI ${edition} unavailable (${result.reason}).`);
    console.log(
      JSON.stringify({
        check: 'mcapitr-live',
        address,
        edition,
        online: result.status.online,
        stale: result.status.stale,
        players: result.status.players,
        checkedAt: result.status.checkedAt,
      }),
    );
  }
  const rest = new REST({ version: '10', timeout: 10000, retries: 0 }).setToken(config.token);
  let app: RESTGetCurrentApplicationResult;
  try {
    app = (await rest.get(Routes.oauth2CurrentApplication())) as RESTGetCurrentApplicationResult;
  } catch {
    throw new Error(
      'Discord authentication failed. Check or rotate DISCORD_TOKEN; no token was logged.',
    );
  }
  console.log(JSON.stringify({ check: 'discord-auth', application: app.name, id: app.id }));
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Discord gateway ready timeout.')), 20000);
      client.once(Events.ClientReady, (ready) => {
        clearTimeout(timer);
        console.log(
          JSON.stringify({
            check: 'discord-gateway',
            user: ready.user.tag,
            guilds: ready.guilds.cache.size,
          }),
        );
        resolve();
      });
      client.login(config.token).catch(() => {
        clearTimeout(timer);
        reject(new Error('Discord gateway login failed.'));
      });
    });
  } finally {
    client.destroy();
  }
  console.log('Live smoke passed. No messages sent, no monitors created. Gateway disconnected.');
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Smoke test failed.');
  process.exitCode = 1;
});
