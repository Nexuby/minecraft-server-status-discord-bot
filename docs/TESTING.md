# Testing and evidence

## Repeatable checks

- `npm run check`: strict TypeScript validation.
- `npm test`: controlled SDK, persistent-store, card, service and interaction tests. No token or network access required.
- `npm run test:coverage`: V8 coverage; inspect uncovered branches rather than treating the percentage as proof of live operation.
- `npm run build`: production JavaScript build.
- `npm run format:check`: source/document formatting.
- `npm run secrets:check`: tracked files, staged contents and reachable Git history checked for Discord-token patterns and private environment files. This complements, but does not replace, careful review.
- `npm audit --omit=dev --audit-level=high`: production dependency advisory check.

## Live smoke

`npm run smoke` uses your local `.env`. It queries `mc.hypixel.net` (Java) and `play.cubecraft.net:19132` (Bedrock) with the actual `mcapitr` SDK, checks the Discord application's identity, connects to the Discord gateway with only the Guilds intent, waits for Ready and disconnects. These public servers are third-party fixtures and may change or be unavailable.

It does not post messages, edit existing messages, deploy commands or create monitors. It must be run separately from your continuously running bot instance.

## Discord acceptance checklist

Use a private test server/channel with an operator-controlled bot:

1. Register guild commands with `DISCORD_GUILD_ID` and `npm run deploy`.
2. Use `/status` for Java and Bedrock; ensure the default response is private.
3. Create a monitor, verify that the same message ID changes, then restart the bot and confirm it is reused.
4. Use Refresh and Server address as a normal member. Management commands must remain unavailable/rejected without Manage Server.
5. Pause, resume and remove a monitor. A deleted status message must not be automatically reposted.
6. Test notifications with an operator-controlled Minecraft server. Two distinct fresh API observations are required; repeatedly returned cached data must not trigger an alert.
7. Remove Send Messages permission and confirm the monitor pauses. Restore permissions and resume it.
8. Check the Turkish and English command/card variants.

Controlled automated tests exercise equivalent failure paths; they are not a claim that every Discord UI interaction above was manually executed.

## First implementation validation

On 15 November 2026, the actual SDK returned fresh online results for the Java and Bedrock smoke fixtures, and the supplied local bot credential authenticated and reached Discord Gateway Ready. The smoke session disconnected without sending messages. Exact counts are intentionally omitted because they are transient.

See GitHub Actions for independent Node.js 22/24 and Docker build results. A committed workflow alone does not establish a passing remote run.
