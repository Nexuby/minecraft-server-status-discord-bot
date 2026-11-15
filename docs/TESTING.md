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

## Opt-in real channel test

Unlike `npm run smoke`, this test **posts and later deletes two status cards** in the explicitly selected channel. Use a test server you control. It never changes Discord permissions or deletes unrelated messages. No destination IDs or credentials are hardcoded in the script.

Stop all instances of this bot first, then run:

```sh
npm run smoke:channel -- --step prepare --guild YOUR_GUILD_ID --channel YOUR_CHANNEL_ID --data-dir .local/channel-test
npm run smoke:channel -- --step verify --guild YOUR_GUILD_ID --channel YOUR_CHANNEL_ID --data-dir .local/channel-test
```

`prepare` requires an empty isolated data directory and creates a Turkish Java card and an English Bedrock card using real SDK data. The manifest records only the two test monitors. `verify` reloads them, edits the same messages, checks card components, exercises pause/resume and rejects duplicate and cross-guild access.

For restart and button testing, run the normal bot with `DATA_DIR` pointing to that same test directory. For example, in PowerShell:

```powershell
$env:DATA_DIR = '.local/channel-test'
npm start
```

Use the cards' buttons in Discord. Stop the bot before running `verify` again or cleaning up:

```sh
npm run smoke:channel -- --step cleanup --guild YOUR_GUILD_ID --channel YOUR_CHANNEL_ID --data-dir .local/channel-test
```

Cleanup validates the saved bot, guild, channel and message ownership, removes only the two recorded test monitors, then confirms Discord returns Unknown Message for each deleted card. The local manifest remains as test evidence. Do not point this workflow at a production data directory.

### Live channel acceptance, 15 November 2026

With explicit permission in an operator-provided test channel:

- A real `/status` invocation returned a Turkish Java card as an ephemeral response.
- Two persistent Java/Bedrock cards were posted with real `mcapitr` results, rendered icons, localized fields and three buttons.
- The service updated those same message IDs, paused/resumed both monitors, rejected duplicate creation and rejected cross-guild lookup.
- The production entrypoint was stopped and restarted with the isolated directory; both monitors were loaded and their original cards continued updating.
- A real non-manager account received the private server-address response and used Refresh successfully. The actual interaction was acknowledged and the private success message was observed. Management commands were not visible to that account; its permissions were left unchanged.
- Both test cards were removed afterward. Discord returned Unknown Message for their exact IDs, and the isolated monitor store was empty. No unrelated messages were removed.

These checks do not claim a manual manager-command session, a real Minecraft server shutdown/recovery notification, or a live change to Discord channel permissions. Those paths remain covered by controlled automated tests and the acceptance checklist above.
