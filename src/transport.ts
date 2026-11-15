import { ChannelType, PermissionFlagsBits, type Client, type TextChannel, type NewsChannel } from 'discord.js';
import { statusCard, alertCard } from './cards.js';
import { UserError, type Transport } from './service.js';
import type { Monitor, Observation } from './model.js';

export const requiredPermissions = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory];
export async function textChannel(client: Client, guildId: string, channelId: string): Promise<TextChannel | NewsChannel> {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !('guildId' in channel) || channel.guildId !== guildId || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) throw new UserError('channel');
  const text = channel as TextChannel | NewsChannel;
  const me = text.guild.members.me ?? await text.guild.members.fetchMe();
  if (!text.permissionsFor(me).has(requiredPermissions)) throw new UserError('channel');
  return text;
}
export class DiscordTransport implements Transport {
  constructor(private readonly client: Client) {}
  async send(m: Monitor, observation: Observation) {
    const channel = await textChannel(this.client, m.guildId, m.channelId);
    return (await channel.send(statusCard(m, observation))).id;
  }
  async edit(m: Monitor, observation: Observation) {
    const channel = await textChannel(this.client, m.guildId, m.channelId);
    const message = await channel.messages.fetch(m.messageId!);
    if (message.author.id !== this.client.user!.id) throw Object.assign(new Error('Message author mismatch'), { code: 50001 });
    await message.edit({ ...statusCard(m, observation), attachments: [] });
  }
  async alert(m: Monitor, online: boolean) {
    const channel = await textChannel(this.client, m.guildId, m.channelId); await channel.send(alertCard(m, online));
  }
  async delete(m: Monitor) {
    if (!m.messageId) return;
    const channel = await textChannel(this.client, m.guildId, m.channelId);
    const message = await channel.messages.fetch(m.messageId);
    if (message.author.id === this.client.user!.id) await message.delete();
  }
}
