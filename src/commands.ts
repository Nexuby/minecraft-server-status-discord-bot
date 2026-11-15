import {
  ChannelType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

const editions = [
  { name: 'Java', value: 'java' },
  { name: 'Bedrock', value: 'bedrock' },
  { name: 'Legacy Java', value: 'legacy' },
];
export const commands = [
  new SlashCommandBuilder()
    .setName('status')
    .setNameLocalization('tr', 'durum')
    .setDescription('Check a Minecraft server.')
    .setDescriptionLocalization('tr', 'Bir Minecraft sunucusunun durumunu sorgula.')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName('address')
        .setNameLocalization('tr', 'adres')
        .setDescription('Hostname or IP, optionally with a port.')
        .setDescriptionLocalization('tr', 'Alan adı veya IP; istersen port ekleyebilirsin.')
        .setRequired(true)
        .setMaxLength(253),
    )
    .addStringOption((o) =>
      o
        .setName('edition')
        .setNameLocalization('tr', 'surum')
        .setDescription('Defaults to Java.')
        .setDescriptionLocalization('tr', 'Varsayılan: Java.')
        .addChoices(...editions),
    )
    .addBooleanOption((o) =>
      o
        .setName('public')
        .setNameLocalization('tr', 'herkese-acik')
        .setDescription('Share the response with this channel.')
        .setDescriptionLocalization('tr', 'Yanıtı bu kanaldaki herkes görsün.'),
    ),
  new SlashCommandBuilder()
    .setName('monitor')
    .setNameLocalization('tr', 'takip')
    .setDescription('Manage automatically updated Minecraft status cards.')
    .setDescriptionLocalization('tr', 'Otomatik güncellenen Minecraft durum kartlarını yönet.')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('add')
        .setNameLocalization('tr', 'ekle')
        .setDescription('Create a status card.')
        .setDescriptionLocalization('tr', 'Durum kartı oluştur.')
        .addStringOption((o) =>
          o
            .setName('address')
            .setNameLocalization('tr', 'adres')
            .setDescription('Hostname or IP, optionally with a port.')
            .setRequired(true)
            .setMaxLength(253),
        )
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setNameLocalization('tr', 'kanal')
            .setDescription('Channel for the status card and optional alerts.')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addStringOption((o) =>
          o
            .setName('edition')
            .setNameLocalization('tr', 'surum')
            .setDescription('Defaults to Java.')
            .addChoices(...editions),
        )
        .addStringOption((o) =>
          o
            .setName('name')
            .setNameLocalization('tr', 'baslik')
            .setDescription('Display name (defaults to the address).')
            .setMaxLength(80),
        )
        .addStringOption((o) =>
          o
            .setName('language')
            .setNameLocalization('tr', 'dil')
            .setDescription('Language of the persistent card.')
            .addChoices({ name: 'English', value: 'en' }, { name: 'Türkçe', value: 'tr' }),
        )
        .addBooleanOption((o) =>
          o
            .setName('alerts')
            .setNameLocalization('tr', 'bildirim')
            .setDescription('Notify this channel about confirmed online/offline changes.'),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('list')
        .setNameLocalization('tr', 'liste')
        .setDescription('List monitors and their IDs.')
        .setDescriptionLocalization('tr', 'Takipleri ve kimliklerini listele.'),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setNameLocalization('tr', 'kaldir')
        .setDescription('Remove a monitor and its card.')
        .setDescriptionLocalization('tr', 'Takibi ve kartını kaldır.')
        .addStringOption((o) =>
          o
            .setName('id')
            .setDescription('Monitor ID from /monitor list.')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('pause')
        .setNameLocalization('tr', 'duraklat')
        .setDescription('Pause updates and alerts.')
        .setDescriptionLocalization('tr', 'Güncellemeleri ve bildirimleri duraklat.')
        .addStringOption((o) =>
          o
            .setName('id')
            .setDescription('Monitor ID from /monitor list.')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('resume')
        .setNameLocalization('tr', 'devam')
        .setDescription('Resume a paused monitor.')
        .setDescriptionLocalization('tr', 'Duraklatılan takibi devam ettir.')
        .addStringOption((o) =>
          o
            .setName('id')
            .setDescription('Monitor ID from /monitor list.')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName('help')
    .setNameLocalization('tr', 'yardim')
    .setDescription('Commands and setup information.')
    .setDescriptionLocalization('tr', 'Komutlar ve kurulum bilgileri.')
    .setContexts(InteractionContextType.Guild),
  new SlashCommandBuilder()
    .setName('about')
    .setNameLocalization('tr', 'hakkinda')
    .setDescription('About this bot and MCAPI.TR.')
    .setDescriptionLocalization('tr', 'Bot ve MCAPI.TR hakkında.')
    .setContexts(InteractionContextType.Guild),
].map((command) => command.toJSON());
