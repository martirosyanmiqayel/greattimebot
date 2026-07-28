'use strict';

const {
  SlashCommandBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require('discord.js');
const db = require('../../../shared/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Отправить панель с кнопкой создания тикета в этот канал')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const s = await db.getSettings(interaction.guild.id);
    if (!s.tickets.enabled) {
      return interaction.reply({
        content: 'Модуль тикетов выключен. Включи его на дашборде и укажи категорию/роль поддержки.',
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(s.tickets.panelTitle || '🎫 Поддержка')
      .setDescription(s.tickets.panelDescription || 'Нажми на кнопку ниже, чтобы открыть тикет.')
      .setColor(0x5865f2);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_create')
        .setLabel(s.tickets.panelButtonLabel || 'Открыть тикет')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎫')
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: 'Панель отправлена.', ephemeral: true });
  }
};
