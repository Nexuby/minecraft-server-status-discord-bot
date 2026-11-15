# Contributing

Use Node.js 22.17+ and `npm ci`. Run `npm run verify`, `npm run format:check` and `npm run secrets:check` before opening a pull request. Live credentials are unnecessary for ordinary tests.

Keep Minecraft status requests behind the official `mcapitr` SDK. Do not introduce a second ping implementation or a silent fallback provider. Add tests for observable behavior: failures must not fabricate offline results, notifications must use distinct fresh observations, and permissions must be checked at runtime.

Keep English and Turkish copy aligned. Stay inside Discord's embed, component and interaction-time limits. Preserve the single-process storage model unless changing it deliberately with a documented migration.

Never commit `.env`, tokens, private logs or live guild data. Use fixtures with invented IDs. Report vulnerabilities privately as described in SECURITY.md.
