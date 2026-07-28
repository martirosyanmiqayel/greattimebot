'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../../shared/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist').setDescription('Доверенные пользователи Anti-Crash')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('add').setDescription('Добавить в whitelist')
      .addUserOption((o) => o.setName('user').setDescription('Кого').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Убрать из whitelist')
      .addUserOption((o) => o.setName('user').setDescription('Кого').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Показать whitelist')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') {
      const user = interaction.options.getUser('user');
      await db.whitelistAdd(interaction.guild.id, user.id, interaction.user.id);
      return interaction.reply(`✅ ${user.tag} добавлен в whitelist Anti-Crash.`);
    }
    if (sub === 'remove') {
      const user = interaction.options.getUser('user');
      const n = await db.whitelistRemove(interaction.guild.id, user.id);
      return interaction.reply(n ? `🗑️ ${user.tag} убран из whitelist.` : 'Этого пользователя нет в whitelist.');
    }
    const rows = await db.whitelistList(interaction.guild.id);
    if (!rows.length) return interaction.reply('Whitelist пуст.');
    const desc = rows.map((r) => `• <@${r.user_id}>`).join('\n');
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setTitle('✅ Whitelist Anti-Crash').setDescription(desc)], allowedMentions: { parse: [] } });
  }
};
