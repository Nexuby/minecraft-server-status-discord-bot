import { ActivityType, Client, Events, GatewayIntentBits } from 'discord.js';
import { StatusClient } from './api.js';
import { loadConfig } from './config.js';
import { createHandler } from './handlers.js';
import { MonitorService } from './service.js';
import { acquireLock, Store, writeHealth } from './store.js';
import { DiscordTransport } from './transport.js';

async function main() {
  const config = loadConfig();
  const release = await acquireLock(config.dataDir);
  const client = new Client({ intents: [GatewayIntentBits.Guilds], allowedMentions: { parse: [] }, rest: { timeout: 15000, retries: 2 } });
  let service: MonitorService | undefined;
  let healthTimer: ReturnType<typeof setInterval> | undefined;
  let shuttingDown = false;
  const shutdown = async (code = 0) => {
    if (shuttingDown) return; shuttingDown = true;
    clearInterval(healthTimer);
    const deadline = setTimeout(() => process.exit(1), 25000); deadline.unref();
    try { await service?.stop(); await writeHealth(config.dataDir, false); client.destroy(); await release(); }
    finally { clearTimeout(deadline); process.exitCode = code; }
  };
  process.once('SIGINT', () => { void shutdown(); }); process.once('SIGTERM', () => { void shutdown(); });
  try {
    const store = await Store.load(config.dataDir);
    const api = new StatusClient(config.apiBase);
    service = new MonitorService(store, api, new DiscordTransport(client), config);
    await service.recoverPending();
    client.on(Events.InteractionCreate, createHandler(client, api, service, config));
    client.on(Events.Error, () => console.error('Discord client error. Details suppressed to protect credentials.'));
    client.on(Events.ShardError, () => console.error('Discord gateway connection error; reconnecting automatically.'));
    client.once(Events.ClientReady, async ready => {
      console.log(`Ready as ${ready.user.tag}. Guilds: ${ready.guilds.cache.size}. Active monitors: ${store.list().filter(m => !m.paused).length}.`);
      ready.user.setActivity({ name: 'Minecraft · MCAPI.TR', type: ActivityType.Watching });
      healthTimer = setInterval(() => { void writeHealth(config.dataDir, client.isReady()).catch(() => console.error('Could not write health status.')); }, 15000);
      healthTimer.unref();
      await writeHealth(config.dataDir, true).catch(() => console.error('Could not write health status.'));
      service!.start();
    });
    await client.login(config.token);
  } catch (error) {
    console.error(error instanceof Error && /configuration|MCAPI_BASE_URL|monitor data|lock|process/.test(error.message) ? error.message : 'Startup failed. Check the token, Discord connectivity and DATA_DIR permissions.');
    await shutdown(1);
  }
}
void main().catch(() => { console.error('Startup failed before initialization. Check DATA_DIR and configuration.'); process.exitCode = 1; });
