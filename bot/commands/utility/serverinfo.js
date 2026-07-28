'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('serverinfo').setDescription('Информация о сервере'),

  async execute(interaction) {
    const g = interaction.guild;
    const owner = await g.fetchOwner().catch(() => null);

    const embed = new EmbedBuilder()
      .setTitle(g.name)
      .setThumbnail(g.iconURL())
      .setColor(0x5865f2)
      .addFields(
        { name: 'ID', value: g.id, inline: true },
        { name: 'Владелец', value: owner ? owner.user.tag : 'неизвестно', inline: true },
        { name: 'Участников', value: String(g.memberCount), inline: true },
        { name: 'Каналов', value: String(g.channels.cache.size), inline: true },
        { name: 'Ролей', value: String(g.roles.cache.size), inline: true },
        { name: 'Создан', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true }
      );

    await interaction.reply({ embeds: [embed] });
  }
};
