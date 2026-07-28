'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../../shared/db');
const mod = require('../../services/moderation');
const { parseDuration } = require('../../../shared/duration');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Забанить участника (можно временно)')
    .addUserOption((o) => o.setName('user').setDescription('Кого банить').setRequired(true))
    .addStringOption((o) => o.setName('duration').setDescription('Срок: 30d, 12h, 1w (пусто = навсегда)'))
    .addStringOption((o) => o.setName('reason').setDescription('Причина'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'Причина не указана';
    if (durationStr && parseDuration(durationStr) == null) {
      return interaction.reply({ content: 'Неверный формат срока. Примеры: 30d, 12h, 1w.', ephemeral: true });
    }
    const durationMs = durationStr ? parseDuration(durationStr) : null;
    const settings = await db.getSettings(interaction.guild.id);
    const res = await mod.ban(interaction.guild, { id: interaction.user.id, tag: interaction.user.tag }, user.id, durationMs, reason, settings);
    if (!res.ok) return interaction.reply({ content: res.error, ephemeral: true });
    await interaction.reply({ embeds: [res.embed] });
  }
};
