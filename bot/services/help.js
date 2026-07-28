'use strict';

const { EmbedBuilder } = require('discord.js');

/** Единый help-embed. Показывает, что каждая команда есть и как /, и как !. */
function buildHelpEmbed() {
  const dashUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
  return new EmbedBuilder()
    .setTitle('GreatTime Bot — команды')
    .setColor(0x5865f2)
    .setDescription(`Каждую команду можно вызвать как \`/команда\` и как \`!команда\`.\nНастройка модулей — на дашборде: ${dashUrl} (страница **/commands** — полный список).`)
    .addFields(
      { name: '🛡️ Anti-Crash', value: '`whitelist add/remove/list` · `security`' },
      { name: '💾 Backup', value: '`backup create/list/restore/delete` · `restore <id>`' },
      { name: '⭐ XP и уровни', value: '`xp` · `leaderxp` · `addxp` · `removexp` · `setxp`' },
      { name: '🔨 Модерация', value: '`ban` · `unban` · `mute` · `unmute` · `checkmute` · `kick` · `warn` · `warns` · `unwarn` · `history` · `purge` · `lock` · `unlock` · `slowmode` · `role` · `nick` · `staffstats`' },
      { name: '⚙️ Конфигурация', value: '`config set/get/list` · `security`' },
      { name: '🎫 Тикеты', value: '`ticketpanel` · `close`' },
      { name: '🎭 Роли', value: '`reactionrole <msgId> <эмодзи> <роль>`' },
      { name: '🧰 Утилиты', value: '`ping` · `avatar` · `userinfo` · `serverinfo` · `membercount` · `say` · `embed` · `poll`' },
      { name: '🎲 Развлечения', value: '`8ball` · `roll` · `coinflip`' }
    );
}

module.exports = { buildHelpEmbed };
