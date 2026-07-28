'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const config = require('../../services/config');
const db = require('../../../shared/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config').setDescription('Настройки сервера через команды')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('set').setDescription('Изменить настройку')
      .addStringOption((o) => o.setName('key').setDescription('Ключ, напр. xp.perMessage').setRequired(true))
      .addStringOption((o) => o.setName('value').setDescription('Значение').setRequired(true)))
    .addSubcommand((s) => s.setName('get').setDescription('Показать настройку')
      .addStringOption((o) => o.setName('key').setDescription('Ключ').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Все настраиваемые ключи')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'set') {
      const res = await config.setValue(interaction.guild.id, interaction.options.getString('key'), interaction.options.getString('value'));
      if (!res.ok) return interaction.reply({ content: `⚠️ ${res.error}`, ephemeral: true });
      return interaction.reply(`✅ \`${res.path}\` = **${res.value === null ? '—' : res.value}**`);
    }
    if (sub === 'get') {
      const path = config.resolvePath(interaction.options.getString('key'));
      const settings = await db.getSettings(interaction.guild.id);
      const v = config.getValue(settings, path);
      if (v === undefined) return interaction.reply({ content: 'Неизвестный ключ.', ephemeral: true });
      return interaction.reply(`\`${path}\` = **${v === null ? '—' : v}**`);
    }
    const settings = await db.getSettings(interaction.guild.id);
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('⚙️ Настройки сервера')
      .setDescription(config.listKeys(settings).join('\n'));
    return interaction.reply({ embeds: [embed] });
  }
};
