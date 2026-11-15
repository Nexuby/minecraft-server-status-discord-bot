import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, escapeMarkdown } from 'discord.js';
import MCAPITR from 'mcapitr';
import { copy } from './i18n.js';
import type { Edition, Language, Monitor, Observation } from './model.js';

const publicMedia = new MCAPITR();
export const noMentions = { parse: [] as [] };
export function safeText(value: string, limit = 500): string {
  return escapeMarkdown(value.replace(/§[0-9a-fk-orx]/gi, '').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').replace(/@/g, '@\u200b').trim()).slice(0, limit);
}
type CardTarget = { address: string; edition: Edition; language: Language; label: string; id?: string; paused?: boolean };
export function statusCard(target: CardTarget, observation: Observation) {
  const t = copy(target.language);
  const s = observation.kind === 'status' ? observation.status : null;
  const title = !s ? t.unavailable : s.stale ? t.stale : s.online ? t.online : t.offline;
  const color = !s || s.stale ? 0xefa83b : s.online ? 0x10b981 : 0xef5350;
  const embed = new EmbedBuilder().setColor(color)
    .setAuthor({ name: `${target.edition === 'bedrock' ? 'Bedrock Edition' : target.edition === 'legacy' ? 'Java · Legacy' : 'Java Edition'}${target.paused ? ` · ${t.pausedLabel}` : ''}` })
    .setTitle(safeText(target.label, 100))
    .setDescription(`**${title}**\n\`${target.address}\`\n\n${!s ? t.unavailableNote : s.stale ? `${t.staleNote}\n\n${safeText(s.motd || t.noMotd, 650)}` : s.online ? safeText(s.motd || t.noMotd, 650) : t.offlineNote}`)
    .setFooter({ text: t.source });
  if (s && (s.online || s.stale)) {
    const n = new Intl.NumberFormat(target.language === 'tr' ? 'tr-TR' : 'en-US');
    embed.addFields(
      { name: t.players, value: s.players === null ? t.unknown : `**${n.format(s.players)}** / ${s.maxPlayers === null ? '—' : n.format(s.maxPlayers)}`, inline: true },
      { name: t.version, value: safeText(s.version || t.unknown, 150), inline: true },
      { name: t.latency, value: s.latency === null ? t.unknown : `${n.format(Math.round(s.latency))} ms`, inline: true },
    );
    // URL generation is handled by mcapitr; Discord fetches the public image.
    embed.setThumbnail(publicMedia.serverIcon(target.address, { bedrock: target.edition === 'bedrock', legacy: target.edition === 'legacy', size: 128, format: 'png' }));
  }
  if (s?.checkedAt) {
    const seconds = Math.floor(Date.parse(s.checkedAt) / 1000);
    embed.addFields({ name: t.measured, value: `<t:${seconds}:R>`, inline: false }).setTimestamp(new Date(s.checkedAt));
  } else if (s) embed.addFields({ name: t.measured, value: t.missingTime });
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (target.id) row.addComponents(
    new ButtonBuilder().setCustomId(`refresh:${target.id}`).setLabel(t.refresh).setStyle(ButtonStyle.Secondary).setDisabled(target.paused ?? false),
    new ButtonBuilder().setCustomId(`address:${target.id}`).setLabel(t.copy).setStyle(ButtonStyle.Secondary),
  );
  row.addComponents(new ButtonBuilder().setURL('https://mcapi.tr').setLabel(t.website).setStyle(ButtonStyle.Link));
  return { embeds: [embed], components: [row], allowedMentions: noMentions };
}

export function alertCard(m: Monitor, online: boolean) {
  const t = copy(m.language);
  return { embeds: [new EmbedBuilder().setColor(online ? 0x10b981 : 0xef5350)
    .setTitle(online ? t.alertOnline : t.alertOffline)
    .setDescription(`**${safeText(m.label, 100)}**\n\`${m.address}\`\n\n${t.alertNote}`)
    .setFooter({ text: t.source }).setTimestamp()], allowedMentions: noMentions };
}

export function monitorList(items: Monitor[], language: Language, userId: string, requestedPage = 0) {
  const t = copy(language);
  if (!items.length) return { content: t.empty, embeds: [], components: [], allowedMentions: noMentions };
  const last = Math.ceil(items.length / 5) - 1;
  const page = Math.max(0, Math.min(Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0, last));
  const embed = new EmbedBuilder().setColor(0x10b981).setTitle(t.listTitle)
    .setDescription(items.slice(page * 5, page * 5 + 5).map(m => `**${safeText(m.label, 80)}** · ${m.paused ? t.pausedLabel : t.activeLabel}\n\`${m.address}\` · <#${m.channelId}>\n\`${m.id}\``).join('\n\n'))
    .setFooter({ text: `${page + 1} / ${last + 1}` });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`list:${page - 1}:${userId}`).setLabel(t.previous).setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`list:${page + 1}:${userId}`).setLabel(t.next).setStyle(ButtonStyle.Secondary).setDisabled(page === last),
  );
  return { content: '', embeds: [embed], components: last ? [row] : [], allowedMentions: noMentions };
}
