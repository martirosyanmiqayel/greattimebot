'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../../shared/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Закрыть текущий тикет (работает только в тикет-канале)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const s = await db.getSettings(interaction.guild.id);
    // Проверим, что это действительно открытый тикет-канал
    const ticket = await findTicketByChannel(interaction.guild.id, interaction.channel.id);
    if (!ticket) {
      return interaction.reply({ content: 'Эта команда работает только внутри тикет-канала.', ephemeral: true });
    }
    await db.closeTicket(interaction.channel.id);
    require('../../services/ticketlog').logClose(interaction.guild, s, interaction.user, interaction.channel);
    await interaction.reply({ content: s.tickets.closeMessage || 'Тикет закрывается через 5 секунд...' });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  }
};

// Небольшой помощник: тикет открыт в этом канале?
async function findTicketByChannel(guildId, channelId) {
  const { data } = await db.supabase
    .from('tickets').select('*')
    .eq('guild_id', guildId).eq('channel_id', channelId).eq('status', 'open').maybeSingle();
  return data || null;
}
