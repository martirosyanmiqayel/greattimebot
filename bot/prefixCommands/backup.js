'use strict';

const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../shared/db');
const backup = require('../services/backup');

async function doRestore(ctx, id) {
  const row = await db.getBackup(ctx.guild.id, id);
  if (!row) return ctx.error(`Backup #${id} не найден.`);
  await ctx.reply(`♻️ Восстанавливаю из backup #${id}... это может занять время.`);
  const res = await backup.restoreFromBackup(ctx.guild, row.data);
  await ctx.reply(`✅ Готово. Создано ролей: **${res.rolesCreated}**, каналов: **${res.channelsCreated}**.`);
}

module.exports = [
  {
    name: 'backup',
    description: '!backup create | list | restore <id> | delete <id>',
    permission: PermissionFlagsBits.ManageGuild,
    async run(ctx) {
      const sub = (ctx.args[0] || '').toLowerCase();
      if (sub === 'create') {
        const row = await backup.takeBackup(ctx.guild, 'manual');
        return ctx.reply(row ? `✅ Backup создан: #${row.id}` : '⚠️ Не удалось создать backup.');
      }
      if (sub === 'list') {
        const rows = await db.listBackups(ctx.guild.id, 20);
        if (!rows.length) return ctx.reply('Backup-ов пока нет.');
        const lines = rows.map((r) => `#${r.id} · ${r.kind} · <t:${Math.floor(r.created_at / 1000)}:R>`);
        return ctx.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('💾 Backup-ы').setDescription(lines.join('\n'))] });
      }
      if (sub === 'restore') {
        const id = parseInt(ctx.args[1], 10);
        if (Number.isNaN(id)) return ctx.error('Использование: `!backup restore <id>`');
        return doRestore(ctx, id);
      }
      if (sub === 'delete') {
        const id = parseInt(ctx.args[1], 10);
        if (Number.isNaN(id)) return ctx.error('Использование: `!backup delete <id>`');
        const n = await db.deleteBackup(ctx.guild.id, id);
        return ctx.reply(n ? `🗑️ Backup #${id} удалён.` : `Backup #${id} не найден.`);
      }
      return ctx.error('Подкоманды: `create`, `list`, `restore <id>`, `delete <id>`.');
    }
  },
  {
    name: 'restore',
    description: 'Восстановить сервер из backup: !restore <id>',
    permission: PermissionFlagsBits.ManageGuild,
    async run(ctx) {
      const id = parseInt(ctx.args[0], 10);
      if (Number.isNaN(id)) return ctx.error('Использование: `!restore <id>` (список — `!backup list`)');
      return doRestore(ctx, id);
    }
  }
];
