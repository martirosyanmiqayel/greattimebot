'use strict';

/** Отправка сообщений через вебхуки (кастомные имя/аватар). */

const { EmbedBuilder } = require('discord.js');

/** Находит вебхук бота в канале или создаёт новый. */
async function getWebhook(channel) {
  if (!channel || typeof channel.fetchWebhooks !== 'function') return null;
  const hooks = await channel.fetchWebhooks().catch(() => null);
  if (hooks) {
    const mine = hooks.find((h) => h.owner && h.owner.id === channel.client.user.id && h.token);
    if (mine) return mine;
  }
  return channel.createWebhook({ name: 'GreatTime', reason: 'Отправка сообщений через вебхук' }).catch(() => null);
}

/**
 * Отправить через вебхук. opts: { content, username, avatarURL, embed:boolean, title }.
 * embed=true — обернуть content в embed.
 */
async function send(channel, opts = {}) {
  const hook = await getWebhook(channel);
  if (!hook) return { ok: false, error: 'Не удалось создать вебхук. Нужно право «Управление вебхуками» и текстовый канал.' };
  const payload = {
    username: opts.username || undefined,
    avatarURL: opts.avatarURL || undefined,
    allowedMentions: { parse: ['users', 'roles'] }
  };
  if (opts.embed) {
    const e = new EmbedBuilder().setColor(0xe21d18).setDescription((opts.content || '').slice(0, 4000));
    if (opts.title) e.setTitle(String(opts.title).slice(0, 256));
    payload.embeds = [e];
  } else {
    payload.content = (opts.content || '').slice(0, 2000);
  }
  try {
    await hook.send(payload);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { getWebhook, send };
