'use strict';

/** Сводка состояния безопасности сервера (для !security / /security). */

const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../shared/db');
const backup = require('./backup');

async function buildStatusEmbed(guild) {
  const settings = await db.getSettings(guild.id);
  const me = guild.members.me;

  // Проверка соединения с БД (лёгкий запрос).
  let dbOk = true;
  try {
    const { error } = await db.supabase.from('guild_settings').select('guild_id').limit(1);
    dbOk = !error;
  } catch { dbOk = false; }

  // Когда был последний backup.
  let lastBackupText = 'нет';
  const memTs = backup.lastBackupAt.get(guild.id);
  const latest = memTs ? { created_at: memTs } : await db.getLatestBackup(guild.id);
  if (latest) {
    const secAgo = Math.max(0, Math.floor((Date.now() - latest.created_at) / 1000));
    lastBackupText = `${secAgo} секунд назад`;
  }

  const wl = await db.whitelistList(guild.id);
  const auditOk = !!(me && me.permissions.has(PermissionFlagsBits.ViewAuditLog));

  const dot = (ok) => (ok ? '🟢' : '🔴');
  const lines = [
    `${dot(settings.backup.enabled)} Backup ${settings.backup.enabled ? 'работает' : 'выключен'}`,
    `${dot(auditOk)} Audit Logs ${auditOk ? 'доступны' : 'нет права ViewAuditLog'}`,
    `${dot(settings.anticrash.enabled)} WhiteList ${wl.length ? `активен (${wl.length})` : 'пуст'}`,
    `${dot(settings.anticrash.enabled)} AntiCrash ${settings.anticrash.enabled ? 'включён' : 'выключен'}`,
    `${dot(dbOk)} База данных ${dbOk ? 'подключена' : 'недоступна'}`,
    `🟢 Последний Backup ${lastBackupText}`
  ];

  return new EmbedBuilder()
    .setColor(settings.anticrash.enabled && settings.backup.enabled && dbOk ? 0x57f287 : 0xfaa61a)
    .setTitle('🔍 Проверка безопасности')
    .setDescription(lines.join('\n'))
    .setTimestamp();
}

module.exports = { buildStatusEmbed };
