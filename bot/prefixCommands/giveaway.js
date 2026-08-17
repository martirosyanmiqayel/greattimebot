'use strict';

const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../shared/db');
const giveaways = require('../services/giveaways');
const { parseDuration, humanizeDuration } = require('../../shared/duration');

module.exports = {
  name: 'giveaway',
  aliases: ['gw', 'розыгрыш'],
  description: '!giveaway start <срок> <кол-во> <приз> | end|reroll|cancel <id> | list',
  permission: PermissionFlagsBits.ManageGuild,
  async run(ctx) {
    const sub = (ctx.args[0] || '').toLowerCase();

    if (sub === 'start' || sub === 'create') {
      const ms = parseDuration(ctx.args[1]);
      const winners = parseInt(ctx.args[2], 10);
      const prize = ctx.args.slice(3).join(' ');
      if (ms == null || Number.isNaN(winners) || winners < 1 || !prize) {
        return ctx.error('Использование: `!giveaway start <срок> <кол-во> <приз>`\nПример: `!giveaway start 1d 1 Discord Nitro`');
      }
      if (ms > 60 * 24 * 3600 * 1000) return ctx.error('Максимум 60 дней.');
      const g = await giveaways.create(ctx.channel, { prize, winners, endsAt: Date.now() + ms, hostId: ctx.author.id });
      if (!g) return ctx.error('Не удалось создать розыгрыш (проверь БД/права бота).');
      return ctx.reply(`✅ Розыгрыш запущен — заканчивается через ${humanizeDuration(ms)}. ID: **${g.id}**. Ограничения по ролям — через \`/giveaway start\`.`);
    }

    if (['end', 'reroll', 'cancel'].includes(sub)) {
      const id = parseInt(ctx.args[1], 10);
      if (Number.isNaN(id)) return ctx.error(`Использование: \`!giveaway ${sub} <id>\``);
      const g = await db.getGiveawayById(ctx.guild.id, id);
      if (!g) return ctx.error('Розыгрыш не найден.');
      if (sub === 'cancel') {
        if (g.ended) return ctx.error('Розыгрыш уже завершён/отменён.');
        await giveaways.cancel(ctx.client, g); return ctx.reply('❌ Розыгрыш отменён.');
      }
      if (sub === 'end') {
        if (g.ended) return ctx.error('Уже завершён.');
        await giveaways.end(ctx.client, g); return ctx.reply('✅ Завершён, победители выбраны.');
      }
      // reroll
      if (g.cancelled) return ctx.error('Розыгрыш был отменён.');
      const w = await giveaways.end(ctx.client, g, { reroll: true });
      return ctx.reply(w.length ? '🎲 Победители перевыбраны.' : 'Недостаточно участников.');
    }

    if (sub === 'list' || !sub) {
      const list = await db.listGuildGiveaways(ctx.guild.id, true);
      if (!list.length) return ctx.reply('Активных розыгрышей нет.');
      const desc = list.map((g) => `**#${g.id}** — ${g.prize} · ${g.winners} побед. · <t:${Math.floor(Number(g.ends_at) / 1000)}:R>`).join('\n');
      return ctx.reply({ embeds: [new EmbedBuilder().setColor(0xff7a29).setTitle('🎉 Активные розыгрыши').setDescription(desc)], allowedMentions: { parse: [] } });
    }
    return ctx.error('Подкоманды: `start`, `end <id>`, `reroll <id>`, `cancel <id>`, `list`.');
  }
};
