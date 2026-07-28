'use strict';

/**
 * Полный лог изменений структуры сервера в общий канал логов (logging.channelId).
 * Берёт исполнителя ("кто") из аудит-лога — то, чего не видно из обычных gateway-событий.
 * Anti-Crash слушает то же событие отдельно и пишет в свой канал.
 */

const { AuditLogEvent, EmbedBuilder } = require('discord.js');
const db = require('../../shared/db');
const { sendServerLog } = require('../../shared/modlog');

// action -> { flag (ключ в logging.events), title, color, targetType }
const MAP = {
  [AuditLogEvent.ChannelCreate]: { flag: 'channelCreate', title: '📁 Канал создан', color: 0x57f287, targetType: 'channel' },
  [AuditLogEvent.ChannelDelete]: { flag: 'channelDelete', title: '🗑️ Канал удалён', color: 0xed4245, targetType: 'channelName' },
  [AuditLogEvent.ChannelUpdate]: { flag: 'channelUpdate', title: '✏️ Канал изменён', color: 0xfaa61a, targetType: 'channel' },
  [AuditLogEvent.RoleCreate]: { flag: 'roleCreate', title: '➕ Роль создана', color: 0x57f287, targetType: 'role' },
  [AuditLogEvent.RoleDelete]: { flag: 'roleDelete', title: '➖ Роль удалена', color: 0xed4245, targetType: 'roleName' },
  [AuditLogEvent.RoleUpdate]: { flag: 'roleUpdate', title: '✏️ Роль изменена', color: 0xfaa61a, targetType: 'role' },
  [AuditLogEvent.MemberBanAdd]: { flag: 'memberBan', title: '🔨 Участник забанен', color: 0xed4245, targetType: 'member' },
  [AuditLogEvent.MemberBanRemove]: { flag: 'memberUnban', title: '♻️ Участник разбанен', color: 0x57f287, targetType: 'member' },
  [AuditLogEvent.MemberKick]: { flag: 'memberKick', title: '👢 Участник кикнут', color: 0xe67e22, targetType: 'member' },
  [AuditLogEvent.WebhookCreate]: { flag: 'webhookUpdate', title: '🪝 Вебхук создан', color: 0x57f287, targetType: 'id' },
  [AuditLogEvent.WebhookUpdate]: { flag: 'webhookUpdate', title: '🪝 Вебхук изменён', color: 0xfaa61a, targetType: 'id' },
  [AuditLogEvent.WebhookDelete]: { flag: 'webhookUpdate', title: '🪝 Вебхук удалён', color: 0xed4245, targetType: 'id' },
  [AuditLogEvent.GuildUpdate]: { flag: 'guildUpdate', title: '⚙️ Сервер изменён', color: 0xfaa61a, targetType: 'guild' }
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

module.exports = {
  name: 'guildAuditLogEntryCreate',
  async execute(entry, guild) {
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

    sendServerLog(guild, settings, embed);
    await db.addActionLog(guild.id, info.flag, entry.executorId, entry.targetId, { reason: entry.reason || null });
  }
};
