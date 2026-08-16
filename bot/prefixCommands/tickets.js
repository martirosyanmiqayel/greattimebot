'use strict';

const { PermissionFlagsBits } = require('discord.js');
const db = require('../../shared/db');
const { buildPanel } = require('../services/tickets');

module.exports = [
  {
    name: 'close',
    aliases: ['closeticket'],
    description: 'Закрыть текущий тикет (в тикет-канале)',
    permission: PermissionFlagsBits.ManageChannels,
    async run(ctx) {
      const { data } = await db.supabase.from('tickets').select('*')
        .eq('guild_id', ctx.guild.id).eq('channel_id', ctx.channel.id).eq('status', 'open').maybeSingle();
      if (!data) return ctx.error('Эта команда работает только внутри тикет-канала.');
      await db.closeTicket(ctx.channel.id);
      require('../services/ticketlog').logClose(ctx.guild, ctx.settings, ctx.author, ctx.channel);
      await ctx.reply(ctx.settings.tickets.closeMessage || 'Тикет закрывается через 5 секунд...');
      setTimeout(() => ctx.channel.delete().catch(() => {}), 5000);
    }
  },
  {
    name: 'ticketpanel',
    aliases: ['ticket-panel', 'panel'],
    description: 'Отправить панель тикетов в этот канал',
    permission: PermissionFlagsBits.ManageGuild,
    async run(ctx) {
      if (!ctx.settings.tickets.enabled) return ctx.error('Модуль тикетов выключен — включи его на дашборде.');
      await ctx.channel.send(buildPanel(ctx.settings));
      await ctx.message.delete().catch(() => {});
    }
  }
];
