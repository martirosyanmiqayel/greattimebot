'use strict';

/**
 * Anti-Crash: реакция на аудит-лог сервера.
 * Если НЕ доверенный участник совершает деструктивное действие — снимаем все роли,
 * выдаём timeout и (по возможности) откатываем изменение. Пороговые лимиты
 * применяются даже к доверенным ролям (по ТЗ).
 *
 * Работает через событие guildAuditLogEntryCreate (нужен интент GuildModeration).
 */

const { AuditLogEvent, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../shared/db');
const backup = require('./backup');
const { sendAntiCrashLog } = require('../../shared/modlog');

const HOUR = 60 * 60 * 1000;
const MAX_TIMEOUT_MS = 28 * 24 * HOUR;

// AuditLogEvent -> { key: <ключ настроек protect/limits>, kind }
const ACTION_MAP = {
  [AuditLogEvent.ChannelDelete]: { key: 'channelDelete', kind: 'delete-channel' },
  [AuditLogEvent.ChannelUpdate]: { key: 'channelUpdate', kind: 'update-channel' },
  [AuditLogEvent.ChannelCreate]: { key: 'channelCreate', kind: 'noop' },
  [AuditLogEvent.RoleDelete]: { key: 'roleDelete', kind: 'delete-role' },
  [AuditLogEvent.RoleUpdate]: { key: 'roleUpdate', kind: 'update-role' },
  [AuditLogEvent.RoleCreate]: { key: 'roleCreate', kind: 'noop' },
  [AuditLogEvent.GuildUpdate]: { key: 'guildUpdate', kind: 'update-guild' },
  [AuditLogEvent.MemberKick]: { key: 'memberKick', kind: 'member' },
  [AuditLogEvent.MemberBanAdd]: { key: 'memberBanAdd', kind: 'member' },
  [AuditLogEvent.BotAdd]: { key: 'botAdd', kind: 'bot' },
  [AuditLogEvent.WebhookDelete]: { key: 'webhookDelete', kind: 'webhook' },
  [AuditLogEvent.WebhookUpdate]: { key: 'webhookUpdate', kind: 'webhook' }
};

const HUMAN = {
  channelDelete: 'удаление канала', channelUpdate: 'изменение канала', channelCreate: 'создание канала',
  roleDelete: 'удаление роли', roleUpdate: 'изменение роли', roleCreate: 'создание роли',
  guildUpdate: 'изменение сервера', memberKick: 'кик участника', memberBanAdd: 'бан участника',
  botAdd: 'добавление бота', webhookDelete: 'удаление вебхука', webhookUpdate: 'изменение вебхука'
};

// Скользящее окно для лимитов: `${guild}:${user}:${key}` -> [timestamps].
const rateWindows = new Map();
// Дедупликация наказаний: `${guild}:${user}` -> timestamp последнего наказания.
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

/** Снять все роли (кроме управляемых) и выдать timeout нарушителю. */
async function punish(guild, userId, settings, reason) {
  const k = `${guild.id}:${userId}`;
  const now = Date.now();
  if (now - (recentlyPunished.get(k) || 0) < 15 * 1000) return { skipped: true };
  recentlyPunished.set(k, now);

  const member = await guild.members.fetch(userId).catch(() => null);
  const info = { stripped: false, timedOut: false, left: !member };
  if (!member) return info;

  if (settings.anticrash.stripRoles && member.manageable) {
    const keep = member.roles.cache.filter((r) => r.managed).map((r) => r.id);
    await member.roles.set(keep, reason).then(() => { info.stripped = true; }).catch(() => {});
  }
  const ms = Math.min(MAX_TIMEOUT_MS, (settings.anticrash.punishTimeoutHours || 3) * HOUR);
  if (member.moderatable) {
    await member.timeout(ms, reason).then(() => { info.timedOut = true; }).catch(() => {});
  }
  await db.addModAction({
    guild_id: guild.id, type: 'anticrash', target_id: userId, moderator: guild.client.user.id,
    reason, duration_ms: ms, expires_at: now + ms, active: true
  });
  return info;
}

/** Попытка отката изменения. Возвращает человекочитаемое описание результата. */
async function tryRestore(entry, guild, settings, map) {
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
        if (nameChange && nameChange.old) {
          await guild.setName(nameChange.old, 'Anti-Crash revert');
          return 'имя сервера возвращено';
        }
        return 'изменение сервера залогировано (иконка/баннер вручную)';
      }
      case 'bot': {
        const bm = await guild.members.fetch(entry.targetId).catch(() => null);
        if (bm && bm.kickable) { await bm.kick('Anti-Crash: несанкционированный бот'); return 'добавленный бот удалён'; }
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

/** Основной обработчик события аудит-лога. */
async function handleAuditEntry(entry, guild) {
  let settings;
  try { settings = await db.getSettings(guild.id); } catch { return; }
  if (!settings.anticrash.enabled) return;

  const executorId = entry.executorId;
  if (!executorId) return;
  if (executorId === guild.client.user.id) return; // наши собственные действия
  if (executorId === guild.ownerId) return;         // владельца не трогаем

  const map = ACTION_MAP[entry.action];
  if (!map || map.kind === 'noop') return;

  const key = map.key;
  const protectedOn = !!(settings.anticrash.protect && settings.anticrash.protect[key]);
  const limitCfg = settings.anticrash.limits && settings.anticrash.limits[key];
  const overLimit = limitCfg ? bumpRate(guild.id, executorId, key, limitCfg) : false;
  const trusted = await isTrusted(guild, settings, executorId);

  // Действуем, если превышен лимит (даже для доверенных) ИЛИ действие защищено и исполнитель недоверенный.
  const act = overLimit || (!trusted && protectedOn);
  if (!act) return;

  const human = HUMAN[key] || key;
  const reason = `Anti-Crash: ${human}${overLimit ? ' (превышен лимит)' : ''}`;

  const restoreResult = await tryRestore(entry, guild, settings, map);
  const punishResult = await punish(guild, executorId, settings, reason);

  await db.addActionLog(guild.id, 'anticrash', executorId, entry.targetId, {
    action: key, overLimit, trusted, restore: restoreResult, punish: punishResult
  });

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle('🛡️ Anti-Crash сработал')
    .addFields(
      { name: 'Нарушитель', value: `<@${executorId}> (${executorId})` },
      { name: 'Действие', value: human, inline: true },
      { name: 'Лимит', value: overLimit ? 'превышен' : 'нет', inline: true },
      { name: 'Наказание', value: punishResult.skipped ? 'уже наказан' : [
        punishResult.stripped ? 'сняты роли' : null,
        punishResult.timedOut ? `timeout ${settings.anticrash.punishTimeoutHours}ч` : null,
        punishResult.left ? 'участник уже вышел' : null
      ].filter(Boolean).join(', ') || 'не удалось' },
      { name: 'Восстановление', value: restoreResult }
    )
    .setTimestamp();
  sendAntiCrashLog(guild, settings, embed);
}

module.exports = { handleAuditEntry, ACTION_MAP };
