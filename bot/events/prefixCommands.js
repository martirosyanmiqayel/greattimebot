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
const staff = require('../services/staff');
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
    // Проверки для стафф-команд: права, разрешённый канал, кулдаун.
    if (command.permission || command.adminOnly) {
      if (!staff.passes(message.member, settings, command.permission || null, !!command.adminOnly, command.name)) {
        const text = command.adminOnly
          ? (msg.adminOnly || '⛔ Команда только для администраторов.')
          : (msg.noPermission || '⛔ Недостаточно прав для этой команды.');
        return message.channel.send(text).catch(() => {});
      }
      // Люди из whitelist используют стафф-команды везде и без кулдауна.
      const whitelisted = await staff.isWhitelisted(message.guild, settings, message.member);
      if (!whitelisted) {
        if (!staff.channelAllowed(message.member, settings, message.channel.id)) {
          const chans = (settings.staff.commandChannels || []).map((c) => `<#${c}>`).join(', ');
          return message.channel.send(`⛔ Стафф-команды работают только в: ${chans}`).catch(() => {});
        }
        const remain = staff.cooldownRemaining(message.member, settings, command.name);
        if (remain > 0) return message.channel.send(`⏳ Подожди **${remain} сек** перед повторным использованием.`).catch(() => {});
        staff.markCooldown(message.member, command.name);
      }
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
