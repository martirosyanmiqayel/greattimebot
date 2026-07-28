'use strict';

const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const config = require('../services/config');
const db = require('../../shared/db');

module.exports = {
  name: 'config',
  aliases: ['cfg'],
  description: '!config get <key> | set <key> <value> | list',
  permission: PermissionFlagsBits.ManageGuild,
  async run(ctx) {
    const sub = (ctx.args[0] || '').toLowerCase();
    if (sub === 'set') {
      const key = ctx.args[1];
      const value = ctx.args.slice(2).join(' ');
      if (!key || value === '') return ctx.error('Использование: `!config set <key> <value>` (напр. `!config set xp 15`)');
      const res = await config.setValue(ctx.guild.id, key, value);
      if (!res.ok) return ctx.error(res.error);
      return ctx.reply(`✅ \`${res.path}\` = **${res.value === null ? '—' : res.value}**`);
    }
    if (sub === 'get') {
      const path = config.resolvePath(ctx.args[1] || '');
      const settings = await db.getSettings(ctx.guild.id);
      const v = config.getValue(settings, path);
      if (v === undefined) return ctx.error(`Неизвестный ключ \`${ctx.args[1]}\`.`);
      return ctx.reply(`\`${path}\` = **${v === null ? '—' : v}**`);
    }
    if (sub === 'list' || !sub) {
      const settings = await db.getSettings(ctx.guild.id);
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('⚙️ Настройки сервера')
        .setDescription(config.listKeys(settings).join('\n'));
      return ctx.reply({ embeds: [embed] });
    }
    return ctx.error('Подкоманды: `get`, `set`, `list`.');
  }
};
