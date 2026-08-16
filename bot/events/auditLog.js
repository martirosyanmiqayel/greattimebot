'use strict';

/**
 * Полный лог изменений структуры сервера в общий канал логов (logging.channelId).
 * Берёт исполнителя ("кто") из аудит-лога — то, чего не видно из обычных gateway-событий.
 * Anti-Crash слушает то же событие отдельно и пишет в свой канал.
 */

const { AuditLogEvent, EmbedBuilder } = require('discord.js');
const db = require('../../shared/db');
const { sendCategoryLog } = require('../../shared/modlog');

// action -> { flag (ключ в logging.events), title, color, targetType, cat (категория канала) }
const MAP = {
  [AuditLogEvent.ChannelCreate]: { flag: 'channelCreate', title: '📁 Канал создан', color: 0x57f287, targetType: 'channel', cat: 'server' },
  [AuditLogEvent.ChannelDelete]: { flag: 'channelDelete', title: '🗑️ Канал удалён', color: 0xed4245, targetType: 'channelName', cat: 'server' },
  [AuditLogEvent.ChannelUpdate]: { flag: 'channelUpdate', title: '✏️ Канал изменён', color: 0xfaa61a, targetType: 'channel', cat: 'server' },
  [AuditLogEvent.RoleCreate]: { flag: 'roleCreate', title: '➕ Роль создана', color: 0x57f287, targetType: 'role', cat: 'roles' },
  [AuditLogEvent.RoleDelete]: { flag: 'roleDelete', title: '➖ Роль удалена', color: 0xed4245, targetType: 'roleName', cat: 'roles' },
  [AuditLogEvent.RoleUpdate]: { flag: 'roleUpdate', title: '✏️ Роль изменена', color: 0xfaa61a, targetType: 'role', cat: 'roles' },
  [AuditLogEvent.MemberBanAdd]: { flag: 'memberBan', title: '🔨 Участник забанен', color: 0xed4245, targetType: 'member', cat: 'moderation' },
  [AuditLogEvent.MemberBanRemove]: { flag: 'memberUnban', title: '♻️ Участник разбанен', color: 0x57f287, targetType: 'member', cat: 'moderation' },
  [AuditLogEvent.MemberKick]: { flag: 'memberKick', title: '👢 Участник кикнут', color: 0xe67e22, targetType: 'member', cat: 'moderation' },
  [AuditLogEvent.WebhookCreate]: { flag: 'webhookUpdate', title: '🪝 Вебхук создан', color: 0x57f287, targetType: 'id', cat: 'server' },
  [AuditLogEvent.WebhookUpdate]: { flag: 'webhookUpdate', title: '🪝 Вебхук изменён', color: 0xfaa61a, targetType: 'id', cat: 'server' },
  [AuditLogEvent.WebhookDelete]: { flag: 'webhookUpdate', title: '🪝 Вебхук удалён', color: 0xed4245, targetType: 'id', cat: 'server' },
  [AuditLogEvent.GuildUpdate]: { flag: 'guildUpdate', title: '⚙️ Сервер изменён', color: 0xfaa61a, targetType: 'guild', cat: 'server' }
};

function targetLabel(entry, type) {
  switch (type) {
    case 'channel': return `<#${entry.targetId}>`;
    case 'channelName': return `#${entry.changes?.find((c) => c.key === 'name')?.old || entry.targetId}`;
    case 'role': return `<@&${entry.targetId}>`;
    case 'roleName': return entry.changes?.find((c) => c.key === 'name')?.old || `роль ${entry.targetId}`;
    case 'member': return `<@${entry.targetId}>`;
    case 'guild': return 'сервер';
    default: return `\`${entry.targetId}\``;
  }
}

/** Сжатое описание изменений (для update-действий). */
function changesText(entry) {
  const parts = [];
  for (const c of entry.changes || []) {
    if (['permission_overwrites', 'permissions'].includes(c.key)) { parts.push(`${c.key}: изменены`); continue; }
    const fmt = (v) => v == null ? '∅' : String(v).slice(0, 40);
    parts.push(`${c.key}: ${fmt(c.old)} → ${fmt(c.new)}`);
  }
  return parts.length ? parts.join('\n').slice(0, 1024) : null;
}

