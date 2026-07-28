'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Информация об участнике')
    .addUserOption((o) => o.setName('user').setDescription('Кто (по умолчанию ты)')),

  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    const embed = new EmbedBuilder()
      .setTitle(`Информация: ${user.tag}`)
      .setThumbnail(user.displayAvatarURL())
      .setColor(0x5865f2)
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Бот?', value: user.bot ? 'да' : 'нет', inline: true },
        { name: 'Аккаунт создан', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: false }
      );

    if (member) {
      embed.addFields(
        { name: 'Зашёл на сервер', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: false },
        { name: 'Ролей', value: String(member.roles.cache.size - 1), inline: true }
      );
    }

    await interaction.reply({ embeds: [embed] });
  }
};
