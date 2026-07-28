'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../../shared/db');
const mod = require('../../services/moderation');
const { parseDuration } = require('../../../shared/duration');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Выдать тайм-аут участнику')
    .addUserOption((o) => o.setName('user').setDescription('Кого мьютить').setRequired(true))
    .addStringOption((o) => o.setName('duration').setDescription('Например 10m, 2h, 1d').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Причина'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const durationMs = parseDuration(interaction.options.getString('duration'));
    const reason = interaction.options.getString('reason') || 'Причина не указана';
    if (durationMs == null) return interaction.reply({ content: 'Неверный формат времени. Примеры: 10m, 2h, 1d.', ephemeral: true });
    const settings = await db.getSettings(interaction.guild.id);
    const res = await mod.mute(interaction.guild, { id: interaction.user.id, tag: interaction.user.tag }, user.id, durationMs, reason, settings);
    if (!res.ok) return interaction.reply({ content: res.error, ephemeral: true });
    await interaction.reply({ embeds: [res.embed] });
  }
};
