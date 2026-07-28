'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../../shared/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Привязать роль к эмодзи под сообщением')
    .addStringOption((o) => o.setName('message_id').setDescription('ID сообщения').setRequired(true))
    .addStringOption((o) => o.setName('emoji').setDescription('Эмодзи').setRequired(true))
    .addRoleOption((o) => o.setName('role').setDescription('Роль').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const messageId = interaction.options.getString('message_id');
    const emojiInput = interaction.options.getString('emoji');
    const role = interaction.options.getRole('role');

    const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (!message) {
      return interaction.reply({ content: 'Сообщение не найдено в этом канале. Запусти команду там же, где сообщение.', ephemeral: true });
    }
    const custom = /<a?:\w+:(\d+)>/.exec(emojiInput);
    const emojiKey = custom ? custom[1] : emojiInput;

    const ok = await message.react(emojiInput).then(() => true).catch(() => false);
    if (!ok) return interaction.reply({ content: 'Не удалось поставить такую реакцию. Проверь эмодзи.', ephemeral: true });

    await db.addReactionRole(interaction.guild.id, messageId, emojiKey, role.id);
    await interaction.reply({ content: `Готово: реакция ${emojiInput} на сообщении ${messageId} выдаёт роль ${role}.`, ephemeral: true });
  }
};
