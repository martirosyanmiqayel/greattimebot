'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../../shared/db');
const giveaways = require('../../services/giveaways');
const { parseDuration, humanizeDuration } = require('../../../shared/duration');

/** Разбор срока: длительность (1d/2h) или точная дата. Возвращает ms-таймстамп или null. */
function resolveEnd(str) {
  const ms = parseDuration(str);
  if (ms != null) return Date.now() + ms;
  const t = Date.parse(str);
  return Number.isNaN(t) ? null : t;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway').setDescription('Розыгрыши')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('start').setDescription('Запустить розыгрыш')
      .addStringOption((o) => o.setName('prize').setDescription('Приз').setRequired(true))
      .addStringOption((o) => o.setName('duration').setDescription('Длительность (1d, 2h, 30m) или дата').setRequired(true))
      .addIntegerOption((o) => o.setName('winners').setDescription('Кол-во победителей (по умолч. 1)').setMinValue(1).setMaxValue(50))
      .addStringOption((o) => o.setName('requirement').setDescription('Условие участия (текст)'))
      .addRoleOption((o) => o.setName('required_role').setDescription('Требуемая роль'))
      .addRoleOption((o) => o.setName('excluded_role').setDescription('Исключить роль'))
      .addChannelOption((o) => o.setName('channel').setDescription('Канал (по умолч. текущий)')))
    .addSubcommand((s) => s.setName('end').setDescription('Завершить досрочно')
      .addStringOption((o) => o.setName('id').setDescription('ID розыгрыша').setRequired(true)))
    .addSubcommand((s) => s.setName('reroll').setDescription('Перевыбрать победителей')
      .addStringOption((o) => o.setName('id').setDescription('ID розыгрыша').setRequired(true)))
    .addSubcommand((s) => s.setName('cancel').setDescription('Отменить розыгрыш')
      .addStringOption((o) => o.setName('id').setDescription('ID розыгрыша').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Активные розыгрыши')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      const endsAt = resolveEnd(interaction.options.getString('duration'));
      if (!endsAt || endsAt <= Date.now()) return interaction.reply({ content: 'Неверный срок. Примеры: `1d`, `2h`, `30m` или дата в будущем.', ephemeral: true });
      if (endsAt - Date.now() > 60 * 24 * 3600 * 1000) return interaction.reply({ content: 'Максимум 60 дней.', ephemeral: true });
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const reqRole = interaction.options.getRole('required_role');
      const excRole = interaction.options.getRole('excluded_role');
      const g = await giveaways.create(channel, {
        prize: interaction.options.getString('prize'),
        winners: interaction.options.getInteger('winners') || 1,
        endsAt,
        requirement: interaction.options.getString('requirement') || null,
        requiredRoles: reqRole ? [reqRole.id] : [],
        excludedRoles: excRole ? [excRole.id] : [],
        hostId: interaction.user.id
      });
      if (!g) return interaction.reply({ content: '⚠️ Не удалось создать розыгрыш (проверь БД/права бота).', ephemeral: true });
      return interaction.reply({ content: `✅ Розыгрыш запущен в <#${channel.id}> — заканчивается через ${humanizeDuration(endsAt - Date.now())}. ID: **${g.id}**`, ephemeral: true });
    }

    const id = parseInt(interaction.options.getString('id'), 10);
    if (sub !== 'list' && Number.isNaN(id)) return interaction.reply({ content: 'Укажи числовой ID розыгрыша.', ephemeral: true });

    if (sub === 'end') {
      const g = await db.getGiveawayById(interaction.guild.id, id);
      if (!g) return interaction.reply({ content: 'Розыгрыш не найден.', ephemeral: true });
      if (g.ended) return interaction.reply({ content: 'Этот розыгрыш уже завершён.', ephemeral: true });
      await giveaways.end(interaction.client, g);
      return interaction.reply({ content: '✅ Розыгрыш завершён, победители выбраны.', ephemeral: true });
    }
    if (sub === 'reroll') {
      const g = await db.getGiveawayById(interaction.guild.id, id);
      if (!g) return interaction.reply({ content: 'Розыгрыш не найден.', ephemeral: true });
      if (g.cancelled) return interaction.reply({ content: 'Розыгрыш был отменён.', ephemeral: true });
      const winners = await giveaways.end(interaction.client, g, { reroll: true });
      return interaction.reply({ content: winners.length ? '🎲 Победители перевыбраны.' : 'Недостаточно участников для реролла.', ephemeral: true });
    }
    if (sub === 'cancel') {
      const g = await db.getGiveawayById(interaction.guild.id, id);
      if (!g) return interaction.reply({ content: 'Розыгрыш не найден.', ephemeral: true });
      if (g.ended) return interaction.reply({ content: 'Розыгрыш уже завершён/отменён.', ephemeral: true });
      await giveaways.cancel(interaction.client, g);
      return interaction.reply({ content: '❌ Розыгрыш отменён.', ephemeral: true });
    }

    const list = await db.listGuildGiveaways(interaction.guild.id, true);
    if (!list.length) return interaction.reply({ content: 'Активных розыгрышей нет.', ephemeral: true });
    const desc = list.map((g) => `**#${g.id}** — ${g.prize} · ${g.winners} побед. · <t:${Math.floor(Number(g.ends_at) / 1000)}:R> · [перейти](https://discord.com/channels/${g.guild_id}/${g.channel_id}/${g.message_id})`).join('\n');
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xff7a29).setTitle('🎉 Активные розыгрыши').setDescription(desc)], ephemeral: true });
  }
};
