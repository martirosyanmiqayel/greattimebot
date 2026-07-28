'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const security = require('../../services/security');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('security').setDescription('Проверка безопасности сервера')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    const embed = await security.buildStatusEmbed(interaction.guild);
    await interaction.reply({ embeds: [embed] });
  }
};
