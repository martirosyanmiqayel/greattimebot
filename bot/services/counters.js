'use strict';

/**
 * Счётчики-статистика: голосовые каналы, чьё название показывает число
 * участников/ботов/бустов и т.д. и обновляется автоматически.
 *
 * ВАЖНО: Discord ограничивает переименование канала (≈2 раза за 10 минут).
 * Поэтому переименование троттлится (≥5 мин между правками одного канала),
 * а фоновый цикл раз в 10 минут подхватывает изменения.
 */

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../../shared/db');

// Тип счётчика -> { label по умолчанию, как вычислить значение }.
const TYPES = {
  members: { label: 'Участников', value: (g) => g.memberCount },
  humans: { label: 'Людей', value: (g) => g.memberCount - g.members.cache.filter((m) => m.user.bot).size },
  bots: { label: 'Ботов', value: (g) => g.members.cache.filter((m) => m.user.bot).size },
  boosts: { label: 'Бустов', value: (g) => g.premiumSubscriptionCount || 0 },
  channels: { label: 'Каналов', value: (g) => g.channels.cache.filter((c) => c.type !== ChannelType.GuildCategory).size },
  roles: { label: 'Ролей', value: (g) => g.roles.cache.size - 1 }
};
const DEFAULT_TEMPLATE = '🧡・{label}: {count}';
const COOLDOWN = 5 * 60 * 1000 + 5000; // ≥5 мин (лимит Discord: 2 переименования / 10 мин)

const lastRename = new Map(); // channelId -> timestamp

function typeInfo(type) { return TYPES[type] || TYPES.members; }

/** Итоговое имя канала для счётчика. */
function counterName(guild, counter) {
  const t = typeInfo(counter.type);
  const val = t.value(guild);
  return String(counter.template || DEFAULT_TEMPLATE)
    .replace(/\{count\}/g, val)
    .replace(/\{label\}/g, t.label)
    .slice(0, 100);
}

/** Обновить все счётчики сервера (с троттлингом). */
async function updateGuildCounters(guild) {
  let settings;
  try { settings = await db.getSettings(guild.id); } catch { return; }
  const list = (settings.counters && settings.counters.channels) || [];
  for (const c of list) {
    const ch = guild.channels.cache.get(c.id);
    if (!ch) continue;
    const name = counterName(guild, c);
    if (ch.name === name) continue;
    if (Date.now() - (lastRename.get(ch.id) || 0) < COOLDOWN) continue; // ждём кулдаун
    lastRename.set(ch.id, Date.now());
    await ch.setName(name, 'Обновление счётчика').catch((e) => console.error('[counters] rename:', e.message));
  }
}

/** Фоновый цикл: раз в 10 минут проходит по всем серверам. */
function startCounterLoop(client) {
  return setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      updateGuildCounters(guild).catch((e) => console.error('[counters] loop:', e.message));
    }
  }, 10 * 60 * 1000);
}

/** Создать новый счётчик-канал и сохранить в настройки. */
async function createCounter(guild, type, template) {
  type = TYPES[type] ? type : 'members';
  const counter = { type, template: template || DEFAULT_TEMPLATE };
  const name = counterName(guild, { ...counter, id: null });
  const ch = await guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }]
  });
  counter.id = ch.id;
  const settings = await db.getSettings(guild.id);
  const channels = [...((settings.counters && settings.counters.channels) || []), counter];
  await db.updateSettings(guild.id, { counters: { channels } });
  lastRename.set(ch.id, Date.now());
  return ch;
}

/** Удалить счётчик (и сам канал). */
async function removeCounter(guild, channelId, deleteChannel = true) {
  const settings = await db.getSettings(guild.id);
  const channels = ((settings.counters && settings.counters.channels) || []).filter((c) => c.id !== channelId);
  await db.updateSettings(guild.id, { counters: { channels } });
  if (deleteChannel) {
    const ch = guild.channels.cache.get(channelId);
    if (ch) await ch.delete('Удаление счётчика').catch(() => {});
  }
}

module.exports = { TYPES, DEFAULT_TEMPLATE, updateGuildCounters, startCounterLoop, createCounter, removeCounter, counterName };
