'use strict';

/** Подробная карточка участника: аккаунт, роли, XP/уровень/ранг, наказания, права. */

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../shared/db');

const KEY_PERMS = [
  [PermissionFlagsBits.Administrator, 'Администратор'],
  [PermissionFlagsBits.ManageGuild, 'Управление сервером'],
  [PermissionFlagsBits.ManageRoles, 'Роли'],
  [PermissionFlagsBits.ManageChannels, 'Каналы'],
  [PermissionFlagsBits.BanMembers, 'Баны'],
  [PermissionFlagsBits.KickMembers, 'Кики'],
  [PermissionFlagsBits.ModerateMembers, 'Тайм-ауты'],
  [PermissionFlagsBits.ManageMessages, 'Сообщения']
];

async function buildUserEmbed(guild, user) {
  const member = await guild.members.fetch(user.id).catch(() => null);
  const settings = await db.getSettings(guild.id);
  db.setXpFormula(settings.xp.levelBaseXp, settings.xp.levelExponent);

  const [rankInfo, warns, history] = await Promise.all([
    db.getXpRank(guild.id, user.id),
    db.getWarnings(guild.id, user.id),
    db.getModHistory(guild.id, user.id, 100)
  ]);

  // Считаем наказания по типам.
  const counts = {};
  for (const h of history) counts[h.type] = (counts[h.type] || 0) + 1;

  const embed = new EmbedBuilder()
    .setColor(member?.displayColor || 0x5865f2)
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '🆔 ID', value: user.id, inline: true },
      { name: '🤖 Бот', value: user.bot ? 'да' : 'нет', inline: true },
      { name: '📅 Аккаунт создан', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
    );

  if (member) {
    embed.addFields(
      { name: '📥 Зашёл на сервер', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : '—', inline: true },
      { name: '💎 Буст', value: member.premiumSince ? `с <t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>` : 'нет', inline: true },
      { name: '🏷️ Ник', value: member.nickname || '—', inline: true }
    );
  }

  // XP-блок.
  embed.addFields({
    name: '⭐ XP и уровень',
    value: `XP: **${rankInfo.xp}** · Уровень: **${rankInfo.level}** · Ранг: **#${rankInfo.rank}**`,
    inline: false
  });

  // Наказания.
  const punish = [
    `⚠️ Варны: **${warns.length}**`,
    `🔨 Баны: **${counts.ban || 0}**`,
    `🔇 Муты: **${counts.mute || 0}**`,
    `👢 Кики: **${counts.kick || 0}**`
  ].join(' · ');
  embed.addFields({ name: '📛 Наказания', value: punish, inline: false });

  if (member) {
    const roles = member.roles.cache.filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position);
    const roleList = roles.map((r) => `<@&${r.id}>`).slice(0, 20).join(' ') || '—';
    embed.addFields(
      { name: `🎭 Роли (${roles.size})`, value: roleList, inline: false },
      { name: '🥇 Высшая роль', value: member.roles.highest.id !== guild.id ? `<@&${member.roles.highest.id}>` : '—', inline: true }
    );
    const perms = KEY_PERMS.filter(([flag]) => member.permissions.has(flag)).map(([, label]) => label);
    if (perms.length) embed.addFields({ name: '🔑 Ключевые права', value: perms.join(', '), inline: false });
  }

  return embed;
}

module.exports = { buildUserEmbed };
