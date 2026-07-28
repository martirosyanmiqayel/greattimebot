'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../../shared/db');

const RESERVED = new Set(['cc', 'help', 'config', 'ban', 'mute', 'xp']);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cc').setDescription('Кастомные команды сервера')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('add').setDescription('Добавить/изменить команду')
      .addStringOption((o) => o.setName('name').setDescription('Имя команды (без префикса)').setRequired(true))
      .addStringOption((o) => o.setName('response').setDescription('Ответ. Плейсхолдеры: {user} {username} {server} {count}').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Удалить команду')
      .addStringOption((o) => o.setName('name').setDescription('Имя команды').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Список кастомных команд')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') {
      const name = interaction.options.getString('name').toLowerCase();
      const response = interaction.options.getString('response');
      if (RESERVED.has(name)) return interaction.reply({ content: `Имя \`${name}\` зарезервировано.`, ephemeral: true });
      if (!/^[a-zа-я0-9_-]{1,32}$/i.test(name)) return interaction.reply({ content: 'Имя: буквы/цифры/`_`/`-`, до 32 символов.', ephemeral: true });
      await db.addCustomCommand(interaction.guild.id, name, response, interaction.user.id);
      const s = await db.getSettings(interaction.guild.id);
      return interaction.reply(`✅ Команда \`${s.prefix || '!'}${name}\` создана.`);
    }
    if (sub === 'remove') {
      const name = interaction.options.getString('name').toLowerCase();
      const n = await db.removeCustomCommand(interaction.guild.id, name);
      return interaction.reply(n ? `🗑️ Команда \`${name}\` удалена.` : `Команды \`${name}\` нет.`);
    }
    const rows = await db.listCustomCommands(interaction.guild.id);
    if (!rows.length) return interaction.reply('Кастомных команд пока нет.');
    const s = await db.getSettings(interaction.guild.id);
    const p = s.prefix || '!';
    const desc = rows.map((r) => `\`${p}${r.name}\``).join(', ');
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`🧩 Кастомные команды (${rows.length})`).setDescription(desc)] });
  }
};
