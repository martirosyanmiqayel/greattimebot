'use strict';
const { EmbedBuilder } = require('discord.js');
const db = require('../../shared/db');
const { fill } = require('../../shared/text');
const { sendCategoryLog } = require('../../shared/modlog');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    const s = await db.getSettings(member.guild.id);
    const vars = { user: `<@${member.id}>`, username: member.user.username, server: member.guild.name, count: member.guild.memberCount };

    if (s.welcome.enabled && s.welcome.channelId) {
      const ch = member.guild.channels.cache.get(s.welcome.channelId);
      if (ch) {
        const embed = new EmbedBuilder().setDescription(fill(s.welcome.message, vars)).setColor(0x57f287).setThumbnail(member.user.displayAvatarURL());
        ch.send({ embeds: [embed] }).catch(() => {});
      }
    }
    if (s.welcome.enabled && s.welcome.dmMessage) {
      member.send(fill(s.welcome.dmMessage, vars)).catch(() => {});
    }
    if (s.autorole.enabled && Array.isArray(s.autorole.roleIds)) {
      for (const roleId of s.autorole.roleIds) member.roles.add(roleId).catch(() => {});
    }
    if (s.logging.enabled && s.logging.events.memberJoin) {
      const embed = new EmbedBuilder().setAuthor({ name: 'Участник зашёл', iconURL: member.user.displayAvatarURL() })
        .setDescription(`<@${member.id}> (${member.user.tag})`)
        .addFields({ name: 'Аккаунт создан', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` })
        .setColor(0x57f287).setTimestamp();
      sendCategoryLog(member.guild, s, 'members', embed);
    }
  }
};
