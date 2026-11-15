# Security

Send security reports to **info@nexuby.net.tr**. Include affected version, a minimal reproduction and impact. Do not create a public issue containing credentials, private server data or an exploit against someone else's installation.

Bot operators should keep `.env` private, use a dedicated Discord application, grant only the documented permissions, keep dependencies updated and back up the local data directory. If a token is exposed, reset it in Discord Developer Portal and update `.env`; removing a token from the latest commit does not remove it from Git history.

The project includes a conservative token-pattern scan for tracked/staged files and reachable commits. No scanner guarantees detection of every type of secret. Public Minecraft addresses and configured labels are untrusted input; embeds escape formatting and suppress mentions. Never add token values or raw SDK/Discord response objects to logs.
