'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../../shared/db');
const xpService = require('../../services/xp');

function xpEmbed(user, row, settings) {
  db.setXpFormula(settings.xp.levelBaseXp, settings.xp.levelExponent);
  const level = db.xpToLevel(Number(row.xp || 0));
  const nextAt = db.levelToXp(level + 1);
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
    .addFields(
      { name: 'XP', value: `${row.xp || 0}`, inline: true },
      { name: 'Уровень', value: `${level}`, inline: true },
      { name: 'До следующего', value: `${Math.max(0, nextAt - Number(row.xp || 0))} XP`, inline: true }
    );
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('xp')
      .setDescription('Показать свой XP или XP пользователя')
      .addUserOption((o) => o.setName('user').setDescription('Чей XP показать')),
    async execute(interaction) {
      const user = interaction.options.getUser('user') || interaction.user;
      const settings = await db.getSettings(interaction.guild.id);
      const row = await db.getXp(interaction.guild.id, user.id);
      await interaction.reply({ embeds: [xpEmbed(user, row, settings)] });
    }
  },
  {
    data: new SlashCommandBuilder().setName('leaderxp').setDescription('Топ 10 по XP'),
    async execute(interaction) {
      const top = await db.topXp(interaction.guild.id, 10);
      if (!top.length) return interaction.reply('Пока никто не набрал XP.');
      const lines = top.map((r, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
        return `${medal} <@${r.user_id}> — **${r.xp}** XP (ур. ${r.level})`;
      });
      const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle('🏆 Топ по XP').setDescription(lines.join('\n'));
      await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('setxp').setDescription('Заменить XP пользователю (админ)')
      .addUserOption((o) => o.setName('user').setDescription('Кому').setRequired(true))
      .addIntegerOption((o) => o.setName('amount').setDescription('Новое значение').setRequired(true).setMinValue(0))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const value = interaction.options.getInteger('amount');
      const settings = await db.getSettings(interaction.guild.id);
      const res = await xpService.setXp(interaction.guild, settings, user.id, value, 'setxp', interaction.user.id);
      await interaction.reply(`✅ XP ${user.tag} теперь **${res.row.xp}** (ур. ${res.row.level}).`);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('addxp').setDescription('Добавить XP (админ)')
      .addUserOption((o) => o.setName('user').setDescription('Кому').setRequired(true))
      .addIntegerOption((o) => o.setName('amount').setDescription('Сколько добавить').setRequired(true).setMinValue(1))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      const settings = await db.getSettings(interaction.guild.id);
      const res = await xpService.changeXp(interaction.guild, settings, user.id, amount, 'addxp', interaction.user.id);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (res.leveledUp && member) await xpService.announceLevelUp(interaction.guild, settings, member, interaction.channel, res.newLevel);
      await interaction.reply(`✅ Добавлено **${amount}** XP. Теперь у ${user.tag}: **${res.row.xp}** (ур. ${res.row.level}).`);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('removexp').setDescription('Убрать XP (админ)')
      .addUserOption((o) => o.setName('user').setDescription('У кого').setRequired(true))
      .addIntegerOption((o) => o.setName('amount').setDescription('Сколько снять').setRequired(true).setMinValue(1))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      const settings = await db.getSettings(interaction.guild.id);
      const res = await xpService.changeXp(interaction.guild, settings, user.id, -amount, 'removexp', interaction.user.id);
      await interaction.reply(`✅ Снято **${amount}** XP. Теперь у ${user.tag}: **${res.row.xp}** (ур. ${res.row.level}).`);
    }
  }
];
