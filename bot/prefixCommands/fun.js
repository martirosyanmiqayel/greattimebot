'use strict';

const { buildHelpEmbed } = require('../services/help');

const EIGHTBALL = [
  'Бесспорно.', 'Мне кажется — да.', 'Вероятнее всего.', 'Хорошие перспективы.',
  'Пока неясно, попробуй снова.', 'Спроси позже.', 'Даже не думай.',
  'Мой ответ — нет.', 'Весьма сомнительно.', 'Определённо да.'
];

module.exports = [
  {
    name: 'help',
    aliases: ['commands', 'команды'],
    description: 'Список команд бота',
    async run(ctx) {
      await ctx.reply({ embeds: [buildHelpEmbed()] });
    }
  },
  {
    name: '8ball',
    aliases: ['8b', 'шар'],
    description: 'Магический шар: !8ball <вопрос>',
    async run(ctx) {
      const q = ctx.args.join(' ');
      if (!q) return ctx.error('Использование: `!8ball <вопрос>`');
      const a = EIGHTBALL[Math.floor(Math.random() * EIGHTBALL.length)];
      await ctx.reply(`🎱 **Вопрос:** ${q}\n**Ответ:** ${a}`);
    }
  },
  {
    name: 'roll',
    aliases: ['dice', 'кубик'],
    description: 'Бросить кубик: !roll [граней]',
    async run(ctx) {
      const sides = Math.min(1000, Math.max(2, parseInt(ctx.args[0], 10) || 6));
      const result = Math.floor(Math.random() * sides) + 1;
      await ctx.reply(`🎲 Выпало **${result}** (из ${sides}).`);
    }
  },
  {
    name: 'coinflip',
    aliases: ['flip', 'монетка'],
    description: 'Подбросить монетку',
    async run(ctx) {
      await ctx.reply(`🪙 ${Math.random() < 0.5 ? 'Орёл' : 'Решка'}!`);
    }
  }
];
