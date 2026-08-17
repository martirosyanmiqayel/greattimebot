'use strict';

/**
 * Connection Roles: если у участника есть хотя бы одна «дочерняя» роль —
 * автоматически выдаём «родительскую»; если ни одной дочерней нет — снимаем родительскую.
 * Удобно для организации ролей (родитель висит группой над дочерними).
 */

const db = require('../../shared/db');

function rolesChanged(oldM, newM) {
  if (!oldM.roles || !newM.roles) return true;
  if (oldM.roles.cache.size !== newM.roles.cache.size) return true;
  for (const id of oldM.roles.cache.keys()) if (!newM.roles.cache.has(id)) return true;
  return false;
}

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    if (!rolesChanged(oldMember, newMember)) return; // реагируем только на смену ролей
    let s;
    try { s = await db.getSettings(newMember.guild.id); } catch { return; }
    const pairs = s.connectionRoles || [];
    if (!pairs.length) return;

    const me = newMember.guild.members.me;
    for (const p of pairs) {
      if (!p || !p.parentId || !Array.isArray(p.childIds) || !p.childIds.length) continue;
      const parent = newMember.guild.roles.cache.get(p.parentId);
      if (!parent) continue;
      if (me && parent.position >= me.roles.highest.position) continue; // роль выше моей — пропуск

      const hasChild = p.childIds.some((id) => newMember.roles.cache.has(id));
      const hasParent = newMember.roles.cache.has(p.parentId);
      if (hasChild && !hasParent) {
        await newMember.roles.add(p.parentId, 'Connection role').catch(() => {});
      } else if (!hasChild && hasParent) {
        await newMember.roles.remove(p.parentId, 'Connection role').catch(() => {});
      }
    }
  }
};
