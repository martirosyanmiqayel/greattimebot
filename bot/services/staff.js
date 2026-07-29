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

module.exports = { passes };
