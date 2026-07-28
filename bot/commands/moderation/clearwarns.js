'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../../shared/db');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Очистить все предупреждения участника')
    .addUserOption((o) => o.setName('user').setDescription('Кому').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const removed = await db.clearWarnings(interaction.guild.id, user.id);
    await interaction.reply({ content: `Удалено предупреждений у ${user.tag}: ${removed}.`, ephemeral: true });
  }
};
