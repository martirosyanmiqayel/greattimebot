'use strict';

/**
 * Проверка доступа к командам по стафф-ролям.
 * Владелец сервера и участники с правом Администратор проходят всегда —
 * чтобы случайной настройкой никого не заблокировать.
 */

const { PermissionFlagsBits } = require('discord.js');

/**
 * passes(member, settings, requiredPerm, adminOnly) -> boolean
 * requiredPerm — BigInt/флаг права Discord, которое требует команда (или null).
 * adminOnly — команда только для администраторов.
 */
function passes(member, settings, requiredPerm, adminOnly) {
  if (!member) return false;
  // Владелец и админы — всегда можно.
  if (member.guild && member.id === member.guild.ownerId) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (adminOnly) return false; // сюда дошли только не-админы

  const staff = settings.staff || {};
  const roleIds = staff.roleIds || [];
  const hasStaffRole = roleIds.length > 0 && member.roles.cache.some((r) => roleIds.includes(r.id));

  if (roleIds.length > 0) {
    if (staff.mode === 'roleOnly') return hasStaffRole;            // строго по роли
    return hasStaffRole || (requiredPerm ? member.permissions.has(requiredPerm) : true); // мягко
  }
  // Стафф-роли не заданы → обычная проверка права Discord.
  return requiredPerm ? member.permissions.has(requiredPerm) : true;
}

/** Владелец сервера — исключён из ограничений канала/кулдауна (чтобы всегда мог управлять). */
function isOwner(member) {
  return !!(member && member.guild && member.id === member.guild.ownerId);
}

/** Разрешён ли канал для стафф-команды (пустой список = везде; владелец — везде). */
function channelAllowed(member, settings, channelId) {
  const chans = (settings.staff && settings.staff.commandChannels) || [];
  if (!chans.length) return true;
  if (isOwner(member)) return true;
  return chans.includes(channelId);
}

/** Эффективный кулдаун (сек) для участника: минимум из ролевых, иначе общий. */
function cooldownFor(member, settings) {
  const st = settings.staff || {};
  const roleCds = st.roleCooldowns || [];
  let best = null;
  for (const rc of roleCds) {
    if (rc && rc.roleId && member.roles.cache.has(rc.roleId)) {
      best = best === null ? rc.seconds : Math.min(best, rc.seconds);
    }
  }
  return best !== null ? best : (st.cooldownSec || 0);
}

// key `${guild}:${user}:${cmd}` -> timestamp последнего использования.
const cooldowns = new Map();

/** Сколько секунд осталось ждать (0 = можно). Владелец — без кулдауна. */
function cooldownRemaining(member, settings, cmdName) {
  if (isOwner(member)) return 0;
  const secs = cooldownFor(member, settings);
  if (!secs) return 0;
  const key = `${member.guild.id}:${member.id}:${cmdName}`;
  const last = cooldowns.get(key) || 0;
  const remain = Math.ceil((last + secs * 1000 - Date.now()) / 1000);
  return remain > 0 ? remain : 0;
}

/** Зафиксировать использование команды (для кулдауна). */
function markCooldown(member, cmdName) {
  cooldowns.set(`${member.guild.id}:${member.id}:${cmdName}`, Date.now());
}

module.exports = { passes, channelAllowed, cooldownFor, cooldownRemaining, markCooldown };
