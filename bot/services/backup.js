'use strict';

/**
 * Backup-система: периодический snapshot структуры сервера
 * (роли, каналы, категории, права, позиции) в таблицу backups.
 * Snapshot'ы используются Anti-Crash для восстановления удалённого
 * и командой !restore для ручного отката.
 */

const { ChannelType, OverwriteType } = require('discord.js');
const db = require('../../shared/db');

// Когда для каждого сервера последний раз снимали backup (в памяти).
const lastBackupAt = new Map();

/** Снимок одной роли. */
function snapshotRole(role) {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    hoist: role.hoist,
    position: role.position,
    permissions: role.permissions.bitfield.toString(),
    mentionable: role.mentionable,
    managed: role.managed
  };
}

/** Снимок overwrites канала (allow/deny как строки — BigInt не сериализуется в JSON). */
function snapshotOverwrites(channel) {
  return [...channel.permissionOverwrites.cache.values()].map((o) => ({
    id: o.id,
    type: o.type, // 0 = role, 1 = member
    allow: o.allow.bitfield.toString(),
    deny: o.deny.bitfield.toString()
  }));
}

/** Снимок одного канала/категории. */
function snapshotChannel(channel) {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    parentId: channel.parentId || null,
    position: channel.rawPosition ?? channel.position ?? 0,
    topic: channel.topic ?? null,
    nsfw: channel.nsfw ?? false,
    rateLimitPerUser: channel.rateLimitPerUser ?? 0,
    bitrate: channel.bitrate ?? null,
    userLimit: channel.userLimit ?? null,
    overwrites: snapshotOverwrites(channel)
  };
}

/** Полный снимок сервера. */
function buildSnapshot(guild) {
  return {
    guildId: guild.id,
    guildName: guild.name,
    takenAt: Date.now(),
    roles: [...guild.roles.cache.values()].filter((r) => r.id !== guild.id).map(snapshotRole),
    channels: [...guild.channels.cache.values()].map(snapshotChannel)
  };
}

/** Сохранить снимок в БД. kind: 'auto' | 'manual'. */
async function takeBackup(guild, kind = 'auto') {
  const snap = buildSnapshot(guild);
  const settings = await db.getSettings(guild.id);
  const row = await db.saveBackup(guild.id, snap, kind, settings.backup.keep || 20);
  lastBackupAt.set(guild.id, Date.now());
  return row;
}

/** Пересоздать канал из снимка (для отката удаления). Возвращает новый канал или null. */
async function restoreChannel(guild, snap, reason = 'Anti-Crash restore') {
  const overwrites = (snap.overwrites || [])
    .filter((o) => o.type === OverwriteType.Role ? guild.roles.cache.has(o.id) : true)
    .map((o) => ({ id: o.id, type: o.type, allow: BigInt(o.allow), deny: BigInt(o.deny) }));
  const opts = {
    name: snap.name,
    type: snap.type,
    reason,
    permissionOverwrites: overwrites
  };
  if (snap.type !== ChannelType.GuildCategory) opts.parent = snap.parentId || undefined;
  if (snap.topic != null) opts.topic = snap.topic;
  if (snap.nsfw != null) opts.nsfw = snap.nsfw;
  if (snap.rateLimitPerUser) opts.rateLimitPerUser = snap.rateLimitPerUser;
  if (snap.bitrate) opts.bitrate = snap.bitrate;
  if (snap.userLimit) opts.userLimit = snap.userLimit;
  const created = await guild.channels.create(opts).catch((e) => { console.error('[backup] restoreChannel:', e.message); return null; });
  if (created) await created.setPosition(snap.position).catch(() => {});
  return created;
}

/** Пересоздать роль из снимка. Возвращает новую роль или null. */
async function restoreRole(guild, snap, reason = 'Anti-Crash restore') {
  if (snap.managed) return null; // управляемые роли (боты/интеграции) не пересоздать
  const role = await guild.roles.create({
    name: snap.name,
    color: snap.color,
    hoist: snap.hoist,
    mentionable: snap.mentionable,
    permissions: BigInt(snap.permissions),
    reason
  }).catch((e) => { console.error('[backup] restoreRole:', e.message); return null; });
  if (role) await role.setPosition(snap.position).catch(() => {});
  return role;
}

/** Найти снимок канала/роли в backup по id. */
function findChannel(backupData, channelId) {
  return (backupData.channels || []).find((c) => c.id === channelId) || null;
}
function findRole(backupData, roleId) {
  return (backupData.roles || []).find((r) => r.id === roleId) || null;
}

/**
 * Ручное восстановление из backup: пересоздаёт роли и каналы, которых сейчас нет.
 * Best-effort — id пересозданных объектов будут новыми. Возвращает сводку.
 */
async function restoreFromBackup(guild, backupData) {
  const result = { rolesCreated: 0, channelsCreated: 0 };
  // Роли — от нижних позиций к верхним, чтобы позиции легли ближе к оригиналу.
  const roles = [...(backupData.roles || [])].sort((a, b) => a.position - b.position);
  for (const r of roles) {
    if (r.managed) continue;
    const exists = guild.roles.cache.has(r.id) || guild.roles.cache.some((x) => x.name === r.name);
    if (exists) continue;
    if (await restoreRole(guild, r)) result.rolesCreated++;
  }
  // Сначала категории, потом остальные каналы (чтобы parent существовал).
  const channels = [...(backupData.channels || [])].sort((a, b) => {
    const ca = a.type === ChannelType.GuildCategory ? 0 : 1;
    const cb = b.type === ChannelType.GuildCategory ? 0 : 1;
    return ca - cb || a.position - b.position;
  });
  for (const c of channels) {
    const exists = guild.channels.cache.has(c.id) || guild.channels.cache.some((x) => x.name === c.name && x.type === c.type);
    if (exists) continue;
    if (await restoreChannel(guild, c)) result.channelsCreated++;
  }
  return result;
}

/**
 * Планировщик авто-backup: тикает часто, но снимает snapshot для каждого
 * сервера не чаще, чем указано в его настройках (backup.intervalSec).
 */
function startBackupLoop(client) {
  return setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      let settings;
      try { settings = await db.getSettings(guild.id); } catch { continue; }
      if (!settings.backup.enabled) continue;
      const intervalMs = Math.max(30, settings.backup.intervalSec || 60) * 1000;
      const last = lastBackupAt.get(guild.id) || 0;
      if (Date.now() - last < intervalMs) continue;
      await takeBackup(guild, 'auto').catch((e) => console.error('[backup] auto:', e.message));
    }
  }, 15 * 1000);
}

module.exports = {
  buildSnapshot, takeBackup, restoreChannel, restoreRole,
  findChannel, findRole, restoreFromBackup, startBackupLoop, snapshotChannel, snapshotRole, lastBackupAt
};
