'use strict';

const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../shared/db');

// Имена, которые нельзя занимать кастомной командой (встроенные разрулит бот раньше,
// но лучше не давать их создавать, чтобы не путать).
const RESERVED = new Set(['cc', 'customcommand', 'help', 'config', 'ban', 'mute', 'xp']);

module.exports = {
  name: 'cc',
  aliases: ['customcommand', 'customcmd'],
  description: '!cc add <имя> <ответ> | remove <имя> | list',
  permission: PermissionFlagsBits.ManageGuild,
  async run(ctx) {
    const sub = (ctx.args[0] || '').toLowerCase();
    if (sub === 'add' || sub === 'create') {
      const name = (ctx.args[1] || '').toLowerCase();
      const response = ctx.args.slice(2).join(' ');
      if (!name || !response) return ctx.error('Использование: `!cc add <имя> <текст ответа>`\nВ ответе можно: `{user}` `{username}` `{server}` `{count}`');
      if (RESERVED.has(name)) return ctx.error(`Имя \`${name}\` зарезервировано — выбери другое.`);
      if (!/^[a-zа-я0-9_-]{1,32}$/i.test(name)) return ctx.error('Имя: буквы/цифры/`_`/`-`, до 32 символов.');
      await db.addCustomCommand(ctx.guild.id, name, response, ctx.author.id);
      return ctx.reply(`✅ Команда \`${ctx.settings.prefix || '!'}${name}\` создана.`);
    }
    if (sub === 'remove' || sub === 'delete' || sub === 'del') {
      const name = (ctx.args[1] || '').toLowerCase();
      if (!name) return ctx.error('Использование: `!cc remove <имя>`');
      const n = await db.removeCustomCommand(ctx.guild.id, name);
      return ctx.reply(n ? `🗑️ Команда \`${name}\` удалена.` : `Команды \`${name}\` нет.`);
    }
    if (sub === 'list' || !sub) {
      const rows = await db.listCustomCommands(ctx.guild.id);
      if (!rows.length) return ctx.reply('Кастомных команд пока нет. Добавь: `!cc add привет Привет, {user}!`');
      const p = ctx.settings.prefix || '!';
      const desc = rows.map((r) => `\`${p}${r.name}\``).join(', ');
      return ctx.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`🧩 Кастомные команды (${rows.length})`).setDescription(desc)] });
    }
    return ctx.error('Подкоманды: `add <имя> <ответ>`, `remove <имя>`, `list`.');
  }
};
