import 'dotenv/config';
import { resolve } from 'node:path';
import { z } from 'zod';

const snowflake = z.string().regex(/^\d{17,20}$/);
const optionalId = z.preprocess((v) => (v === '' ? undefined : v), snowflake.optional());
const schema = z.object({
  DISCORD_TOKEN: z.string().min(30),
  DISCORD_CLIENT_ID: optionalId,
  DISCORD_GUILD_ID: optionalId,
  DEFAULT_LANGUAGE: z.enum(['en', 'tr']).default('en'),
  MCAPI_BASE_URL: z.url().default('https://mcapi.tr/api/v1'),
  POLL_INTERVAL_SECONDS: z.coerce.number().int().min(60).max(3600).default(120),
  MAX_MONITORS_PER_GUILD: z.coerce.number().int().min(1).max(25).default(5),
  MAX_MONITORS_TOTAL: z.coerce.number().int().min(1).max(100).default(50),
  DATA_DIR: z.string().min(1).default('./data'),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    // Never print zod input: it includes the Discord token.
    throw new Error(
      `Invalid configuration: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  }
  const c = result.data;
  const url = new URL(c.MCAPI_BASE_URL);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  ) {
    throw new Error('MCAPI_BASE_URL requires HTTPS (HTTP is allowed only for local tests).');
  }
  if (url.username || url.password || url.search || url.hash)
    throw new Error('MCAPI_BASE_URL must not contain credentials, a query or a fragment.');
  return {
    token: c.DISCORD_TOKEN,
    clientId: c.DISCORD_CLIENT_ID,
    guildId: c.DISCORD_GUILD_ID,
    language: c.DEFAULT_LANGUAGE,
    apiBase: c.MCAPI_BASE_URL.replace(/\/+$/, ''),
    pollMs: c.POLL_INTERVAL_SECONDS * 1000,
    perGuild: c.MAX_MONITORS_PER_GUILD,
    total: c.MAX_MONITORS_TOTAL,
    dataDir: resolve(c.DATA_DIR),
  };
}
export type Config = ReturnType<typeof loadConfig>;
