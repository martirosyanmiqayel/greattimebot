'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { buildHelpEmbed } = require('../../services/help');

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('Список команд бота'),
  async execute(interaction) {
    await interaction.reply({ embeds: [buildHelpEmbed()], ephemeral: true });
  }
};
