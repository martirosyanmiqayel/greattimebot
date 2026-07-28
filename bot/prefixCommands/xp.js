'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../shared/db');
const xpService = require('../services/xp');
const { fetchUser } = require('../../shared/resolve');

/** Формирует embed профиля XP. */
function xpEmbed(user, row, settings) {
  db.setXpFormula(settings.xp.levelBaseXp, settings.xp.levelExponent);
  const level = db.xpToLevel(Number(row.xp || 0));
  const nextAt = db.levelToXp(level + 1);
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
    .addFields(
      { name: 'XP', value: `${row.xp || 0}`, inline: true },
      { name: 'Уровень', value: `${level}`, inline: true },
      { name: 'До следующего', value: `${Math.max(0, nextAt - Number(row.xp || 0))} XP`, inline: true }
    );
}

module.exports = [
  {
    name: 'xp',
    aliases: ['rank', 'level'],
    description: 'Показать свой XP или XP пользователя',
    async run(ctx) {
      const target = ctx.args[0] ? await fetchUser(ctx.client, ctx.args[0]) : ctx.author;
      if (!target) return ctx.error('Пользователь не найден. Укажи упоминание или ID.');
      const row = await db.getXp(ctx.guild.id, target.id);
      await ctx.reply({ embeds: [xpEmbed(target, row, ctx.settings)] });
    }
  },
  {
    name: 'leaderxp',
    aliases: ['leaderboard', 'top', 'topxp'],
    description: 'Топ пользователей по XP',
    async run(ctx) {
      const top = await db.topXp(ctx.guild.id, 10);
      if (!top.length) return ctx.reply('Пока никто не набрал XP.');
      const lines = top.map((r, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
        return `${medal} <@${r.user_id}> — **${r.xp}** XP (ур. ${r.level})`;
      });
      const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle('🏆 Топ по XP').setDescription(lines.join('\n'));
      await ctx.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }
  },
  {
    name: 'setxp',
    description: 'Полностью заменить XP пользователю (админ)',
    permission: PermissionFlagsBits.ManageGuild,
    async run(ctx) {
      const target = ctx.args[0] ? await fetchUser(ctx.client, ctx.args[0]) : null;
      const value = parseInt(ctx.args[1], 10);
      if (!target || Number.isNaN(value)) return ctx.error('Использование: `!setxp @user 5000`');
      const res = await xpService.setXp(ctx.guild, ctx.settings, target.id, value, 'setxp', ctx.author.id);
      await ctx.reply(`✅ XP пользователя ${target.tag} теперь **${res.row.xp}** (ур. ${res.row.level}).`);
    }
  },
  {
    name: 'addxp',
    description: 'Добавить XP пользователю (админ)',
    permission: PermissionFlagsBits.ManageGuild,
    async run(ctx) {
      const target = ctx.args[0] ? await fetchUser(ctx.client, ctx.args[0]) : null;
      const amount = parseInt(ctx.args[1], 10);
      if (!target || Number.isNaN(amount)) return ctx.error('Использование: `!addxp @user 300`');
      const res = await xpService.changeXp(ctx.guild, ctx.settings, target.id, Math.abs(amount), 'addxp', ctx.author.id);
      const member = await ctx.guild.members.fetch(target.id).catch(() => null);
      if (res.leveledUp && member) await xpService.announceLevelUp(ctx.guild, ctx.settings, member, ctx.channel, res.newLevel);
      await ctx.reply(`✅ Добавлено **${Math.abs(amount)}** XP. Теперь у ${target.tag}: **${res.row.xp}** (ур. ${res.row.level}).`);
    }
  },
  {
    name: 'removexp',
    aliases: ['remxp'],
    description: 'Убрать XP у пользователя (админ)',
    permission: PermissionFlagsBits.ManageGuild,
    async run(ctx) {
      const target = ctx.args[0] ? await fetchUser(ctx.client, ctx.args[0]) : null;
      const amount = parseInt(ctx.args[1], 10);
      if (!target || Number.isNaN(amount)) return ctx.error('Использование: `!removexp @user 300`');
      const res = await xpService.changeXp(ctx.guild, ctx.settings, target.id, -Math.abs(amount), 'removexp', ctx.author.id);
      await ctx.reply(`✅ Снято **${Math.abs(amount)}** XP. Теперь у ${target.tag}: **${res.row.xp}** (ур. ${res.row.level}).`);
    }
  }
];
