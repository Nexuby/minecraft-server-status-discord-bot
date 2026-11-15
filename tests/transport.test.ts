import { describe, expect, it, vi } from 'vitest';
import { ChannelType, type Client } from 'discord.js';
import { DiscordTransport, requiredPermissions, textChannel } from '../src/transport.js';
import { monitor, observation } from './fixtures.js';

export function clientFixture() {
  const m = monitor();
  const message = {
    id: m.messageId,
    author: { id: '423456789012345678' },
    edit: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const channel = {
    guildId: m.guildId,
    type: ChannelType.GuildText,
    guild: { members: { me: { id: '423456789012345678' }, fetchMe: vi.fn() } },
    permissionsFor: vi.fn().mockReturnValue({ has: vi.fn().mockReturnValue(true) }),
    send: vi.fn().mockResolvedValue(message),
    messages: { fetch: vi.fn().mockResolvedValue(message) },
  };
  const client = {
    channels: { fetch: vi.fn().mockResolvedValue(channel) },
    user: { id: message.author.id },
  } as unknown as Client;
  return { client, channel, message, m };
}
describe('Discord transport', () => {
  it('posts once, edits that message, sends a bounded alert and deletes its own card', async () => {
    const { client, channel, message, m } = clientFixture();
    const transport = new DiscordTransport(client);
    expect(await transport.send(m, observation())).toBe(m.messageId);
    await transport.edit(m, observation());
    expect(channel.messages.fetch).toHaveBeenCalledWith(m.messageId);
    expect(message.edit).toHaveBeenCalledWith(expect.objectContaining({ attachments: [] }));
    await transport.alert(m, true);
    expect(channel.send).toHaveBeenCalledTimes(2);
    await transport.delete(m);
    expect(message.delete).toHaveBeenCalledTimes(1);
    expect(channel.permissionsFor).toHaveBeenCalled();
    expect(requiredPermissions).toHaveLength(5);
  });
  it('rejects cross-guild, missing and unsupported channels', async () => {
    const { client, channel, m } = clientFixture();
    await expect(textChannel(client, '999999999999999999', m.channelId)).rejects.toMatchObject({
      key: 'channel',
    });
    channel.type = ChannelType.GuildVoice;
    await expect(textChannel(client, m.guildId, m.channelId)).rejects.toThrow();
    vi.mocked(client.channels.fetch).mockResolvedValue(null);
    await expect(textChannel(client, m.guildId, m.channelId)).rejects.toThrow();
  });
  it('rejects missing channel permissions and fetches its guild member if uncached', async () => {
    const { client, channel, m } = clientFixture();
    channel.guild.members.me = null as never;
    channel.guild.members.fetchMe.mockResolvedValue({ id: client.user!.id });
    channel.permissionsFor.mockReturnValue({ has: vi.fn().mockReturnValue(false) });
    await expect(textChannel(client, m.guildId, m.channelId)).rejects.toMatchObject({
      key: 'channel',
    });
    expect(channel.guild.members.fetchMe).toHaveBeenCalledTimes(1);
  });
  it('never edits or deletes another author’s message', async () => {
    const { client, message, m } = clientFixture();
    message.author.id = '999999999999999999';
    const transport = new DiscordTransport(client);
    await expect(transport.edit(m, observation())).rejects.toMatchObject({ code: 50001 });
    await transport.delete(m);
    expect(message.delete).not.toHaveBeenCalled();
    await transport.delete({ ...m, messageId: null });
  });
});
