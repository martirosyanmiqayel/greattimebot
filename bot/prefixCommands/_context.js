'use strict';

const { EmbedBuilder } = require('discord.js');

/**
 * Единый контекст для префикс-команды. Сервисный слой (bot/services/*)
 * не знает, вызвали его из slash или из префикса — он работает с примитивами.
 */
function makePrefixContext(message, args, settings) {
  return {
    kind: 'prefix',
    client: message.client,
    guild: message.guild,
    channel: message.channel,
    member: message.member,       // GuildMember автора
    author: message.author,       // User автора
    message,
    args,                         // массив аргументов после команды
    settings,
    /** Ответить: строка или объект ({ embeds, content, ... }). */
    reply(payload) {
      const opts = typeof payload === 'string' ? { content: payload } : payload;
      return message.channel.send({ ...opts, allowedMentions: opts.allowedMentions ?? { repliedUser: false } })
        .catch(() => {});
    },
    error(text) {
      return this.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`⚠️ ${text}`)] });
    }
  };
}

module.exports = { makePrefixContext };
