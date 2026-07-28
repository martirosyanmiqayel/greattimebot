'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Удалить последние N сообщений в канале')
    .addIntegerOption((o) =>
      o.setName('count').setDescription('Сколько (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const count = interaction.options.getInteger('count');
    // bulkDelete не трогает сообщения старше 14 дней
    const deleted = await interaction.channel.bulkDelete(count, true).catch(() => null);
    if (!deleted) {
      return interaction.reply({ content: 'Не удалось удалить (сообщения старше 14 дней?).', ephemeral: true });
    }
    await interaction.reply({ content: `Удалено сообщений: ${deleted.size}.`, ephemeral: true });
  }
};
