import { EmbedBuilder, MessageFlags, PermissionFlagsBits, type Client, type Interaction } from 'discord.js';
import type { StatusClient } from './api.js';
import { monitorList, noMentions, statusCard } from './cards.js';
import type { Config } from './config.js';
import { copy, languageFor } from './i18n.js';
import { normalizeAddress, type Edition, type Language } from './model.js';
import { MonitorService, UserError } from './service.js';
import { textChannel } from './transport.js';

export class Cooldowns {
  private readonly entries = new Map<string, number>();
  constructor(private readonly now = Date.now) {}
  take(key: string, ms: number) {
    const now = this.now(); if ((this.entries.get(key) ?? 0) > now) return false;
    if (this.entries.size > 10000) { for (const [k, expires] of this.entries) if (expires <= now) this.entries.delete(k); }
    if (this.entries.size > 20000) return false;
    this.entries.set(key, now + ms); return true;
  }
}

export function createHandler(client: Client, api: StatusClient, service: MonitorService, config: Config) {
  const cooldown = new Cooldowns();
  return async (interaction: Interaction) => {
    const language = languageFor(interaction.locale, config.language);
    const t = copy(language);
    try {
      if (interaction.isAutocomplete()) {
        if (!interaction.guildId || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) { await interaction.respond([]); return; }
        const q = interaction.options.getFocused().toLowerCase();
        await interaction.respond(service.store.list(interaction.guildId).filter(m => `${m.label} ${m.address} ${m.id}`.toLowerCase().includes(q)).slice(0, 25)
          .map(m => ({ name: `${m.label} · ${m.address} · ${m.paused ? t.pausedLabel : t.activeLabel}`.slice(0, 100), value: m.id })));
        return;
      }
      if (!interaction.isChatInputCommand() && !interaction.isButton()) return;
      if (!interaction.guildId) return;
      if (!cooldown.take(interaction.user.id, 3000)) { await interaction.reply({ content: t.slowDown, flags: MessageFlags.Ephemeral, allowedMentions: noMentions }); return; }
      if (interaction.isButton()) {
        if (interaction.customId.startsWith('list:')) {
          const [, page, owner] = interaction.customId.split(':');
          if (owner !== interaction.user.id || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new UserError('permission');
          await interaction.update(monitorList(service.store.list(interaction.guildId), language, interaction.user.id, Number(page))); return;
        }
        const [action, id] = interaction.customId.split(':');
        if (!id || !['refresh', 'address'].includes(action!)) return;
        const m = service.find(id, interaction.guildId);
        if (m.channelId !== interaction.channelId || m.messageId !== interaction.message.id) throw new UserError('gone');
        if (action === 'address') { await interaction.reply({ content: `\`${m.address}\``, flags: MessageFlags.Ephemeral, allowedMentions: noMentions }); return; }
        if (m.paused) throw new UserError('paused');
        if (!cooldown.take(`monitor:${id}`, 30000)) throw new UserError('slowDown');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await service.refresh(id);
        await interaction.editReply(t.refreshed); return;
      }
      const command = interaction.commandName;
      const isPublic = command === 'status' && interaction.options.getBoolean('public') === true;
      await interaction.deferReply(isPublic ? {} : { flags: MessageFlags.Ephemeral });
      if (command === 'status') {
        let address: string;
        try { address = normalizeAddress(interaction.options.getString('address', true)); } catch { throw new UserError('invalidAddress'); }
        const edition = (interaction.options.getString('edition') ?? 'java') as Edition;
        const result = await api.get(address, edition);
        await interaction.editReply(statusCard({ address, edition, language, label: address }, result)); return;
      }
      if (command === 'help' || command === 'about') {
        const embed = new EmbedBuilder().setColor(0x10b981).setTitle(command === 'help' ? t.helpTitle : 'Minecraft Server Status · MCAPI.TR')
          .setDescription(command === 'help' ? t.help : t.about).setFooter({ text: t.source });
        if (command === 'about') embed.addFields({ name: t.minutes, value: `${config.pollMs / 1000} ${t.seconds}`, inline: true }, { name: t.data, value: t.dataNote });
        await interaction.editReply({ embeds: [embed], allowedMentions: noMentions }); return;
      }
      if (command !== 'monitor') return;
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new UserError('permission');
      const sub = interaction.options.getSubcommand();
      if (sub === 'list') {
        await interaction.editReply(monitorList(service.store.list(interaction.guildId), language, interaction.user.id)); return;
      }
      if (sub === 'add') {
        let address: string; try { address = normalizeAddress(interaction.options.getString('address', true)); } catch { throw new UserError('invalidAddress'); }
        const channelId = interaction.options.getChannel('channel', true).id;
        await textChannel(client, interaction.guildId, channelId);
        const m = await service.add({ guildId: interaction.guildId, channelId, address,
          edition: (interaction.options.getString('edition') ?? 'java') as Edition,
          label: interaction.options.getString('name')?.trim() || address.slice(0, 80),
          language: (interaction.options.getString('language') ?? language) as Language,
          alerts: interaction.options.getBoolean('alerts') ?? false });
        await interaction.editReply({ content: `${t.add}\nhttps://discord.com/channels/${m.guildId}/${m.channelId}/${m.messageId}\nID: \`${m.id}\``, allowedMentions: noMentions }); return;
      }
      const id = interaction.options.getString('id', true);
      if (sub === 'remove') await service.remove(id, interaction.guildId);
      else await service.pause(id, interaction.guildId, sub === 'pause');
      await interaction.editReply(sub === 'remove' ? t.removed : sub === 'pause' ? t.paused : t.resumed);
    } catch (error) {
      if (error instanceof UserError === false) console.error('Interaction failed; check permissions, API availability and local storage. Raw errors are suppressed to protect credentials.');
      const content = error instanceof UserError ? t[error.key] : t.failed;
      if (interaction.isRepliable()) {
        try { if (interaction.deferred || interaction.replied) await interaction.editReply({ content, embeds: [], components: [], allowedMentions: noMentions });
          else await interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: noMentions }); }
        catch { console.error('Could not acknowledge an interaction.'); }
      }
    }
  };
}
