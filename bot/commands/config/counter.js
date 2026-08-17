'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const counters = require('../../services/counters');
const db = require('../../../shared/db');

const typeChoices = Object.keys(counters.TYPES).map((t) => ({ name: t, value: t }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('counter').setDescription('Счётчики-статистика (голосовые каналы)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((s) => s.setName('create').setDescription('Создать счётчик-канал')
      .addStringOption((o) => o.setName('type').setDescription('Что считать').setRequired(true).addChoices(...typeChoices))
      .addStringOption((o) => o.setName('template').setDescription('Шаблон, напр. 🧡・{label}: {count}')))
    .addSubcommand((s) => s.setName('list').setDescription('Список счётчиков'))
    .addSubcommand((s) => s.setName('remove').setDescription('Удалить счётчик')
      .addChannelOption((o) => o.setName('channel').setDescription('Канал-счётчик').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'create') {
      const type = interaction.options.getString('type');
      const template = interaction.options.getString('template') || undefined;
      await interaction.deferReply({ ephemeral: true });
      try {
        const ch = await counters.createCounter(interaction.guild, type, template);
        return interaction.editReply(`✅ Счётчик создан: <#${ch.id}> (${ch.name}). Обновляется автоматически.`);
      } catch (e) {
        return interaction.editReply('⚠️ Не удалось создать: ' + e.message);
      }
    }
    if (sub === 'remove') {
      const ch = interaction.options.getChannel('channel');
      await counters.removeCounter(interaction.guild, ch.id);
      return interaction.reply({ content: '🗑️ Счётчик удалён.', ephemeral: true });
    }
    const settings = await db.getSettings(interaction.guild.id);
    const list = (settings.counters && settings.counters.channels) || [];
    if (!list.length) return interaction.reply({ content: 'Счётчиков нет. Создай через `/counter create`.', ephemeral: true });
    const desc = list.map((c) => `<#${c.id}> — тип **${c.type}**`).join('\n');
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('📊 Счётчики-статистика').setDescription(desc)], ephemeral: true });
  }
};
