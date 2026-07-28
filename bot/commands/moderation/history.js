'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../../shared/db');
const mod = require('../../services/moderation');
const { humanizeDuration } = require('../../../shared/duration');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('checkmute').setDescription('Показать инфо о муте участника')
      .addUserOption((o) => o.setName('user').setDescription('Чей мут проверить').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const { muted, action, until } = await mod.checkMute(interaction.guild, user.id);
      if (!muted && !action) return interaction.reply({ content: `У ${user.tag} нет активного мута.`, ephemeral: true });
      const embed = new EmbedBuilder().setColor(muted ? 0x5865f2 : 0x99aab5).setTitle('Проверка мута').addFields(
        { name: 'Участник', value: `${user.tag}` },
        { name: 'Статус', value: muted ? '🔇 замьючен' : '🔈 не активен' },
        { name: 'Модератор', value: action ? `<@${action.moderator}>` : '—' },
        { name: 'Причина', value: action?.reason || '—' },
        { name: 'Срок', value: action?.duration_ms ? humanizeDuration(action.duration_ms) : '—' },
        { name: 'Истекает', value: until ? `<t:${Math.floor(until / 1000)}:R>` : '—' }
      );
      await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('history').setDescription('История наказаний участника')
      .addUserOption((o) => o.setName('user').setDescription('Чью историю показать').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const rows = await db.getModHistory(interaction.guild.id, user.id, 20);
      if (!rows.length) return interaction.reply({ content: `У ${user.tag} чистая история.`, ephemeral: true });
      const icon = { ban: '🔨', unban: '♻️', mute: '🔇', unmute: '🔈', kick: '👢', warn: '⚠️' };
      const lines = rows.map((r) => {
        const when = `<t:${Math.floor(r.created_at / 1000)}:d>`;
        const dur = r.duration_ms ? ` · ${humanizeDuration(r.duration_ms)}` : '';
        return `${icon[r.type] || '•'} **${r.type}**${dur} — ${r.reason || 'без причины'} · <@${r.moderator}> · ${when}`;
      });
      const embed = new EmbedBuilder().setColor(0x99aab5).setTitle('История наказаний')
        .setDescription(lines.join('\n')).setFooter({ text: `Пользователь ${user.id}` });
      await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('unban').setDescription('Разбанить по ID')
      .addStringOption((o) => o.setName('user_id').setDescription('ID пользователя').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Причина'))
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    async execute(interaction) {
      const id = interaction.options.getString('user_id');
      if (!/^\d{15,25}$/.test(id)) return interaction.reply({ content: 'Некорректный ID.', ephemeral: true });
      const settings = await db.getSettings(interaction.guild.id);
      const res = await mod.unban(interaction.guild, { id: interaction.user.id, tag: interaction.user.tag }, id, interaction.options.getString('reason'), settings);
      if (!res.ok) return interaction.reply({ content: res.error, ephemeral: true });
      await interaction.reply({ embeds: [res.embed] });
    }
  }
];
