'use strict';
const { EmbedBuilder } = require('discord.js');
const db = require('../../shared/db');
const { fill } = require('../../shared/text');

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
    if (s.logging.enabled && s.logging.channelId && s.logging.events.memberLeave) {
      const ch = member.guild.channels.cache.get(s.logging.channelId);
      if (ch) {
        const embed = new EmbedBuilder().setAuthor({ name: 'Участник вышел', iconURL: member.user ? member.user.displayAvatarURL() : undefined }).setDescription(`${member.user ? member.user.tag : member.id}`).setColor(0xed4245).setTimestamp();
        ch.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }
};
