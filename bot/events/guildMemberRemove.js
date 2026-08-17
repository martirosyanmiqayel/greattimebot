'use strict';
const { EmbedBuilder } = require('discord.js');
const db = require('../../shared/db');
const { fill } = require('../../shared/text');
const { sendCategoryLog } = require('../../shared/modlog');
const counters = require('../services/counters');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    const s = await db.getSettings(member.guild.id);
    const vars = { user: `<@${member.id}>`, username: member.user ? member.user.username : 'Участник', server: member.guild.name, count: member.guild.memberCount };

    if (s.goodbye.enabled && s.goodbye.channelId) {
      const ch = member.guild.channels.cache.get(s.goodbye.channelId);
      if (ch) {
        const embed = new EmbedBuilder().setDescription(fill(s.goodbye.message, vars)).setColor(0xed4245);
        ch.send({ embeds: [embed] }).catch(() => {});
      }
    }
    if (s.logging.enabled && s.logging.events.memberLeave) {
      const embed = new EmbedBuilder().setAuthor({ name: 'Участник вышел', iconURL: member.user ? member.user.displayAvatarURL() : undefined })
        .setDescription(`${member.user ? member.user.tag : member.id}`).setColor(0xed4245).setTimestamp();
      sendCategoryLog(member.guild, s, 'members', embed);
    }
    // Sticky Roles: запоминаем роли участника, чтобы вернуть при повторном входе.
    if (s.stickyRoles && s.stickyRoles.enabled && member.roles && member.roles.cache) {
      let ids = member.roles.cache.filter((r) => r.id !== member.guild.id && !r.managed).map((r) => r.id);
      if (s.stickyRoles.roleIds && s.stickyRoles.roleIds.length) ids = ids.filter((id) => s.stickyRoles.roleIds.includes(id));
      if (ids.length) db.saveStickyRoles(member.guild.id, member.id, ids).catch(() => {});
    }
    counters.updateGuildCounters(member.guild).catch(() => {});
  }
};
