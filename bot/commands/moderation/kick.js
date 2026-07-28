'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../../shared/db');
const { sendModLog } = require('../../../shared/modlog');
const { fill } = require('../../../shared/text');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Кикнуть участника')
    .addUserOption((o) => o.setName('user').setDescription('Кого кикать').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Причина'))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'Причина не указана';
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) return interaction.reply({ content: 'Участник не найден на сервере.', ephemeral: true });
    if (!member.kickable) {
      return interaction.reply({ content: 'Не могу кикнуть этого участника (роль выше моей?).', ephemeral: true });
    }

    const s = await db.getSettings(interaction.guild.id);
    if (s.moderation.dmOnPunish) {
      user.send(fill(s.moderation.kickDm, { server: interaction.guild.name, reason, moderator: interaction.user.tag })).catch(() => {});
    }

    await member.kick(reason);

    const embed = new EmbedBuilder()
      .setTitle('Кик').setColor(0xfaa61a)
      .addFields(
        { name: 'Участник', value: `${user.tag} (${user.id})` },
        { name: 'Модератор', value: interaction.user.tag },
        { name: 'Причина', value: reason }
      ).setTimestamp();

    await interaction.reply({ embeds: [embed] });
    sendModLog(interaction.guild, s, embed);
  }
};
