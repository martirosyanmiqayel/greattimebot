'use strict';

const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const mod = require('../services/moderation');
const db = require('../../shared/db');
const { parseDuration, humanizeDuration } = require('../../shared/duration');
const { parseUserId } = require('../../shared/resolve');

const actorOf = (ctx) => ({ id: ctx.author.id, tag: ctx.author.tag });

module.exports = [
  {
    name: 'ban',
    description: 'Забанить: !ban <user> [срок] [причина]',
    permission: PermissionFlagsBits.BanMembers,
    async run(ctx) {
      const targetId = parseUserId(ctx.args[0]);
      if (!targetId) return ctx.error('Использование: `!ban <@user|id> [срок] [причина]`  напр. `!ban 123 30d Читы`');
      // Второй аргумент — срок, если парсится; иначе это уже причина.
      let rest = ctx.args.slice(1);
      let durationMs = null;
      if (rest[0] && parseDuration(rest[0]) != null) { durationMs = parseDuration(rest.shift()); }
      const reason = rest.join(' ') || 'Причина не указана';
      const res = await mod.ban(ctx.guild, actorOf(ctx), targetId, durationMs, reason, ctx.settings);
      if (!res.ok) return ctx.error(res.error);
      await ctx.reply({ embeds: [res.embed] });
    }
  },
  {
    name: 'unban',
    description: 'Разбанить: !unban <id> [причина]',
    permission: PermissionFlagsBits.BanMembers,
    async run(ctx) {
      const targetId = parseUserId(ctx.args[0]);
      if (!targetId) return ctx.error('Использование: `!unban <id> [причина]`');
      const res = await mod.unban(ctx.guild, actorOf(ctx), targetId, ctx.args.slice(1).join(' '), ctx.settings);
      if (!res.ok) return ctx.error(res.error);
      await ctx.reply({ embeds: [res.embed] });
    }
  },
  {
    name: 'mute',
    description: 'Мут: !mute <user> <срок> [причина]',
    permission: PermissionFlagsBits.ModerateMembers,
    async run(ctx) {
      const targetId = parseUserId(ctx.args[0]);
      const durationMs = parseDuration(ctx.args[1]);
      if (!targetId || durationMs == null) return ctx.error('Использование: `!mute <@user|id> <срок> [причина]`  напр. `!mute 123 2h Flood`');
      const reason = ctx.args.slice(2).join(' ') || 'Причина не указана';
      const res = await mod.mute(ctx.guild, actorOf(ctx), targetId, durationMs, reason, ctx.settings);
      if (!res.ok) return ctx.error(res.error);
      await ctx.reply({ embeds: [res.embed] });
    }
  },
  {
    name: 'unmute',
    description: 'Снять мут: !unmute <user>',
    permission: PermissionFlagsBits.ModerateMembers,
    async run(ctx) {
      const targetId = parseUserId(ctx.args[0]);
      if (!targetId) return ctx.error('Использование: `!unmute <@user|id>`');
      const res = await mod.unmute(ctx.guild, actorOf(ctx), targetId, ctx.settings);
      if (!res.ok) return ctx.error(res.error);
      await ctx.reply({ embeds: [res.embed] });
    }
  },
  {
    name: 'checkmute',
    description: 'Инфо о муте: !checkmute <user>',
    permission: PermissionFlagsBits.ModerateMembers,
    async run(ctx) {
      const targetId = parseUserId(ctx.args[0]);
      if (!targetId) return ctx.error('Использование: `!checkmute <@user|id>`');
      const { muted, action, until } = await mod.checkMute(ctx.guild, targetId);
      if (!muted && !action) return ctx.reply(`У <@${targetId}> нет активного мута.`);
      const modName = action ? `<@${action.moderator}>` : '—';
      const embed = new EmbedBuilder()
        .setColor(muted ? 0x5865f2 : 0x99aab5)
        .setTitle('Проверка мута')
        .addFields(
          { name: 'Участник', value: `<@${targetId}>` },
          { name: 'Статус', value: muted ? '🔇 замьючен' : '🔈 не активен' },
          { name: 'Модератор', value: modName },
          { name: 'Причина', value: action?.reason || '—' },
          { name: 'Срок', value: action?.duration_ms ? humanizeDuration(action.duration_ms) : '—' },
          { name: 'Истекает', value: until ? `<t:${Math.floor(until / 1000)}:R>` : '—' }
        );
      await ctx.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }
  },
  {
    name: 'history',
    aliases: ['logs', 'modlogs'],
    description: 'История наказаний: !history <user>',
    permission: PermissionFlagsBits.ModerateMembers,
    async run(ctx) {
      const targetId = parseUserId(ctx.args[0]);
      if (!targetId) return ctx.error('Использование: `!history <@user|id>`');
      const rows = await db.getModHistory(ctx.guild.id, targetId, 20);
      if (!rows.length) return ctx.reply(`У <@${targetId}> чистая история.`);
      const icon = { ban: '🔨', unban: '♻️', mute: '🔇', unmute: '🔈', kick: '👢', warn: '⚠️' };
      const lines = rows.map((r) => {
        const when = `<t:${Math.floor(r.created_at / 1000)}:d>`;
        const dur = r.duration_ms ? ` · ${humanizeDuration(r.duration_ms)}` : '';
        return `${icon[r.type] || '•'} **${r.type}**${dur} — ${r.reason || 'без причины'} · <@${r.moderator}> · ${when}`;
      });
      const embed = new EmbedBuilder().setColor(0x99aab5)
        .setTitle(`История наказаний`).setDescription(lines.join('\n'))
        .setFooter({ text: `Пользователь ${targetId}` });
      await ctx.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }
  },
  {
    name: 'kick',
    description: 'Кик: !kick <user> [причина]',
    permission: PermissionFlagsBits.KickMembers,
    async run(ctx) {
      const targetId = parseUserId(ctx.args[0]);
      if (!targetId) return ctx.error('Использование: `!kick <@user|id> [причина]`');
      const reason = ctx.args.slice(1).join(' ') || 'Причина не указана';
      const member = await ctx.guild.members.fetch(targetId).catch(() => null);
      if (!member) return ctx.error('Участник не найден.');
      if (!member.kickable) return ctx.error('Не могу кикнуть (роль выше моей?).');
      await member.kick(reason).catch(() => {});
      await db.addModAction({ guild_id: ctx.guild.id, type: 'kick', target_id: targetId, moderator: ctx.author.id, reason, active: false });
      await db.addActionLog(ctx.guild.id, 'kick', ctx.author.id, targetId, { reason });
      const embed = new EmbedBuilder().setTitle('👢 Кик').setColor(0xe67e22).addFields(
        { name: 'Участник', value: `<@${targetId}> (${targetId})` },
        { name: 'Модератор', value: ctx.author.tag },
        { name: 'Причина', value: reason }
      ).setTimestamp();
      require('../../shared/modlog').sendModLog(ctx.guild, ctx.settings, embed);
      await ctx.reply({ embeds: [embed] });
    }
  }
];
