'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../../shared/db');
const { buildPanel } = require('../../services/tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Отправить панель тикетов в этот канал')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const s = await db.getSettings(interaction.guild.id);
    if (!s.tickets.enabled) {
      return interaction.reply({
        content: 'Модуль тикетов выключен. Включи его на дашборде и укажи категорию/роль поддержки.',
        ephemeral: true
      });
    }
    await interaction.channel.send(buildPanel(s));
    await interaction.reply({ content: 'Панель отправлена.', ephemeral: true });
  }
};
