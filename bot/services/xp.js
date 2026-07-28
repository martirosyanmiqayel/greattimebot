'use strict';

/**
 * XP-сервис: единая логика начисления опыта, уровней и наград.
 * Используется и префикс-, и slash-командами, и автоматической выдачей.
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../../shared/db');

// Антиспам-кулдаун за сообщения: guildId:userId -> timestamp последнего начисления.
const messageCooldowns = new Map();

/** Синхронизирует формулу уровней в db с настройками сервера (перед любой записью XP). */
function applyFormula(settings) {
  db.setXpFormula(settings.xp.levelBaseXp, settings.xp.levelExponent);
}

/**
 * Изменить XP на delta. Возвращает { row, leveledUp, oldLevel, newLevel }.
 * Не рассылает уведомления — это делает вызывающий (нужен member/канал).
 */
async function changeXp(guild, settings, userId, delta, reason, actorId) {
  applyFormula(settings);
  const before = await db.getXp(guild.id, userId);
  const oldLevel = db.xpToLevel(Number(before.xp || 0));
  const row = await db.addXpDelta(guild.id, userId, delta, reason, actorId);
  const newLevel = row.level;
  return { row, oldLevel, newLevel, leveledUp: newLevel > oldLevel };
}

/** Полностью заменить XP. */
async function setXp(guild, settings, userId, value, reason, actorId) {
  applyFormula(settings);
  const before = await db.getXp(guild.id, userId);
  const oldLevel = db.xpToLevel(Number(before.xp || 0));
  const row = await db.setXpValue(guild.id, userId, value, reason, actorId);
  return { row, oldLevel, newLevel: row.level, leveledUp: row.level > oldLevel };
}

/** Выдать роли-награды за все уровни <= newLevel, которых у участника ещё нет. */
async function grantLevelRoles(guild, settings, member, newLevel) {
  const rewards = (settings.xp.levelRoles || []).filter((r) => r && r.roleId && r.level <= newLevel);
  for (const r of rewards) {
    if (!member.roles.cache.has(r.roleId) && guild.roles.cache.has(r.roleId)) {
      await member.roles.add(r.roleId, `Награда за уровень ${r.level}`).catch(() => {});
    }
  }
}

/** Объявить о повышении уровня (если включено) и выдать роли. */
async function announceLevelUp(guild, settings, member, channel, newLevel) {
  await grantLevelRoles(guild, settings, member, newLevel).catch(() => {});
  if (!settings.xp.announceLevelUp) return;
  const text = String(settings.xp.levelUpMessage || '🎉 {user}, ты достиг {level} уровня!')
    .replace(/\{user\}/g, `${member}`)
    .replace(/\{username\}/g, member.user.username)
    .replace(/\{level\}/g, String(newLevel));
  const target = settings.xp.levelUpChannelId
    ? guild.channels.cache.get(settings.xp.levelUpChannelId)
    : channel;
  if (target && target.isTextBased?.()) target.send({ content: text }).catch(() => {});
}

/** Обработчик сообщения: начисляет XP с учётом кулдауна. */
async function handleMessage(message, settings) {
  if (!settings.xp.enabled) return;
  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const last = messageCooldowns.get(key) || 0;
  const cooldownMs = (settings.xp.messageCooldownSec || 60) * 1000;
  if (now - last < cooldownMs) return;
  messageCooldowns.set(key, now);

  const res = await changeXp(message.guild, settings, message.author.id, settings.xp.perMessage || 10, 'message');
  if (res.leveledUp && message.member) {
    await announceLevelUp(message.guild, settings, message.member, message.channel, res.newLevel);
  }
}

/**
 * Периодическое начисление XP за голосовые каналы.
 * Запускается раз в минуту; награждает всех подключённых (не боты, не в AFK,
 * не одни в канале — чтобы не фармить в одиночку).
 */
async function tickVoiceXp(client) {
  for (const guild of client.guilds.cache.values()) {
    let settings;
    try {
      settings = await db.getSettings(guild.id);
    } catch { continue; }
    if (!settings.xp.enabled || !settings.xp.perVoiceMinute) continue;

    for (const channel of guild.channels.cache.values()) {
      if (!channel.isVoiceBased?.() || channel.id === guild.afkChannelId) continue;
      const humans = channel.members.filter((m) => !m.user.bot);
      if (humans.size < 2) continue; // нужно минимум двое, иначе не считаем
      for (const member of humans.values()) {
        if (member.voice.selfMute || member.voice.selfDeaf) continue; // молчунов не награждаем
        const res = await changeXp(guild, settings, member.id, settings.xp.perVoiceMinute, 'voice');
        if (res.leveledUp) {
          await announceLevelUp(guild, settings, member, channel, res.newLevel);
        }
      }
    }
  }
}

/** Запускает фоновый цикл голосового XP. Возвращает timer (для остановки). */
function startVoiceXp(client) {
  return setInterval(() => {
    tickVoiceXp(client).catch((e) => console.error('[xp] voice tick:', e.message));
  }, 60 * 1000);
}

module.exports = { changeXp, setXp, handleMessage, startVoiceXp, tickVoiceXp, announceLevelUp, grantLevelRoles };
