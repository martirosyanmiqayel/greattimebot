'use strict';

const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../shared/db');
const { parseUserId } = require('../../shared/resolve');

module.exports = {
  name: 'whitelist',
  aliases: ['wl'],
  description: '!whitelist add|remove|list <user> — доверенные для Anti-Crash',
  permission: PermissionFlagsBits.Administrator,
  async run(ctx) {
    const sub = (ctx.args[0] || '').toLowerCase();
    if (sub === 'add') {
      const id = parseUserId(ctx.args[1]);
      if (!id) return ctx.error('Использование: `!whitelist add <@user|id>`');
      await db.whitelistAdd(ctx.guild.id, id, ctx.author.id);
      return ctx.reply(`✅ <@${id}> добавлен в whitelist Anti-Crash.`);
    }
    if (sub === 'remove' || sub === 'rem') {
      const id = parseUserId(ctx.args[1]);
      if (!id) return ctx.error('Использование: `!whitelist remove <@user|id>`');
      const n = await db.whitelistRemove(ctx.guild.id, id);
      return ctx.reply(n ? `🗑️ <@${id}> убран из whitelist.` : 'Этого пользователя нет в whitelist.');
    }
    if (sub === 'list') {
      const rows = await db.whitelistList(ctx.guild.id);
      if (!rows.length) return ctx.reply('Whitelist пуст.');
      const desc = rows.map((r) => `• <@${r.user_id}>`).join('\n');
      return ctx.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setTitle('✅ Whitelist Anti-Crash').setDescription(desc)], allowedMentions: { parse: [] } });
    }
    return ctx.error('Подкоманды: `add`, `remove`, `list`.');
  }
};
