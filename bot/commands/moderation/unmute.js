'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../../shared/db');
const mod = require('../../services/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Снять тайм-аут с участника')
    .addUserOption((o) => o.setName('user').setDescription('С кого снять').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const settings = await db.getSettings(interaction.guild.id);
    const res = await mod.unmute(interaction.guild, { id: interaction.user.id, tag: interaction.user.tag }, user.id, settings);
    if (!res.ok) return interaction.reply({ content: res.error, ephemeral: true });
    await interaction.reply({ embeds: [res.embed] });
  }
};
