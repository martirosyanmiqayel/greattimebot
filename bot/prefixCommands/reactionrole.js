'use strict';

const { PermissionFlagsBits } = require('discord.js');
const db = require('../../shared/db');
const { parseRoleId } = require('../../shared/resolve');

module.exports = {
  name: 'reactionrole',
  aliases: ['rr'],
  description: 'Привязать роль к эмодзи: !reactionrole <messageId> <эмодзи> <роль>',
  permission: PermissionFlagsBits.ManageRoles,
  async run(ctx) {
    const messageId = ctx.args[0];
    const emojiInput = ctx.args[1];
    const roleId = parseRoleId(ctx.args[2]);
    if (!messageId || !emojiInput || !roleId) {
      return ctx.error('Использование: `!reactionrole <messageId> <эмодзи> <@роль|id>` (в том же канале, где сообщение)');
    }
    const message = await ctx.channel.messages.fetch(messageId).catch(() => null);
    if (!message) return ctx.error('Сообщение не найдено в этом канале. Запусти команду там же, где сообщение.');
    if (!ctx.guild.roles.cache.has(roleId)) return ctx.error('Роль не найдена.');

    const custom = /<a?:\w+:(\d+)>/.exec(emojiInput);
    const emojiKey = custom ? custom[1] : emojiInput;
    const ok = await message.react(emojiInput).then(() => true).catch(() => false);
    if (!ok) return ctx.error('Не удалось поставить такую реакцию. Проверь эмодзи.');

    await db.addReactionRole(ctx.guild.id, messageId, emojiKey, roleId);
    await ctx.reply(`✅ Реакция ${emojiInput} на сообщении \`${messageId}\` выдаёт роль <@&${roleId}>.`);
  }
};
