'use strict';

/**
 * Anti-Crash (анти-нюк): реакция на аудит-лог сервера.
 * Если НЕ доверенный участник совершает деструктив — наказываем (снятие ролей +
 * timeout/kick/ban), откатываем изменение и (опц.) пишем владельцу в ЛС.
 * Пороговые лимиты применяются даже к доверенным ролям (по ТЗ).
 *
 * Работает через guildAuditLogEntryCreate (нужен интент GuildModeration).
 */

const { AuditLogEvent, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../shared/db');
const backup = require('./backup');
const { sendAntiCrashLog } = require('../../shared/modlog');

const HOUR = 60 * 60 * 1000;
const MAX_TIMEOUT_MS = 28 * 24 * HOUR;

// Права, выдача которых считается опасной (анти-админ-грант).
const DANGEROUS_PERMS = [
  PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels, PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.ManageGuildExpressions
];

// AuditLogEvent -> { key, kind }
const ACTION_MAP = {
  [AuditLogEvent.ChannelDelete]: { key: 'channelDelete', kind: 'delete-channel' },
  [AuditLogEvent.ChannelUpdate]: { key: 'channelUpdate', kind: 'update-channel' },
  [AuditLogEvent.ChannelCreate]: { key: 'channelCreate', kind: 'noop' },
  [AuditLogEvent.RoleDelete]: { key: 'roleDelete', kind: 'delete-role' },
  [AuditLogEvent.RoleUpdate]: { key: 'roleUpdate', kind: 'update-role' },
  [AuditLogEvent.RoleCreate]: { key: 'roleCreate', kind: 'noop' },
  [AuditLogEvent.GuildUpdate]: { key: 'guildUpdate', kind: 'update-guild' },
  [AuditLogEvent.MemberKick]: { key: 'memberKick', kind: 'member' },
  [AuditLogEvent.MemberPrune]: { key: 'memberPrune', kind: 'member' },
  [AuditLogEvent.MemberBanAdd]: { key: 'memberBanAdd', kind: 'member-ban' },
  [AuditLogEvent.MemberRoleUpdate]: { key: 'memberRoleUpdate', kind: 'member-role' },
  [AuditLogEvent.BotAdd]: { key: 'botAdd', kind: 'bot' },
  [AuditLogEvent.WebhookDelete]: { key: 'webhookDelete', kind: 'webhook' },
  [AuditLogEvent.WebhookUpdate]: { key: 'webhookUpdate', kind: 'webhook' }
};

const HUMAN = {
  channelDelete: 'удаление канала', channelUpdate: 'изменение канала', channelCreate: 'создание канала',
  roleDelete: 'удаление роли', roleUpdate: 'изменение роли', roleCreate: 'создание роли',
  guildUpdate: 'изменение сервера', memberKick: 'кик участника', memberPrune: 'массовый кик (prune)',
  memberBanAdd: 'бан участника', memberRoleUpdate: 'выдача опасной роли',
  botAdd: 'добавление бота', webhookDelete: 'удаление вебхука', webhookUpdate: 'изменение вебхука'
};

// Скользящее окно для лимитов: `${guild}:${user}:${key}` -> [timestamps].
const rateWindows = new Map();
// Дедупликация наказаний: `${guild}:${user}` -> timestamp.
const recentlyPunished = new Map();

function bumpRate(guildId, userId, key, cfg) {
  const k = `${guildId}:${userId}:${key}`;
  const now = Date.now();
  const windowMs = (cfg.windowSec || 30) * 1000;
  const arr = (rateWindows.get(k) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  rateWindows.set(k, arr);
  return arr.length > (cfg.count || 3);
}

async function isTrusted(guild, settings, userId) {
  if (await db.whitelistHas(guild.id, userId)) return true;
  const roleIds = settings.anticrash.whitelistRoleIds || [];
  if (!roleIds.length) return false;
  const member = await guild.members.fetch(userId).catch(() => null);
  return !!(member && member.roles.cache.some((r) => roleIds.includes(r.id)));
}

/** Наказать нарушителя. Режим: strip+timeout | kick | ban. */
async function punish(guild, userId, settings, reason) {
  const k = `${guild.id}:${userId}`;
  const now = Date.now();
  if (now - (recentlyPunished.get(k) || 0) < 15 * 1000) return { skipped: true };
  recentlyPunished.set(k, now);

  const mode = settings.anticrash.punishment || 'timeout';
  const member = await guild.members.fetch(userId).catch(() => null);
  const info = { mode, stripped: false, timedOut: false, kicked: false, banned: false, left: !member };

  // Снять роли (всегда полезно как первая мера).
  if (settings.anticrash.stripRoles && member && member.manageable) {
    const keep = member.roles.cache.filter((r) => r.managed).map((r) => r.id);
    await member.roles.set(keep, reason).then(() => { info.stripped = true; }).catch(() => {});
  }

  if (mode === 'ban') {
    await guild.members.ban(userId, { reason }).then(() => { info.banned = true; }).catch(() => {});
  } else if (mode === 'kick') {
    if (member && member.kickable) await member.kick(reason).then(() => { info.kicked = true; }).catch(() => {});
  } else {
    const ms = Math.min(MAX_TIMEOUT_MS, (settings.anticrash.punishTimeoutHours || 3) * HOUR);
    if (member && member.moderatable) await member.timeout(ms, reason).then(() => { info.timedOut = true; }).catch(() => {});
  }

  await db.addModAction({
    guild_id: guild.id, type: 'anticrash', target_id: userId, moderator: guild.client.user.id,
    reason, duration_ms: mode === 'timeout' ? (settings.anticrash.punishTimeoutHours || 3) * HOUR : null,
    expires_at: null, active: true
  });
  return info;
}

/** Опасные роли, добавленные участнику в этом audit-событии (member-role). */
function dangerousAddedRoles(entry, guild) {
  const add = (entry.changes || []).find((c) => c.key === '$add');
  if (!add || !Array.isArray(add.new)) return [];
  return add.new
    .map((r) => guild.roles.cache.get(r.id))
    .filter((role) => role && DANGEROUS_PERMS.some((p) => role.permissions.has(p)));
}

/** Откат изменения. Возвращает человекочитаемое описание. */
async function tryRestore(entry, guild, settings, map, extra) {
  if (!settings.anticrash.autoRestore) return 'откат выключен';
  try {
    switch (map.kind) {
      case 'delete-channel': {
        const latest = await db.getLatestBackup(guild.id);
        const snap = latest && backup.findChannel(latest.data, entry.targetId);
        if (!snap) return 'нет backup для восстановления канала';
        const ch = await backup.restoreChannel(guild, snap);
        return ch ? `канал восстановлен: <#${ch.id}>` : 'не удалось восстановить канал';
      }
      case 'delete-role': {
        const latest = await db.getLatestBackup(guild.id);
        const snap = latest && backup.findRole(latest.data, entry.targetId);
        if (!snap) return 'нет backup для восстановления роли';
        const role = await backup.restoreRole(guild, snap);
        return role ? `роль восстановлена: ${role.name}` : 'не удалось восстановить роль';
      }
      case 'update-channel': {
        const ch = guild.channels.cache.get(entry.targetId);
        if (!ch) return 'канал не найден';
        const edit = {};
        for (const c of entry.changes || []) {
          if (c.key === 'name') edit.name = c.old;
          else if (c.key === 'topic') edit.topic = c.old ?? null;
          else if (c.key === 'nsfw') edit.nsfw = c.old;
          else if (c.key === 'rate_limit_per_user') edit.rateLimitPerUser = c.old ?? 0;
          else if (c.key === 'bitrate') edit.bitrate = c.old;
          else if (c.key === 'user_limit') edit.userLimit = c.old;
        }
        if (!Object.keys(edit).length) return 'нечего откатывать';
        await ch.edit({ ...edit, reason: 'Anti-Crash revert' });
        return 'настройки канала возвращены';
      }
      case 'update-role': {
        const role = guild.roles.cache.get(entry.targetId);
        if (!role) return 'роль не найдена';
        const edit = {};
        for (const c of entry.changes || []) {
          if (c.key === 'name') edit.name = c.old;
          else if (c.key === 'color') edit.color = c.old;
          else if (c.key === 'hoist') edit.hoist = c.old;
          else if (c.key === 'mentionable') edit.mentionable = c.old;
          else if (c.key === 'permissions') edit.permissions = BigInt(c.old || 0);
        }
        if (!Object.keys(edit).length) return 'нечего откатывать';
        await role.edit({ ...edit, reason: 'Anti-Crash revert' });
        return 'настройки роли возвращены';
      }
      case 'update-guild': {
        const nameChange = (entry.changes || []).find((c) => c.key === 'name');
        if (nameChange && nameChange.old) { await guild.setName(nameChange.old, 'Anti-Crash revert'); return 'имя сервера возвращено'; }
        return 'изменение сервера залогировано (иконка/баннер вручную)';
      }
      case 'member-ban': {
        await guild.members.unban(entry.targetId, 'Anti-Crash: несанкционированный бан').catch(() => {});
        return `бан отменён: <@${entry.targetId}>`;
      }
      case 'member-role': {
        const member = await guild.members.fetch(entry.targetId).catch(() => null);
        if (!member || !extra || !extra.length) return 'нет опасных ролей для снятия';
        for (const role of extra) await member.roles.remove(role.id, 'Anti-Crash: опасная роль').catch(() => {});
        return `сняты опасные роли: ${extra.map((r) => r.name).join(', ')}`;
      }
      case 'bot': {
        // Баним добавленного бота, чтобы он не остался и не смог вернуться.
        const banned = await guild.members.ban(entry.targetId, { reason: 'Anti-Crash: несанкционированный бот' })
          .then(() => true).catch(() => false);
        if (banned) return `бот <@${entry.targetId}> удалён (бан)`;
        const bm = await guild.members.fetch(entry.targetId).catch(() => null);
        if (bm && bm.kickable) { await bm.kick('Anti-Crash: несанкционированный бот'); return 'добавленный бот удалён (кик)'; }
        return 'не удалось удалить бота';
      }
      case 'member':
        return 'участника нельзя вернуть автоматически';
      default:
        return 'откат не требуется';
    }
  } catch (e) {
    return `ошибка отката: ${e.message}`;
  }
}

/** Разослать отчёт о срабатывании: владельцу и/или всем из whitelist (без дублей). */
async function alertRecipients(guild, settings, embed) {
  const ids = new Set();
  if (settings.anticrash.alertOwner) ids.add(guild.ownerId);
  if (settings.anticrash.alertWhitelist) {
    const wl = await db.whitelistList(guild.id).catch(() => []);
    for (const row of wl) ids.add(row.user_id);
  }
  for (const id of ids) {
    const user = await guild.client.users.fetch(id).catch(() => null);
    if (user) user.send({ embeds: [embed] }).catch(() => {}); // ЛС закрыты — не критично
  }
}

/** Основной обработчик события аудит-лога. */
async function handleAuditEntry(entry, guild) {
  let settings;
  try { settings = await db.getSettings(guild.id); } catch { return; }
  if (!settings.anticrash.enabled) return;

  const executorId = entry.executorId;
  if (!executorId) return;
  if (executorId === guild.client.user.id) return; // наши действия
  if (executorId === guild.ownerId) return;         // владельца не трогаем

  const map = ACTION_MAP[entry.action];
  if (!map || map.kind === 'noop') return;

  const key = map.key;
  const protectedOn = !!(settings.anticrash.protect && settings.anticrash.protect[key]);
  const limitCfg = settings.anticrash.limits && settings.anticrash.limits[key];
  const overLimit = limitCfg ? bumpRate(guild.id, executorId, key, limitCfg) : false;

  // Спец-случай: выдача ролей опасна только если добавили опасную роль.
  let extra = null;
  if (map.kind === 'member-role') {
    extra = dangerousAddedRoles(entry, guild);
    if (!extra.length) return; // обычная выдача роли — игнор
  }

  const trusted = await isTrusted(guild, settings, executorId);
  // Добавление бота караем даже для доверенных — whitelist тут не спасает.
  const bypassWhitelist = map.kind === 'bot';
  const act = overLimit || (protectedOn && (!trusted || bypassWhitelist));
  if (!act) return;

  const human = HUMAN[key] || key;
  const reason = `Anti-Crash: ${human}${overLimit ? ' (превышен лимит)' : ''}`;

  const restoreResult = await tryRestore(entry, guild, settings, map, extra);
  const punishResult = await punish(guild, executorId, settings, reason);

  await db.addActionLog(guild.id, 'anticrash', executorId, entry.targetId, {
    action: key, overLimit, trusted, restore: restoreResult, punish: punishResult
  });

  const punishText = punishResult.skipped ? 'уже наказан' : [
    punishResult.stripped ? 'сняты роли' : null,
    punishResult.banned ? 'бан' : null,
    punishResult.kicked ? 'кик' : null,
    punishResult.timedOut ? `timeout ${settings.anticrash.punishTimeoutHours}ч` : null,
    punishResult.left ? 'участник уже вышел' : null
  ].filter(Boolean).join(', ') || 'не удалось';

  const embed = new EmbedBuilder()
    .setColor(0xff0000).setTitle('🛡️ Anti-Crash сработал')
    .addFields(
      { name: 'Сервер', value: guild.name, inline: true },
      { name: 'Нарушитель', value: `<@${executorId}> (${executorId})`, inline: true },
      { name: 'Действие', value: human, inline: true },
      { name: 'Лимит', value: overLimit ? 'превышен' : 'нет', inline: true },
      { name: 'Наказание', value: punishText, inline: true },
      { name: 'Восстановление', value: restoreResult }
    ).setTimestamp();
  sendAntiCrashLog(guild, settings, embed);
  if (settings.anticrash.alertOwner || settings.anticrash.alertWhitelist) alertRecipients(guild, settings, embed);
}

module.exports = { handleAuditEntry, ACTION_MAP, DANGEROUS_PERMS };
