'use strict';

/**
 * Развлекательные команды: /8ball, /roll, /coinflip.
 * Экспортируем массив — index.js это поддерживает.
 */

const { SlashCommandBuilder } = require('discord.js');

const EIGHTBALL = [
  'Бесспорно.', 'Мне кажется — да.', 'Вероятнее всего.', 'Хорошие перспективы.',
  'Пока неясно, попробуй снова.', 'Спроси позже.', 'Даже не думай.',
  'Мой ответ — нет.', 'Весьма сомнительно.', 'Определённо да.'
];

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('8ball')
      .setDescription('Магический шар отвечает на твой вопрос')
      .addStringOption((o) => o.setName('question').setDescription('Вопрос').setRequired(true)),
    async execute(interaction) {
      const q = interaction.options.getString('question');
      const a = EIGHTBALL[Math.floor(Math.random() * EIGHTBALL.length)];
      await interaction.reply(`🎱 **Вопрос:** ${q}\n**Ответ:** ${a}`);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('roll')
      .setDescription('Бросить кубик')
      .addIntegerOption((o) => o.setName('sides').setDescription('Граней (по умолчанию 6)').setMinValue(2).setMaxValue(1000)),
    async execute(interaction) {
      const sides = interaction.options.getInteger('sides') || 6;
      const result = Math.floor(Math.random() * sides) + 1;
      await interaction.reply(`🎲 Выпало **${result}** (из ${sides}).`);
    }
  },
  {
    data: new SlashCommandBuilder().setName('coinflip').setDescription('Подбросить монетку'),
    async execute(interaction) {
      await interaction.reply(`🪙 ${Math.random() < 0.5 ? 'Орёл' : 'Решка'}!`);
    }
  }
];
