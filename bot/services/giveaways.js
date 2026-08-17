'use strict';

/**
 * Система розыгрышей: красивый embed + кнопка «🎉 Участвовать», авто-завершение,
 * случайный выбор победителей, реролл, отмена, ограничения по ролям, защита от
 * повторного участия. Все действия — автоматически ботом.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../shared/db');

const BRAND = 0xff7a29;
const HEART = '🧡';

/** Кнопка «Участвовать» (или заблокированная, если розыгрыш завершён). */
function buildRow(active, count) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('gw_enter').setLabel(`Участвовать${count != null ? ` (${count})` : ''}`)
      .setEmoji('🎉').setStyle(ButtonStyle.Success).setDisabled(!active)
  );
}

/** Красивый embed розыгрыша. state: 'active' | 'ended' | 'cancelled'. */
function buildEmbed(g, count, state, winnerIds) {
  const e = new EmbedBuilder().setColor(state === 'cancelled' ? 0x99aab5 : BRAND)
    .setAuthor({ name: 'GreatTime • Розыгрыш' })
    .setTitle(`${HEART} ${g.prize}`)
    .setFooter({ text: `ID розыгрыша: ${g.id || '—'}` })
    .setTimestamp(Number(g.ends_at));

  if (state === 'cancelled') {
    e.setDescription('❌ **Розыгрыш отменён.**');
    return e;
  }
  const endTs = Math.floor(Number(g.ends_at) / 1000);
  const fields = [
    { name: 'Победителей', value: `**${g.winners}**`, inline: true },
    { name: 'Участников', value: `**${count}**`, inline: true },
    { name: g.ended ? 'Завершён' : 'Заканчивается', value: `<t:${endTs}:R>`, inline: true }
  ];
  if (g.host_id) fields.push({ name: 'Организатор', value: `<@${g.host_id}>`, inline: true });
  const req = (g.required_roles || []);
  const exc = (g.excluded_roles || []);
  if (req.length) fields.push({ name: 'Только для ролей', value: req.map((r) => `<@&${r}>`).join(' '), inline: false });
  if (exc.length) fields.push({ name: 'Не могут участвовать', value: exc.map((r) => `<@&${r}>`).join(' '), inline: false });
  if (g.requirement) fields.push({ name: 'Условие', value: String(g.requirement).slice(0, 1024), inline: false });
  e.addFields(fields);

  if (state === 'ended') {
    const winners = (winnerIds && winnerIds.length) ? winnerIds.map((id) => `<@${id}>`).join(', ') : null;
    e.setDescription(winners ? `🎉 **Победители:** ${winners}` : '😔 Победителей нет — недостаточно участников.');
  } else {
    e.setDescription('Нажми **🎉 Участвовать**, чтобы принять участие!');
  }
  return e;
}

/** Проверка права участвовать (роли). Возвращает { ok, reason }. */
function checkEligibility(g, member) {
  const req = g.required_roles || [];
  const exc = g.excluded_roles || [];
  if (exc.length && member.roles.cache.some((r) => exc.includes(r.id))) {
    return { ok: false, reason: 'Тебе нельзя участвовать в этом розыгрыше.' };
  }
  if (req.length && !member.roles.cache.some((r) => req.includes(r.id))) {
    return { ok: false, reason: 'Для участия нужна одна из требуемых ролей.' };
  }
  return { ok: true };
}

/** Случайный выбор n уникальных победителей. */
function pickWinners(userIds, n) {
  const pool = [...userIds];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, Math.max(1, n));
}

/** Создать розыгрыш: постит сообщение с кнопкой и сохраняет в БД. */
async function create(channel, opts) {
  const g = await db.createGiveaway({
    guild_id: channel.guild.id, channel_id: channel.id, prize: opts.prize, winners: opts.winners,
    ends_at: opts.endsAt, requirement: opts.requirement, required_roles: opts.requiredRoles || [],
    excluded_roles: opts.excludedRoles || [], host_id: opts.hostId
  });
  if (!g) return null;
  const msg = await channel.send({ embeds: [buildEmbed(g, 0, 'active')], components: [buildRow(true, 0)] });
  await db.setGiveawayMessage(g.id, msg.id);
  g.message_id = msg.id;
  return g;
}

// Троттлинг обновления счётчика в embed (чтобы не упереться в лимиты правок).
const lastCountEdit = new Map();
async function refreshCount(client, g) {
  const now = Date.now();
  if (now - (lastCountEdit.get(g.id) || 0) < 4000) return;
  lastCountEdit.set(g.id, now);
  const count = await db.countGiveawayEntries(g.id);
  const ch = client.channels.cache.get(g.channel_id) || await client.channels.fetch(g.channel_id).catch(() => null);
  const msg = ch && await ch.messages.fetch(g.message_id).catch(() => null);
  if (msg) msg.edit({ embeds: [buildEmbed(g, count, 'active')], components: [buildRow(true, count)] }).catch(() => {});
}

/** Завершить розыгрыш (или реролл, если reroll=true — розыгрыш уже завершён). */
async function end(client, g, { reroll = false } = {}) {
  const ch = client.channels.cache.get(g.channel_id) || await client.channels.fetch(g.channel_id).catch(() => null);
  const entries = await db.getGiveawayEntries(g.id);
  const winners = entries.length ? pickWinners(entries, g.winners) : [];

  if (reroll) await db.setGiveawayWinners(g.id, winners);
  else await db.finishGiveaway(g.id, winners);

  if (ch) {
    const msg = await ch.messages.fetch(g.message_id).catch(() => null);
    if (msg) msg.edit({ embeds: [buildEmbed({ ...g, ended: true }, entries.length, 'ended', winners)], components: [buildRow(false)] }).catch(() => {});
    const text = winners.length
      ? `🎉 ${reroll ? '**Новые победители**' : 'Победител' + (winners.length > 1 ? 'и' : 'ь')} розыгрыша **${g.prize}**: ${winners.map((id) => `<@${id}>`).join(', ')} — поздравляем!`
      : `😔 В розыгрыше **${g.prize}** недостаточно участников — победителей нет.`;
    ch.send({ content: text, reply: g.message_id ? { messageReference: g.message_id, failIfNotExists: false } : undefined, allowedMentions: { users: winners } }).catch(() => {});
  }
  return winners;
}

/** Отменить розыгрыш. */
async function cancel(client, g) {
  await db.cancelGiveaway(g.id);
  const ch = client.channels.cache.get(g.channel_id) || await client.channels.fetch(g.channel_id).catch(() => null);
  const msg = ch && await ch.messages.fetch(g.message_id).catch(() => null);
  if (msg) msg.edit({ embeds: [buildEmbed(g, 0, 'cancelled')], components: [buildRow(false)] }).catch(() => {});
}

/** Фоновая проверка: завершать розыгрыши, у которых вышло время. */
function startLoop(client) {
  return setInterval(async () => {
    const due = await db.listDueGiveaways().catch(() => []);
    for (const g of due) {
      await end(client, g).catch((e) => console.error('[giveaway] auto-end:', e.message));
    }
  }, 20 * 1000);
}

module.exports = { buildEmbed, buildRow, checkEligibility, pickWinners, create, refreshCount, end, cancel, startLoop };
