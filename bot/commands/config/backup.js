'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../../shared/db');
const backup = require('../../services/backup');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backup').setDescription('Резервные копии структуры сервера')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('create').setDescription('Создать backup сейчас'))
    .addSubcommand((s) => s.setName('list').setDescription('Список backup-ов'))
    .addSubcommand((s) => s.setName('restore').setDescription('Восстановить из backup')
      .addIntegerOption((o) => o.setName('id').setDescription('ID backup-а').setRequired(true)))
    .addSubcommand((s) => s.setName('delete').setDescription('Удалить backup')
      .addIntegerOption((o) => o.setName('id').setDescription('ID backup-а').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'create') {
      const row = await backup.takeBackup(interaction.guild, 'manual');
      return interaction.reply(row ? `✅ Backup создан: #${row.id}` : '⚠️ Не удалось создать backup.');
    }
    if (sub === 'list') {
      const rows = await db.listBackups(interaction.guild.id, 20);
      if (!rows.length) return interaction.reply('Backup-ов пока нет.');
      const lines = rows.map((r) => `#${r.id} · ${r.kind} · <t:${Math.floor(r.created_at / 1000)}:R>`);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('💾 Backup-ы').setDescription(lines.join('\n'))] });
    }
    if (sub === 'delete') {
      const id = interaction.options.getInteger('id');
      const n = await db.deleteBackup(interaction.guild.id, id);
      return interaction.reply(n ? `🗑️ Backup #${id} удалён.` : `Backup #${id} не найден.`);
    }
    if (sub === 'restore') {
      const id = interaction.options.getInteger('id');
      const row = await db.getBackup(interaction.guild.id, id);
      if (!row) return interaction.reply({ content: `Backup #${id} не найден.`, ephemeral: true });
      await interaction.reply(`♻️ Восстанавливаю из backup #${id}...`);
      const res = await backup.restoreFromBackup(interaction.guild, row.data);
      return interaction.followUp(`✅ Готово. Создано ролей: **${res.rolesCreated}**, каналов: **${res.channelsCreated}**.`);
    }
  }
};
