'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const webhook = require('../../services/webhook');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('webhook').setDescription('Отправить сообщение через вебхук')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageWebhooks)
    .addChannelOption((o) => o.setName('channel').setDescription('Куда').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
    .addStringOption((o) => o.setName('message').setDescription('Текст').setRequired(true))
    .addStringOption((o) => o.setName('name').setDescription('Имя отправителя (опц.)'))
    .addStringOption((o) => o.setName('avatar').setDescription('URL аватара (опц.)'))
    .addBooleanOption((o) => o.setName('embed').setDescription('Оформить как embed')),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const res = await webhook.send(channel, {
      content: interaction.options.getString('message'),
      username: interaction.options.getString('name') || undefined,
      avatarURL: interaction.options.getString('avatar') || undefined,
      embed: interaction.options.getBoolean('embed') || false
    });
    await interaction.reply({ content: res.ok ? `✅ Отправлено через вебхук в ${channel}.` : `⚠️ ${res.error}`, ephemeral: true });
  }
};
