'use strict';

const { PermissionFlagsBits } = require('discord.js');
const webhook = require('../services/webhook');
const { parseChannelId } = require('../../shared/resolve');

module.exports = {
  name: 'webhook',
  aliases: ['wh'],
  description: 'Отправить сообщение через вебхук: !webhook <#канал> <текст>',
  permission: PermissionFlagsBits.ManageWebhooks,
  async run(ctx) {
    const channelId = parseChannelId(ctx.args[0]);
    const text = ctx.args.slice(1).join(' ');
    if (!channelId || !text) return ctx.error('Использование: `!webhook <#канал|id> <текст>`');
    const channel = ctx.guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased?.()) return ctx.error('Текстовый канал не найден.');
    const res = await webhook.send(channel, { content: text });
    if (!res.ok) return ctx.error(res.error);
    await ctx.reply(`✅ Отправлено через вебхук в <#${channelId}>.`);
    ctx.message.delete().catch(() => {});
  }
};
