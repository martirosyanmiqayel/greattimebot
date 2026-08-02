'use strict';

/** Логи тикетов (кто открыл / кто закрыл) в канал категории 'tickets'. */

const { EmbedBuilder } = require('discord.js');
const { sendCategoryLog } = require('../../shared/modlog');

function logOpen(guild, settings, user, channel) {
  if (!settings.logging || !settings.logging.enabled || !settings.logging.events.ticketOpen) return;
  const embed = new EmbedBuilder().setTitle('🎫 Тикет открыт').setColor(0x57f287)
    .addFields(
      { name: 'Пользователь', value: `<@${user.id}> (${user.tag})`, inline: true },
      { name: 'Канал', value: `<#${channel.id}>`, inline: true }
    ).setTimestamp();
  sendCategoryLog(guild, settings, 'tickets', embed);
}

function logClose(guild, settings, user, channel) {
  if (!settings.logging || !settings.logging.enabled || !settings.logging.events.ticketClose) return;
  const embed = new EmbedBuilder().setTitle('🎫 Тикет закрыт').setColor(0xed4245)
    .addFields(
      { name: 'Закрыл', value: `<@${user.id}> (${user.tag})`, inline: true },
      { name: 'Канал', value: `#${channel.name}`, inline: true }
    ).setTimestamp();
  sendCategoryLog(guild, settings, 'tickets', embed);
}

module.exports = { logOpen, logClose };
