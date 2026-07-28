'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../../shared/db');

const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

module.exports = [
  {
    data: new SlashCommandBuilder().setName('avatar').setDescription('Аватар пользователя')
      .addUserOption((o) => o.setName('user').setDescription('Чей аватар')),
    async execute(interaction) {
      const user = interaction.options.getUser('user') || interaction.user;
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(`Аватар ${user.tag}`).setImage(user.displayAvatarURL({ size: 512 }));
      await interaction.reply({ embeds: [embed] });
    }
  },
  {
    data: new SlashCommandBuilder().setName('membercount').setDescription('Количество участников'),
    async execute(interaction) {
      await interaction.reply(`👥 На сервере **${interaction.guild.memberCount}** участников.`);
    }
  },
  {
    data: new SlashCommandBuilder().setName('staffstats').setDescription('Актив администратора')
      .addUserOption((o) => o.setName('user').setDescription('Чей актив').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const counts = await db.countActionsByModerator(interaction.guild.id, user.id);
      const label = { ban: 'Баны', mute: 'Муты', kick: 'Кики', warn: 'Варны', unban: 'Разбаны', unmute: 'Размуты', anticrash: 'Anti-Crash' };
      const lines = Object.keys(counts).length
        ? Object.entries(counts).map(([t, c]) => `${label[t] || t}: **${c}**`).join('\n')
        : 'Нет зафиксированных действий.';
      const embed = new EmbedBuilder().setColor(0x5865f2)
        .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
        .setTitle('👮 Актив администратора').setDescription(lines);
      await interaction.reply({ embeds: [embed] });
    }
  },
  {
    data: new SlashCommandBuilder().setName('role').setDescription('Выдать/снять роль участнику')
      .addUserOption((o) => o.setName('user').setDescription('Кому').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Какая роль').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const role = interaction.options.getRole('role');
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: 'Участник не найден.', ephemeral: true });
      if (role.position >= interaction.guild.members.me.roles.highest.position) {
        return interaction.reply({ content: 'Эта роль выше моей — не могу её выдавать.', ephemeral: true });
      }
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role.id).catch(() => {});
        return interaction.reply(`➖ Снял роль ${role.name} у ${user.tag}.`);
      }
      await member.roles.add(role.id).catch(() => {});
      return interaction.reply(`➕ Выдал роль ${role.name} для ${user.tag}.`);
    }
  },
  {
    data: new SlashCommandBuilder().setName('lock').setDescription('Закрыть текущий канал для @everyone')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction) {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false }).catch(() => {});
      await interaction.reply('🔒 Канал закрыт.');
    }
  },
  {
    data: new SlashCommandBuilder().setName('unlock').setDescription('Открыть текущий канал для @everyone')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction) {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null }).catch(() => {});
      await interaction.reply('🔓 Канал открыт.');
    }
  },
  {
    data: new SlashCommandBuilder().setName('slowmode').setDescription('Медленный режим канала')
      .addIntegerOption((o) => o.setName('seconds').setDescription('Секунды (0 = выкл)').setRequired(true).setMinValue(0).setMaxValue(21600))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction) {
      const sec = interaction.options.getInteger('seconds');
      await interaction.channel.setRateLimitPerUser(sec).catch(() => {});
      await interaction.reply(sec ? `🐌 Медленный режим: **${sec} сек**.` : '⚡ Медленный режим выключен.');
    }
  },
  {
    data: new SlashCommandBuilder().setName('poll').setDescription('Создать опрос')
      .addStringOption((o) => o.setName('question').setDescription('Вопрос').setRequired(true))
      .addStringOption((o) => o.setName('options').setDescription('Варианты через | (пусто = 👍/👎)')),
    async execute(interaction) {
      const question = interaction.options.getString('question');
      const options = (interaction.options.getString('options') || '').split('|').map((s) => s.trim()).filter(Boolean).slice(0, 10);
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('📊 ' + question.slice(0, 256))
        .setFooter({ text: `Опрос от ${interaction.user.tag}` });
      if (options.length) embed.setDescription(options.map((o, i) => `${NUM[i]} ${o}`).join('\n'));
      await interaction.reply({ embeds: [embed] });
      const msg = await interaction.fetchReply();
      if (options.length) { for (let i = 0; i < options.length; i++) await msg.react(NUM[i]).catch(() => {}); }
      else { await msg.react('👍').catch(() => {}); await msg.react('👎').catch(() => {}); }
    }
  },
  {
    data: new SlashCommandBuilder().setName('nick').setDescription('Сменить ник участнику')
      .addUserOption((o) => o.setName('user').setDescription('Кому').setRequired(true))
      .addStringOption((o) => o.setName('nickname').setDescription('Новый ник (пусто = сброс)'))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const nick = interaction.options.getString('nickname') || null;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: 'Участник не найден.', ephemeral: true });
      const ok = await member.setNickname(nick).then(() => true).catch(() => false);
      if (!ok) return interaction.reply({ content: 'Не удалось сменить ник (роль выше моей?).', ephemeral: true });
      await interaction.reply(nick ? `✏️ Ник ${user.tag} изменён на **${nick}**.` : `✏️ Ник ${user.tag} сброшен.`);
    }
  },
  {
    data: new SlashCommandBuilder().setName('say').setDescription('Сказать от имени бота')
      .addStringOption((o) => o.setName('text').setDescription('Текст').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
      const text = interaction.options.getString('text').slice(0, 2000);
      await interaction.channel.send({ content: text, allowedMentions: { parse: [] } });
      await interaction.reply({ content: '✅ Отправлено.', ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder().setName('embed').setDescription('Отправить embed от имени бота')
      .addStringOption((o) => o.setName('title').setDescription('Заголовок').setRequired(true))
      .addStringOption((o) => o.setName('description').setDescription('Описание'))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(interaction.options.getString('title').slice(0, 256));
      const desc = interaction.options.getString('description');
      if (desc) embed.setDescription(desc.slice(0, 4000));
      await interaction.channel.send({ embeds: [embed] });
      await interaction.reply({ content: '✅ Отправлено.', ephemeral: true });
    }
  }
];
