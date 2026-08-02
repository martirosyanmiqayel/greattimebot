'use strict';

/** Логи голосовых каналов: заход, выход, переход — в канал категории 'voice'. */

const { EmbedBuilder } = require('discord.js');
const db = require('../../shared/db');
const { sendCategoryLog } = require('../../shared/modlog');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;
    const member = newState.member || oldState.member;
    if (member && member.user.bot) return;

    let settings;
    try { settings = await db.getSettings(guild.id); } catch { return; }
    if (!settings.logging.enabled || !settings.logging.events.voice) return;

    const before = oldState.channelId;
    const after = newState.channelId;
    if (before === after) return; // мут/деаф и т.п. не логируем

    let title, color, desc;
    if (!before && after) {
      title = '🔊 Заход в голосовой'; color = 0x57f287; desc = `<@${member.id}> зашёл в <#${after}>`;
    } else if (before && !after) {
      title = '🔇 Выход из голосового'; color = 0xed4245; desc = `<@${member.id}> вышел из <#${before}>`;
    } else {
      title = '🔀 Переход в голосовом'; color = 0xfaa61a; desc = `<@${member.id}>: <#${before}> → <#${after}>`;
    }

    const embed = new EmbedBuilder().setTitle(title).setColor(color).setDescription(desc).setTimestamp();
    sendCategoryLog(guild, settings, 'voice', embed);
  }
};
