'use strict';

/**
 * Модерация: бан (в т.ч. временный), мут (timeout), размут, история.
 * Пишет в mod_actions (история наказаний) и action_logs (общий лог),
 * шлёт embed в канал логов модерации. Общая логика для slash и префикса.
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../../shared/db');
const { sendModLog } = require('../../shared/modlog');
const { humanizeDuration } = require('../../shared/duration');
const { fill } = require('../../shared/text');

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // лимит Discord на timeout

/** Пытается отправить наказанному ЛС по шаблону из настроек. */
async function dmUser(client, userId, template, vars) {
  const user = await client.users.fetch(userId).catch(() => null);
  if (user) user.send(fill(template, vars)).catch(() => {});
}

/**
 * Бан. durationMs=null => перманент. Возвращает { ok, error?, action }.
 * actor — { id, tag } модератора (или бота при авто-бане Anti-Crash).
 */
async function ban(guild, actor, targetId, durationMs, reason, settings) {
  reason = reason || 'Причина не указана';
  const member = await guild.members.fetch(targetId).catch(() => null);
  if (member && !member.bannable) return { ok: false, error: 'Не могу забанить (роль выше моей или недостаточно прав).' };

  if (settings.moderation.dmOnPunish) {
    await dmUser(guild.client, targetId, settings.moderation.banDm,
      { server: guild.name, reason, moderator: actor.tag, duration: humanizeDuration(durationMs) });
  }

  try {
    await guild.members.ban(targetId, { reason: `${reason} — ${actor.tag}` });
  } catch (e) {
    return { ok: false, error: `Не удалось забанить: ${e.message}` };
  }

  const expires_at = durationMs ? Date.now() + durationMs : null;
  const action = await db.addModAction({
    guild_id: guild.id, type: 'ban', target_id: targetId, moderator: actor.id,
    reason, duration_ms: durationMs ?? null, expires_at, active: true
  });
  await db.addActionLog(guild.id, 'ban', actor.id, targetId, { reason, durationMs, expires_at });

  const embed = new EmbedBuilder().setTitle('🔨 Бан').setColor(0xed4245).addFields(
    { name: 'Участник', value: `<@${targetId}> (${targetId})` },
    { name: 'Срок', value: durationMs ? humanizeDuration(durationMs) : 'навсегда' },
    { name: 'Модератор', value: actor.tag },
    { name: 'Причина', value: reason }
  ).setTimestamp();
  sendModLog(guild, settings, embed);
  return { ok: true, action, embed };
}

/** Разбан вручную (или по истечении временного бана). */
async function unban(guild, actor, targetId, reason, settings) {
  try {
    await guild.members.unban(targetId, reason || 'unban');
  } catch (e) {
    return { ok: false, error: `Не удалось разбанить: ${e.message}` };
  }
  await db.deactivateActions(guild.id, targetId, 'ban');
  await db.addModAction({ guild_id: guild.id, type: 'unban', target_id: targetId, moderator: actor.id, reason: reason || null, active: false });
  await db.addActionLog(guild.id, 'unban', actor.id, targetId, { reason });
  const embed = new EmbedBuilder().setTitle('♻️ Разбан').setColor(0x57f287).addFields(
    { name: 'Участник', value: `<@${targetId}> (${targetId})` },
    { name: 'Модератор', value: actor.tag }
  ).setTimestamp();
  sendModLog(guild, settings, embed);
  return { ok: true, embed };
}

/** Мут через timeout. durationMs обязателен, максимум 28 дней. */
async function mute(guild, actor, targetId, durationMs, reason, settings) {
  reason = reason || 'Причина не указана';
  if (!durationMs) return { ok: false, error: 'Для мута нужен срок. Пример: `2h`, `30m`, `1d`.' };
  if (durationMs > MAX_TIMEOUT_MS) return { ok: false, error: 'Максимальный срок мута — 28 дней.' };
  const member = await guild.members.fetch(targetId).catch(() => null);
  if (!member) return { ok: false, error: 'Участник не найден на сервере.' };
  if (!member.moderatable) return { ok: false, error: 'Не могу замьютить (роль выше моей или недостаточно прав).' };

  try {
    await member.timeout(durationMs, `${reason} — ${actor.tag}`);
  } catch (e) {
    return { ok: false, error: `Не удалось выдать мут: ${e.message}` };
  }

  await db.deactivateActions(guild.id, targetId, 'mute'); // прошлые муты больше не активны
  const expires_at = Date.now() + durationMs;
  const action = await db.addModAction({
    guild_id: guild.id, type: 'mute', target_id: targetId, moderator: actor.id,
    reason, duration_ms: durationMs, expires_at, active: true
  });
  await db.addActionLog(guild.id, 'mute', actor.id, targetId, { reason, durationMs, expires_at });

  if (settings.moderation.dmOnPunish) {
    await dmUser(guild.client, targetId, settings.moderation.muteDm,
      { server: guild.name, reason, moderator: actor.tag, duration: humanizeDuration(durationMs) });
  }

  const embed = new EmbedBuilder().setTitle('🔇 Мут (тайм-аут)').setColor(0x5865f2).addFields(
    { name: 'Участник', value: `<@${targetId}> (${targetId})` },
    { name: 'Срок', value: humanizeDuration(durationMs) },
    { name: 'Модератор', value: actor.tag },
    { name: 'Причина', value: reason }
  ).setTimestamp();
  sendModLog(guild, settings, embed);
  return { ok: true, action, embed };
}

/** Снять мут. */
async function unmute(guild, actor, targetId, settings) {
  const member = await guild.members.fetch(targetId).catch(() => null);
  if (!member) return { ok: false, error: 'Участник не найден.' };
  try {
    await member.timeout(null);
  } catch (e) {
    return { ok: false, error: `Не удалось снять мут: ${e.message}` };
  }
  await db.deactivateActions(guild.id, targetId, 'mute');
  await db.addModAction({ guild_id: guild.id, type: 'unmute', target_id: targetId, moderator: actor.id, active: false });
  await db.addActionLog(guild.id, 'unmute', actor.id, targetId, {});
  const embed = new EmbedBuilder().setTitle('🔈 Мут снят').setColor(0x57f287).addFields(
    { name: 'Участник', value: `<@${targetId}> (${targetId})` },
    { name: 'Модератор', value: actor.tag }
  ).setTimestamp();
  sendModLog(guild, settings, embed);
  return { ok: true, embed };
}

/** Информация о текущем муте (для !checkmute). */
async function checkMute(guild, targetId) {
  const action = await db.getActiveAction(guild.id, targetId, 'mute');
  const member = await guild.members.fetch(targetId).catch(() => null);
  const until = member?.communicationDisabledUntilTimestamp || (action ? action.expires_at : null);
  const muted = !!(until && until > Date.now());
  return { muted, action, until };
}

/** Сброс истёкших временных банов. Вызывается планировщиком. */
async function sweepExpiredBans(client) {
  // Забираем активные баны со сроком; проверяем истечение по каждому серверу.
  const { data } = await db.supabase.from('mod_actions').select('*')
    .eq('type', 'ban').eq('active', true).not('expires_at', 'is', null).lte('expires_at', Date.now());
  for (const row of data || []) {
    const guild = client.guilds.cache.get(row.guild_id);
    if (!guild) continue;
    await unban(guild, { id: client.user.id, tag: client.user.tag }, row.target_id, 'Истёк срок временного бана',
      await db.getSettings(row.guild_id)).catch(() => {});
  }
}

module.exports = { ban, unban, mute, unmute, checkMute, sweepExpiredBans, MAX_TIMEOUT_MS };
