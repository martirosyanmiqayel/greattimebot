'use strict';
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../../shared/db');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Показать предупреждения участника')
    .addUserOption((o) => o.setName('user').setDescription('Кого').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const warns = await db.getWarnings(interaction.guild.id, user.id);
    if (!warns.length) return interaction.reply({ content: `У ${user.tag} нет предупреждений.`, ephemeral: true });
    const embed = new EmbedBuilder()
      .setTitle(`Предупреждения: ${user.tag}`).setColor(0xfaa61a)
      .setDescription(warns.slice(0, 15).map((w, i) => {
        const date = new Date(w.created_at).toLocaleString('ru-RU');
        return `**${i + 1}.** ${w.reason || 'без причины'} — <@${w.moderator}> (${date})`;
      }).join('\n'))
      .setFooter({ text: `Всего: ${warns.length}` });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
