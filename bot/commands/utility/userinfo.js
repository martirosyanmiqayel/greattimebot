'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { buildUserEmbed } = require('../../services/userinfo');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Подробная информация об участнике')
    .addUserOption((o) => o.setName('user').setDescription('Кто (по умолчанию ты)')),

  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const embed = await buildUserEmbed(interaction.guild, user);
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
