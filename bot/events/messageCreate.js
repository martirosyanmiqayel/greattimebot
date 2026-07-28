'use strict';

/**
 * Автомодерация: запрещённые слова, инвайты, ссылки, массовые упоминания.
 * Текст уведомления в канал берётся из настроек (automod.noticeMessage).
 */

const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../shared/db');
const { fill } = require('../../shared/text');

const INVITE_RE = /(discord\.(gg|com\/invite)|discordapp\.com\/invite)\/\S+/i;
const LINK_RE = /https?:\/\/\S+/i;

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (!message.guild || message.author.bot) return;

    const s = await db.getSettings(message.guild.id);
    if (!s.automod.enabled) return;
    if (message.member && message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

    const content = message.content.toLowerCase();
    let violation = null;

    if (s.automod.blockedWords.length && s.automod.blockedWords.some((w) => w && content.includes(w.toLowerCase()))) {
      violation = 'запрещённое слово';
    } else if (s.automod.blockInvites && INVITE_RE.test(message.content)) {
      violation = 'приглашение на другой сервер';
    } else if (s.automod.blockLinks && LINK_RE.test(message.content)) {
      violation = 'ссылка';
    } else if (s.automod.maxMentions > 0 && message.mentions.users.size > s.automod.maxMentions) {
      violation = 'слишком много упоминаний';
    }
    if (!violation) return;

    await message.delete().catch(() => {});

    const punishment = s.automod.punishment || 'delete';
    const reason = `Автомод: ${violation}`;

    if (punishment === 'warn') {
      await db.addWarning(message.guild.id, message.author.id, message.client.user.id, reason);
    } else if (punishment === 'mute') {
      message.member.timeout(10 * 60 * 1000, reason).catch(() => {});
    } else if (punishment === 'kick') {
      message.member.kick(reason).catch(() => {});
    }

    const notice = fill(s.automod.noticeMessage, { user: `${message.author}`, reason: violation });
    message.channel
      .send({ content: notice })
      .then((m) => setTimeout(() => m.delete().catch(() => {}), 5000))
      .catch(() => {});

    if (s.moderation.logChannelId) {
      const ch = message.guild.channels.cache.get(s.moderation.logChannelId);
      if (ch) {
        const embed = new EmbedBuilder()
          .setTitle('Автомодерация').setColor(0xfaa61a)
          .addFields(
            { name: 'Пользователь', value: `${message.author.tag} (${message.author.id})` },
            { name: 'Причина', value: violation },
            { name: 'Действие', value: punishment }
          ).setTimestamp();
        ch.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }
};