/** Выдача/снятие ролей участнику — кто, кому, какие роли (канал 'roles'). */
async function logMemberRole(entry, guild) {
  let settings;
  try { settings = await db.getSettings(guild.id); } catch { return; }
  if (!settings.logging.enabled || settings.logging.events.memberRole === false) return;
  const added = ((entry.changes || []).find((c) => c.key === '$add') || {}).new || [];
  const removed = ((entry.changes || []).find((c) => c.key === '$remove') || {}).new || [];
  if (!added.length && !removed.length) return;
  const embed = new EmbedBuilder().setTitle('🎭 Роли участника изменены').setColor(0xfaa61a).setTimestamp()
    .addFields(
      { name: 'Участник', value: `<@${entry.targetId}>`, inline: true },
      { name: 'Кто изменил', value: entry.executorId ? `<@${entry.executorId}>` : 'неизвестно', inline: true }
    );
  if (added.length) embed.addFields({ name: '➕ Выдал роль', value: added.map((r) => `<@&${r.id}>`).join(' ') });
  if (removed.length) embed.addFields({ name: '➖ Снял роль', value: removed.map((r) => `<@&${r.id}>`).join(' ') });
  sendCategoryLog(guild, settings, 'roles', embed);
  await db.addActionLog(guild.id, 'memberRole', entry.executorId, entry.targetId, { added: added.map((r) => r.id), removed: removed.map((r) => r.id) });
}

/** Перемещение/отключение участников в голосовых модератором (канал 'voice'). */
async function logVoiceMod(entry, guild, kind) {
  let settings;
  try { settings = await db.getSettings(guild.id); } catch { return; }
  if (!settings.logging.enabled || !settings.logging.events.voice) return;
  const count = (entry.extra && entry.extra.count) || 1;
  const chan = entry.extra && entry.extra.channel;
  const who = entry.executorId ? `<@${entry.executorId}>` : 'неизвестно';
  let embed;
  if (kind === 'move') {
    embed = new EmbedBuilder().setTitle('🔀 Участников переместили в голосовом').setColor(0xfaa61a).setTimestamp()
      .addFields(
        { name: 'Кто перекинул', value: who, inline: true },
        { name: 'Куда', value: chan ? `<#${chan.id}>` : '—', inline: true },
        { name: 'Сколько', value: `${count}`, inline: true }
      );
  } else {
    embed = new EmbedBuilder().setTitle('🔇 Участников отключили от голосового').setColor(0xed4245).setTimestamp()
      .addFields(
        { name: 'Кто отключил', value: who, inline: true },
        { name: 'Сколько', value: `${count}`, inline: true }
      );
  }
  sendCategoryLog(guild, settings, 'voice', embed);
}

module.exports = {
  name: 'guildAuditLogEntryCreate',
  async execute(entry, guild) {
    // Спец-случаи: изменение ролей участника и перемещение/отключение в голосовых.
    if (entry.action === AuditLogEvent.MemberRoleUpdate) return logMemberRole(entry, guild);
    if (entry.action === AuditLogEvent.MemberMove) return logVoiceMod(entry, guild, 'move');
    if (entry.action === AuditLogEvent.MemberDisconnect) return logVoiceMod(entry, guild, 'disconnect');

    const info = MAP[entry.action];
    if (!info) return;
    let settings;
    try { settings = await db.getSettings(guild.id); } catch { return; }
    if (!settings.logging.enabled || !settings.logging.channelId) return;
    if (settings.logging.events[info.flag] === false) return;

    const embed = new EmbedBuilder().setTitle(info.title).setColor(info.color).setTimestamp()
      .addFields(
        { name: 'Объект', value: targetLabel(entry, info.targetType), inline: true },
        { name: 'Кто', value: entry.executorId ? `<@${entry.executorId}>` : 'неизвестно', inline: true }
      );
    const changes = changesText(entry);
    if (changes) embed.addFields({ name: 'Изменения', value: changes });
    if (entry.reason) embed.addFields({ name: 'Причина', value: entry.reason.slice(0, 512) });

    sendCategoryLog(guild, settings, info.cat, embed);
    await db.addActionLog(guild.id, info.flag, entry.executorId, entry.targetId, { reason: entry.reason || null });
  }
};
