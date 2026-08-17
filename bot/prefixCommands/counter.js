'use strict';

const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const counters = require('../services/counters');
const db = require('../../shared/db');
const { parseChannelId } = require('../../shared/resolve');

module.exports = {
  name: 'counter',
  aliases: ['stats', 'счётчик'],
  description: '!counter create <тип> | list | remove <#канал>',
  permission: PermissionFlagsBits.ManageChannels,
  async run(ctx) {
    const sub = (ctx.args[0] || '').toLowerCase();
    if (sub === 'create' || sub === 'add') {
      const type = (ctx.args[1] || 'members').toLowerCase();
      if (!counters.TYPES[type]) return ctx.error('Типы: ' + Object.keys(counters.TYPES).join(', '));
      const template = ctx.args.slice(2).join(' ') || undefined;
      const ch = await counters.createCounter(ctx.guild, type, template).catch((e) => { ctx.error('Не удалось создать канал: ' + e.message); return null; });
      if (ch) await ctx.reply(`✅ Счётчик создан: <#${ch.id}> (${ch.name}). Обновляется автоматически.`);
      return;
    }
    if (sub === 'remove' || sub === 'delete') {
      const id = parseChannelId(ctx.args[1]);
      if (!id) return ctx.error('Использование: `!counter remove <#канал>`');
      await counters.removeCounter(ctx.guild, id);
      return ctx.reply('🗑️ Счётчик удалён.');
    }
    if (sub === 'list' || !sub) {
      const settings = await db.getSettings(ctx.guild.id);
      const list = (settings.counters && settings.counters.channels) || [];
      if (!list.length) return ctx.reply('Счётчиков нет. Создать: `!counter create members`');
      const desc = list.map((c) => `<#${c.id}> — тип **${c.type}**`).join('\n');
      return ctx.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('📊 Счётчики-статистика').setDescription(desc)], allowedMentions: { parse: [] } });
    }
    return ctx.error('Подкоманды: `create <тип>`, `list`, `remove <#канал>`. Типы: ' + Object.keys(counters.TYPES).join(', '));
  }
};
