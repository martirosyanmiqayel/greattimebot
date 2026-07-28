'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../../shared/db');
const { sendModLog } = require('../../../shared/modlog');
const { fill } = require('../../../shared/text');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Выдать предупреждение участнику')
    .addUserOption((o) => o.setName('user').setDescription('Кому').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Причина').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    await db.addWarning(interaction.guild.id, user.id, interaction.user.id, reason);
    const total = (await db.getWarnings(interaction.guild.id, user.id)).length;

    const s = await db.getSettings(interaction.guild.id);
    if (s.moderation.dmOnPunish) {
      user.send(fill(s.moderation.warnDm, { server: interaction.guild.name, reason, moderator: interaction.user.tag })).catch(() => {});
    }

    const embed = new EmbedBuilder()
      .setTitle('Предупреждение').setColor(0xfaa61a)
      .addFields(
        { name: 'Участник', value: `${user.tag} (${user.id})` },
        { name: 'Модератор', value: interaction.user.tag },
        { name: 'Причина', value: reason },
        { name: 'Всего предупреждений', value: String(total) }
      ).setTimestamp();

    await interaction.reply({ embeds: [embed] });
    sendModLog(interaction.guild, s, embed);
  }
};
