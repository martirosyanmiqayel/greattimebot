'use strict';

/**
 * Мини-обёртка над Discord REST API по токену БОТА.
 * Дашборд использует её, чтобы от имени бота публиковать сообщения
 * (панели reaction-ролей) и ставить реакции.
 */

require('dotenv').config();
const API = 'https://discord.com/api/v10';
const TOKEN = process.env.DISCORD_TOKEN;

async function botFetch(endpoint, options = {}) {
  return fetch(`${API}${endpoint}`, {
    ...options,
    headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
}

async function postMessage(channelId, payload) {
  const r = await botFetch(`/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify(payload) });
  if (!r.ok) throw new Error(`postMessage ${r.status}: ${await r.text()}`);
  return r.json();
}

// emojiReaction: для юникода — сам символ; для кастома — 'name:id'
async function addReaction(channelId, messageId, emojiReaction) {
  const e = encodeURIComponent(emojiReaction);
  const r = await botFetch(`/channels/${channelId}/messages/${messageId}/reactions/${e}/@me`, { method: 'PUT' });
  if (!r.ok) throw new Error(`addReaction ${r.status}`);
}

/**
 * Разбирает ввод эмодзи. Возвращает:
 *  key      — что хранить в БД (id для кастома, символ для юникода)
 *  reaction — что слать в API для добавления реакции
 */
function parseEmoji(input) {
  const s = String(input || '').trim();
  const custom = /<a?:(\w+):(\d+)>/.exec(s) || /^(\w+):(\d+)$/.exec(s);
  if (custom) return { key: custom[2], reaction: `${custom[1]}:${custom[2]}`, custom: true };
  return { key: s, reaction: s, custom: false };
}

module.exports = { botFetch, postMessage, addReaction, parseEmoji };
