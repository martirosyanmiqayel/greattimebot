'use strict';
const db = require('../../shared/db');

function emojiKey(reaction) { return reaction.emoji.id || reaction.emoji.name; }

async function resolve(reaction) {
  if (reaction.partial) await reaction.fetch().catch(() => {});
  if (!reaction.message.guild) return null;
  return await db.findReactionRole(reaction.message.id, emojiKey(reaction));
}

module.exports = [
  {
    name: 'messageReactionAdd',
    async execute(reaction, user) {
      if (user.bot) return;
      const rr = await resolve(reaction);
      if (!rr) return;
      const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
      if (member) member.roles.add(rr.role_id).catch(() => {});
    }
  },
  {
    name: 'messageReactionRemove',
    async execute(reaction, user) {
      if (user.bot) return;
      const rr = await resolve(reaction);
      if (!rr) return;
      const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
      if (member) member.roles.remove(rr.role_id).catch(() => {});
    }
  }
];
