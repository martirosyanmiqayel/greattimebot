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

async function getChannels(guildId) {
  const r = await botFetch(`/guilds/${guildId}/channels`);
  if (!r.ok) throw new Error(`getChannels ${r.status}`);
  return r.json();
}
async function getRoles(guildId) {
  const r = await botFetch(`/guilds/${guildId}/roles`);
  if (!r.ok) throw new Error(`getRoles ${r.status}`);
  return r.json();
}

/**
 * Строит snapshot сервера в том же формате, что и бот (bot/services/backup.js),
 * чтобы !restore / кнопка восстановления в Discord его понимали.
 */
async function buildSnapshot(guildId, guildName) {
  const [channels, roles] = await Promise.all([getChannels(guildId), getRoles(guildId)]);
  return {
    guildId,
    guildName,
    takenAt: Date.now(),
    roles: roles.filter((r) => r.id !== guildId).map((r) => ({
      id: r.id, name: r.name, color: r.color, hoist: r.hoist, position: r.position,
      permissions: String(r.permissions), mentionable: r.mentionable, managed: r.managed
    })),
    channels: channels.map((c) => ({
      id: c.id, name: c.name, type: c.type, parentId: c.parent_id || null,
      position: c.position ?? 0, topic: c.topic ?? null, nsfw: c.nsfw ?? false,
      rateLimitPerUser: c.rate_limit_per_user ?? 0, bitrate: c.bitrate ?? null, userLimit: c.user_limit ?? null,
      overwrites: (c.permission_overwrites || []).map((o) => ({
        id: o.id, type: typeof o.type === 'number' ? o.type : (o.type === 'role' ? 0 : 1),
        allow: String(o.allow), deny: String(o.deny)
      }))
    }))
  };
}

/** Находит вебхук с токеном в канале или создаёт новый (по токену бота). */
async function getOrCreateWebhook(channelId) {
  const r = await botFetch(`/channels/${channelId}/webhooks`);
  if (r.ok) {
    const hooks = await r.json();
    const mine = Array.isArray(hooks) && hooks.find((h) => h.token);
    if (mine) return mine;
  }
  const c = await botFetch(`/channels/${channelId}/webhooks`, { method: 'POST', body: JSON.stringify({ name: 'GreatTime' }) });
  if (!c.ok) throw new Error(`create webhook ${c.status}: ${await c.text()}`);
  return c.json();
}

/** Отправить сообщение через вебхук из панели. */
async function sendWebhookMessage(channelId, { username, avatar_url, content, embeds }) {
  const hook = await getOrCreateWebhook(channelId);
  const r = await fetch(`${API}/webhooks/${hook.id}/${hook.token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username || undefined, avatar_url: avatar_url || undefined, content, embeds, allowed_mentions: { parse: ['users', 'roles'] } })
  });
  if (!r.ok) throw new Error(`webhook send ${r.status}: ${await r.text()}`);
}

module.exports = { botFetch, postMessage, addReaction, parseEmoji, getChannels, getRoles, buildSnapshot, sendWebhookMessage };
