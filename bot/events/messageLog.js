'use strict';
const { EmbedBuilder } = require('discord.js');
const db = require('../../shared/db');

module.exports = [
  {
    name: 'messageDelete',
    async execute(message) {
      if (!message.guild || (message.author && message.author.bot)) return;
      const s = await db.getSettings(message.guild.id);
      if (!s.logging.enabled || !s.logging.channelId || !s.logging.events.messageDelete) return;
      const ch = message.guild.channels.cache.get(s.logging.channelId);
      if (!ch) return;
      const embed = new EmbedBuilder().setTitle('Сообщение удалено').setColor(0xed4245)
        .setDescription(message.content ? message.content.slice(0, 1024) : '*(без текста)*')
        .addFields({ name: 'Автор', value: message.author ? message.author.tag : 'неизвестно', inline: true }, { name: 'Канал', value: `<#${message.channel.id}>`, inline: true })
        .setTimestamp();
      ch.send({ embeds: [embed] }).catch(() => {});
    }
  },
  {
    name: 'messageUpdate',
    async execute(oldMessage, newMessage) {
      if (!newMessage.guild || (newMessage.author && newMessage.author.bot)) return;
      if (oldMessage.content === newMessage.content) return;
      const s = await db.getSettings(newMessage.guild.id);
      if (!s.logging.enabled || !s.logging.channelId || !s.logging.events.messageEdit) return;
      const ch = newMessage.guild.channels.cache.get(s.logging.channelId);
      if (!ch) return;
      const embed = new EmbedBuilder().setTitle('Сообщение изменено').setColor(0xfaa61a)
        .addFields(
          { name: 'Было', value: (oldMessage.content || '*(пусто)*').slice(0, 1024) },
          { name: 'Стало', value: (newMessage.content || '*(пусто)*').slice(0, 1024) },
          { name: 'Автор', value: newMessage.author ? newMessage.author.tag : 'неизвестно', inline: true },
          { name: 'Канал', value: `<#${newMessage.channel.id}>`, inline: true }
        ).setTimestamp();
      ch.send({ embeds: [embed] }).catch(() => {});
    }
  }
];
