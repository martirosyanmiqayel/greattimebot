'use strict';

const { PermissionFlagsBits } = require('discord.js');
const security = require('../services/security');

module.exports = {
  name: 'security',
  description: 'Проверка безопасности сервера',
  permission: PermissionFlagsBits.ManageGuild,
  async run(ctx) {
    const embed = await security.buildStatusEmbed(ctx.guild);
    await ctx.reply({ embeds: [embed] });
  }
};
