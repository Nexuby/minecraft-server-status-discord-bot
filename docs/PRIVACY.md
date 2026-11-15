# Data use

This is self-hosted software. The person operating an installation is responsible for its configuration and any notices required in their community.

## Local storage

- Discord guild, channel and bot-message IDs.
- Configured public Minecraft server addresses, display labels, edition and language.
- Monitor creation time, pause state and the last confirmed/candidate online state and observation timestamp.
- A local health file containing gateway readiness and a timestamp.

No message-content or member-list intent is requested. No Minecraft credentials, chat history or Discord member profiles are stored. User IDs are held briefly in memory for interaction cooldowns, and in the custom IDs of private monitor-list pagination buttons. Restarting the process clears cooldowns. The bot token remains an operator-managed environment secret.

## External services

Minecraft addresses are sent to MCAPI.TR through the `mcapitr` SDK for server-status checks. Public icon URLs are rendered by Discord; Discord may proxy/cache them. Discord receives commands, bot responses and status-card content. MCAPI may retain checks under its own [privacy policy](https://mcapi.tr/privacy). Removing a local monitor does not remove MCAPI records or Discord's independently retained data.

## Retention and deletion

Local monitor configuration remains until a manager removes that monitor. Removing it also attempts to delete the bot's status message, but cannot guarantee removal if Discord permissions or the channel are unavailable. Operators control local backups and runtime logs. Deleting a Discord guild does not itself promise automatic erasure of local configuration; operators can remove obsolete entries with the bot stopped, keeping valid JSON, or delete the relevant installation's data if no longer needed.

Application logs deliberately avoid raw SDK/Discord error payloads, tokens and message content. Do not attach `.env`, the data directory or unredacted screenshots to public issues.
