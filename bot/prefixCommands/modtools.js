'use strict';

const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../shared/db');
const { sendModLog } = require('../../shared/modlog');
const { parseUserId, parseRoleId } = require('../../shared/resolve');
const { parseDuration, humanizeDuration } = require('../../shared/duration');

module.exports = [
  {
    name: 'lock',
    description: 'Закрыть текущий канал для @everyone',
    permission: PermissionFlagsBits.ManageChannels,
    async run(ctx) {
      await ctx.channel.permissionOverwrites.edit(ctx.guild.roles.everyone, { SendMessages: false }).catch(() => {});
      await ctx.reply('🔒 Канал закрыт — писать могут только роли с явным разрешением.');
    }
  },
  {
    name: 'unlock',
    description: 'Открыть текущий канал для @everyone',
    permission: PermissionFlagsBits.ManageChannels,
    async run(ctx) {
      await ctx.channel.permissionOverwrites.edit(ctx.guild.roles.everyone, { SendMessages: null }).catch(() => {});
      await ctx.reply('🔓 Канал открыт.');
    }
  },
  {
    name: 'slowmode',
    aliases: ['slow'],
    description: 'Медленный режим: !slowmode <сек|off>',
    permission: PermissionFlagsBits.ManageChannels,
    async run(ctx) {
      const raw = (ctx.args[0] || '').toLowerCase();
      const sec = /^(off|0|нет)$/.test(raw) ? 0 : (parseInt(raw, 10) || 0);
      if (sec < 0 || sec > 21600) return ctx.error('Значение 0–21600 секунд.');
      await ctx.channel.setRateLimitPerUser(sec).catch(() => {});
      await ctx.reply(sec ? `🐌 Медленный режим: **${sec} сек**.` : '⚡ Медленный режим выключен.');
    }
  },
  {
    name: 'role',
    description: 'Выдать/снять роль: !role <user> <role>',
    permission: PermissionFlagsBits.ManageRoles,
    async run(ctx) {
      const uid = parseUserId(ctx.args[0]);
      const rid = parseRoleId(ctx.args[1]);
      if (!uid || !rid) return ctx.error('Использование: `!role <@user|id> <@role|id>`');
      const member = await ctx.guild.members.fetch(uid).catch(() => null);
      const role = ctx.guild.roles.cache.get(rid);
      if (!member || !role) return ctx.error('Участник или роль не найдены.');
      if (role.position >= ctx.guild.members.me.roles.highest.position) return ctx.error('Эта роль выше моей — не могу её выдавать.');
      if (member.roles.cache.has(rid)) {
        await member.roles.remove(rid).catch(() => {});
        return ctx.reply(`➖ Снял роль ${role.name} у ${member.user.tag}.`);
      }
      await member.roles.add(rid).catch(() => {});
      return ctx.reply(`➕ Выдал роль ${role.name} для ${member.user.tag}.`);
    }
  },
  {
    name: 'nick',
    description: 'Сменить ник: !nick <user> [ник|clear]',
    permission: PermissionFlagsBits.ManageNicknames,
    async run(ctx) {
      const uid = parseUserId(ctx.args[0]);
      if (!uid) return ctx.error('Использование: `!nick <@user|id> [ник]`');
      const member = await ctx.guild.members.fetch(uid).catch(() => null);
      if (!member) return ctx.error('Участник не найден.');
      const raw = ctx.args.slice(1).join(' ');
      const nick = /^(clear|reset|-)$/i.test(raw) ? null : raw || null;
      await member.setNickname(nick).catch(() => {});
      return ctx.reply(nick ? `✏️ Ник изменён на **${nick}**.` : '✏️ Ник сброшен.');
    }
  },
  {
    name: 'purge',
    aliases: ['clear'],
    description: 'Удалить N последних сообщений: !purge <n>',
    permission: PermissionFlagsBits.ManageMessages,
    async run(ctx) {
      const n = parseInt(ctx.args[0], 10);
      if (Number.isNaN(n) || n < 1 || n > 100) return ctx.error('Укажи число 1–100: `!purge 20`');
      const deleted = await ctx.channel.bulkDelete(n + 1, true).catch(() => null); // +1 — само сообщение команды
      const count = deleted ? Math.max(0, deleted.size - 1) : 0;
      const m = await ctx.channel.send(`🧹 Удалено сообщений: **${count}**.`);
      setTimeout(() => m.delete().catch(() => {}), 4000);
    }
  },
  {
    name: 'warn',
    description: 'Выдать предупреждение: !warn <user> [причина]',
    permission: PermissionFlagsBits.ModerateMembers,
    async run(ctx) {
      const uid = parseUserId(ctx.args[0]);
      if (!uid) return ctx.error('Использование: `!warn <@user|id> [причина]`');
      const reason = ctx.args.slice(1).join(' ') || 'Причина не указана';
      await db.addWarning(ctx.guild.id, uid, ctx.author.id, reason);
      await db.addModAction({ guild_id: ctx.guild.id, type: 'warn', target_id: uid, moderator: ctx.author.id, reason, active: false });
      const all = await db.getWarnings(ctx.guild.id, uid);
      const embed = new EmbedBuilder().setTitle('⚠️ Предупреждение').setColor(0xfaa61a).addFields(
        { name: 'Участник', value: `<@${uid}>` }, { name: 'Всего варнов', value: `${all.length}` },
        { name: 'Модератор', value: ctx.author.tag }, { name: 'Причина', value: reason }
      ).setTimestamp();
      sendModLog(ctx.guild, ctx.settings, embed);
      await ctx.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }
  },
  {
    name: 'warns',
    aliases: ['warnings'],
    description: 'Показать предупреждения: !warns <user>',
    permission: PermissionFlagsBits.ModerateMembers,
    async run(ctx) {
      const uid = parseUserId(ctx.args[0]);
      if (!uid) return ctx.error('Использование: `!warns <@user|id>`');
      const all = await db.getWarnings(ctx.guild.id, uid);
      if (!all.length) return ctx.reply(`У <@${uid}> нет предупреждений.`);
      const lines = all.map((w, i) => `**${i + 1}.** ${w.reason || 'без причины'} — <@${w.moderator}> · <t:${Math.floor(w.created_at / 1000)}:d>`);
      const embed = new EmbedBuilder().setTitle(`Предупреждения (${all.length})`).setColor(0xfaa61a).setDescription(lines.join('\n'));
      await ctx.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }
  },
  {
    name: 'unwarn',
    aliases: ['clearwarns'],
    description: 'Снять все предупреждения: !unwarn <user>',
    permission: PermissionFlagsBits.ModerateMembers,
    async run(ctx) {
      const uid = parseUserId(ctx.args[0]);
      if (!uid) return ctx.error('Использование: `!unwarn <@user|id>`');
      const n = await db.clearWarnings(ctx.guild.id, uid);
      await ctx.reply(`🧽 Снято предупреждений: **${n}**.`);
    }
  },
  {
    name: 'staffstats',
    aliases: ['staff'],
    description: 'Актив администратора: !staffstats <user>',
    permission: PermissionFlagsBits.ModerateMembers,
    async run(ctx) {
      const uid = ctx.args[0] ? parseUserId(ctx.args[0]) : ctx.author.id;
      if (!uid) return ctx.error('Использование: `!staffstats <@user|id>`');
      const counts = await db.countActionsByModerator(ctx.guild.id, uid);
      const label = { ban: 'Баны', mute: 'Муты', kick: 'Кики', warn: 'Варны', unban: 'Разбаны', unmute: 'Размуты', anticrash: 'Anti-Crash' };
      const lines = Object.keys(counts).length
        ? Object.entries(counts).map(([t, c]) => `${label[t] || t}: **${c}**`).join('\n')
        : 'Нет зафиксированных действий.';
      const user = await ctx.client.users.fetch(uid).catch(() => null);
      const embed = new EmbedBuilder().setColor(0x5865f2)
        .setAuthor({ name: user ? user.tag : uid, iconURL: user ? user.displayAvatarURL() : undefined })
        .setTitle('👮 Актив администратора').setDescription(lines);
      await ctx.reply({ embeds: [embed] });
    }
  }
];
