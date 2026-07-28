'use strict';

const { ActivityType } = require('discord.js');
const xpService = require('../services/xp');
const backupService = require('../services/backup');
const moderation = require('../services/moderation');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`[bot] Вошёл как ${client.user.tag}. Серверов: ${client.guilds.cache.size}`);
    client.user.setActivity('GreatTime • /help', { type: ActivityType.Watching });

    // --- Фоновые задачи ---
    // XP за голосовые каналы (раз в минуту).
    xpService.startVoiceXp(client);
    // Авто-backup структуры сервера (частый тик, реальный интервал — из настроек).
    backupService.startBackupLoop(client);
    // Снятие истёкших временных банов (раз в минуту).
    setInterval(() => {
      moderation.sweepExpiredBans(client).catch((e) => console.error('[mod] sweepBans:', e.message));
    }, 60 * 1000);

    // Устойчивость: логируем проблемы соединения (discord.js сам переподключается).
    client.on('error', (e) => console.error('[bot] client error:', e.message));
    client.on('warn', (m) => console.warn('[bot] warn:', m));
    client.on('shardError', (e) => console.error('[bot] shard error:', e.message));
    client.on('shardReconnecting', (id) => console.log(`[bot] shard ${id} переподключается...`));
    client.on('shardResume', (id) => console.log(`[bot] shard ${id} восстановлен.`));

    console.log('[bot] Фоновые задачи запущены (XP-voice, backup, ban-sweep).');
  }
};
