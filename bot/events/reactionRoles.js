'use strict';
const { PermissionFlagsBits } = require('discord.js');
const db = require('../../shared/db');

function emojiKey(reaction) { return reaction.emoji.id || reaction.emoji.name; }

/**
 * Достаём привязку роли по реакции. Важно: на сервере после рестарта сообщение
 * и реакция приходят «частичными» (partial) — их надо дозагрузить, иначе
 * reaction.message.guild === null и привязка не находится.
 */
async function resolve(reaction) {
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch (e) {
    console.error('[reactionroles] не смог дозагрузить реакцию/сообщение:', e.message);
    return null;
  }
  if (!reaction.message.guild) return null;
  return db.findReactionRole(reaction.message.id, emojiKey(reaction));
}

/** Проверяет, может ли бот выдавать эту роль (есть право + роль ниже его). */
function canManage(guild, roleId) {
  const me = guild.members.me;
  const role = guild.roles.cache.get(roleId);
  if (!me || !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    console.error('[reactionroles] у бота нет права Manage Roles.');
    return false;
  }
  if (!role) { console.error(`[reactionroles] роль ${roleId} не найдена (удалена?).`); return false; }
  if (role.position >= me.roles.highest.position) {
    console.error(`[reactionroles] роль "${role.name}" выше роли бота — подними роль бота выше в настройках сервера.`);
    return false;
  }
  return true;
}

module.exports = [
  {
    name: 'messageReactionAdd',
    async execute(reaction, user) {
      if (user.bot) return;
      const rr = await resolve(reaction);
      if (!rr) return;
      const guild = reaction.message.guild;
      if (!canManage(guild, rr.role_id)) return;
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return;

      // Лимит ролей на пост: не даём взять больше max_roles ролей с этой панели.
      if (rr.max_roles && rr.max_roles > 0 && !member.roles.cache.has(rr.role_id)) {
        const all = await db.listReactionRolesForMessage(reaction.message.id);
        const held = all.filter((x) => member.roles.cache.has(x.role_id)).length;
        if (held >= rr.max_roles) {
          await reaction.users.remove(user.id).catch(() => {}); // снимаем реакцию — лимит достигнут
          return;
        }
      }
      member.roles.add(rr.role_id, 'Reaction role').catch((e) => console.error('[reactionroles] add:', e.message));
    }
  },
  {
    name: 'messageReactionRemove',
    async execute(reaction, user) {
      if (user.bot) return;
      const rr = await resolve(reaction);
      if (!rr) return;
      const guild = reaction.message.guild;
      if (!canManage(guild, rr.role_id)) return;
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (member) member.roles.remove(rr.role_id, 'Reaction role').catch((e) => console.error('[reactionroles] remove:', e.message));
    }
  }
];
