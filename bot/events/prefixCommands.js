'use strict';

/**
 * Диспетчер префикс-команд (!xp, !ban, !whitelist ...).
 * Работает параллельно со slash-командами — те же сервисы под капотом.
 * Автомод сидит в отдельном messageCreate-обработчике; события не мешают друг другу.
 */

const { PermissionFlagsBits } = require('discord.js');
const db = require('../../shared/db');
const { makePrefixContext } = require('../prefixCommands/_context');
const xpService = require('../services/xp');
const { fill } = require('../../shared/text');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (!message.guild || message.author.bot) return;

    const settings = await db.getSettings(message.guild.id);

    // Автоматическое начисление XP за сообщения (с кулдауном внутри сервиса).
    xpService.handleMessage(message, settings).catch((e) => console.error('[xp] message:', e.message));

    if (!client.prefixCommands || client.prefixCommands.size === 0) return;

    const prefix = settings.prefix || '!';
    if (!message.content.startsWith(prefix)) return;

    const parts = message.content.slice(prefix.length).trim().split(/\s+/);
    const name = (parts.shift() || '').toLowerCase();
    if (!name) return;

    const command = client.prefixCommands.get(name);
    if (!command) {
      // Не встроенная команда — может это кастомная команда сервера.
      const custom = await db.getCustomCommand(message.guild.id, name);
      if (custom) {
        const text = fill(custom.response, {
          user: `<@${message.author.id}>`, mention: `<@${message.author.id}>`,
          username: message.author.username, server: message.guild.name,
          count: message.guild.memberCount
        });
        message.channel.send({ content: text.slice(0, 2000), allowedMentions: { parse: ['users'] } }).catch(() => {});
      }
      return;
    }

    const msg = settings.messages || {};
    // Проверка прав.
    if (command.permission && message.member && !message.member.permissions.has(command.permission)) {
      return message.channel.send(msg.noPermission || '⛔ Недостаточно прав для этой команды.').catch(() => {});
    }
    if (command.adminOnly && message.member && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.channel.send(msg.adminOnly || '⛔ Команда только для администраторов.').catch(() => {});
    }

    const ctx = makePrefixContext(message, parts, settings);
    try {
      await command.run(ctx);
    } catch (err) {
      console.error(`[prefix] Ошибка команды ${name}:`, err);
      message.channel.send(msg.commandError || '⚠️ Произошла ошибка при выполнении команды.').catch(() => {});
    }
  }
};
