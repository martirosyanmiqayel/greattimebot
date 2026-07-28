'use strict';

/** Низкоуровневая отправка embed в канал по id (тихо игнорирует ошибки/отсутствие). */
function sendToChannel(guild, channelId, embed) {
  if (!channelId) return;
  const ch = guild.channels.cache.get(channelId);
  if (ch && ch.isTextBased?.()) ch.send({ embeds: [embed] }).catch(() => {});
}

/** Канал логов модерации (moderation.logChannelId). */
function sendModLog(guild, settings, embed) {
  sendToChannel(guild, settings.moderation && settings.moderation.logChannelId, embed);
}

/** Общий канал логов сервера (logging.channelId). */
function sendServerLog(guild, settings, embed) {
  if (!settings.logging || !settings.logging.enabled) return;
  sendToChannel(guild, settings.logging.channelId, embed);
}

/**
 * Отдельный канал Anti-Crash. Если он не задан — падаем на общий канal логов
 * модерации, чтобы событие безопасности не потерялось.
 */
function sendAntiCrashLog(guild, settings, embed) {
  const id = (settings.anticrash && settings.anticrash.logChannelId)
    || (settings.moderation && settings.moderation.logChannelId);
  sendToChannel(guild, id, embed);
}

module.exports = { sendToChannel, sendModLog, sendServerLog, sendAntiCrashLog };
