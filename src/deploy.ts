import {
  REST,
  Routes,
  type RESTGetCurrentApplicationResult,
  type RESTGetAPIGuildResult,
} from 'discord.js';
import { commands } from './commands.js';
import { loadConfig } from './config.js';

async function deploy() {
  const config = loadConfig();
  const rest = new REST({ version: '10', timeout: 15000, retries: 2 }).setToken(config.token);
  const app = (await rest.get(
    Routes.oauth2CurrentApplication(),
  )) as RESTGetCurrentApplicationResult;
  if (config.clientId && config.clientId !== app.id)
    throw new Error('DISCORD_CLIENT_ID does not match the authenticated bot.');
  const route = config.guildId
    ? Routes.applicationGuildCommands(app.id, config.guildId)
    : Routes.applicationCommands(app.id);
  if (config.guildId) (await rest.get(Routes.guild(config.guildId))) as RESTGetAPIGuildResult;
  // Upsert our four commands; never bulk-delete unrelated application commands.
  for (const command of commands) await rest.post(route, { body: command });
  console.log(
    `Registered ${commands.length} commands for ${app.name} (${config.guildId ? 'development guild' : 'global'}).`,
  );
}
void deploy().catch(() => {
  console.error(
    'Command deployment failed. Check the token, application ID and bot membership in DISCORD_GUILD_ID. No credentials were logged.',
  );
  process.exitCode = 1;
});
