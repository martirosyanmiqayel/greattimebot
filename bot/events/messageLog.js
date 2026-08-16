'use strict';
const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const db = require('../../shared/db');
const { sendCategoryLog } = require('../../shared/modlog');

/**
 * Кто удалил сообщение. Discord не сообщает это в gateway-событии —
 * ищем в аудит-логе свежую запись MessageDelete по автору и каналу.
 * Если записи нет — сообщение удалил сам автор (self-delete).
 */
async function findDeleter(message) {
  if (!message.author) return null;
  try {
    const logs = await message.guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 6 });
    const entry = logs.entries.find((e) =>
      e.target && e.target.id === message.author.id &&
      e.extra && e.extra.channel && e.extra.channel.id === message.channel.id &&
      Date.now() - e.createdTimestamp < 10000
    );
    return entry ? entry.executor : null;
  } catch { return null; }
}

module.exports = [
  {
    name: 'messageDelete',
    async execute(message) {
      if (!message.guild || (message.author && message.author.bot)) return;
      const s = await db.getSettings(message.guild.id);
      if (!s.logging.enabled || !s.logging.events.messageDelete) return;
      const deleter = await findDeleter(message);
      const deleterVal = deleter
        ? `<@${deleter.id}> (${deleter.tag})`
        : (message.author ? 'сам автор' : 'неизвестно');
      const embed = new EmbedBuilder().setTitle('🗑️ Сообщение удалено').setColor(0xed4245)
        .setDescription(message.content ? message.content.slice(0, 1024) : '*(без текста)*')
        .addFields(
          { name: 'Автор', value: message.author ? `<@${message.author.id}> (${message.author.tag})` : 'неизвестно', inline: true },
          { name: 'Удалил', value: deleterVal, inline: true },
          { name: 'Канал', value: `<#${message.channel.id}>`, inline: true }
        )
        .setTimestamp();
      sendCategoryLog(message.guild, s, 'messages', embed);
    }
  },
  {
    name: 'messageUpdate',
    async execute(oldMessage, newMessage) {
      if (!newMessage.guild || (newMessage.author && newMessage.author.bot)) return;
      if (oldMessage.content === newMessage.content) return;
      const s = await db.getSettings(newMessage.guild.id);
      if (!s.logging.enabled || !s.logging.events.messageEdit) return;
      const embed = new EmbedBuilder().setTitle('Сообщение изменено').setColor(0xfaa61a)
        .addFields(
          { name: 'Было', value: (oldMessage.content || '*(пусто)*').slice(0, 1024) },
          { name: 'Стало', value: (newMessage.content || '*(пусто)*').slice(0, 1024) },
          { name: 'Автор', value: newMessage.author ? newMessage.author.tag : 'неизвестно', inline: true },
          { name: 'Канал', value: `<#${newMessage.channel.id}>`, inline: true }
        ).setTimestamp();
      sendCategoryLog(newMessage.guild, s, 'messages', embed);
    }
  }
];
