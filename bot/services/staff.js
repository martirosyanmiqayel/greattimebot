'use strict';

/**
 * Проверка доступа к командам по стафф-ролям.
 * Владелец сервера и участники с правом Администратор проходят всегда —
 * чтобы случайной настройкой никого не заблокировать.
 */

const { PermissionFlagsBits } = require('discord.js');
const db = require('../../shared/db');

/**
 * В whitelist ли участник (таблица whitelist или роли-исключения Anti-Crash).
 * Такие люди используют стафф-команды без ограничения по каналу и без кулдауна.
 */
async function isWhitelisted(guild, settings, member) {
  if (!member) return false;
  if (await db.whitelistHas(guild.id, member.id)) return true;
  const roleIds = (settings.anticrash && settings.anticrash.whitelistRoleIds) || [];
  return roleIds.length > 0 && member.roles.cache.some((r) => roleIds.includes(r.id));
}

/**
 * passes(member, settings, requiredPerm, adminOnly) -> boolean
 * requiredPerm — BigInt/флаг права Discord, которое требует команда (или null).
 * adminOnly — команда только для администраторов.
 */
/**
 * passes(member, settings, requiredPerm, adminOnly, cmdName) -> boolean
 * Учитывает: правила роль→команда (commandRules), общие стафф-роли (roleIds),
 * права Discord. Владелец и админы проходят всегда.
 */
function passes(member, settings, requiredPerm, adminOnly, cmdName) {
  if (!member) return false;
  if (member.guild && member.id === member.guild.ownerId) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (adminOnly) return false; // сюда дошли только не-админы

  const staff = settings.staff || {};

  // (a) Правила роль→команда: роль ограничена своим списком команд.
  const rules = (staff.commandRules || []).filter((r) => r && r.roleId && member.roles.cache.has(r.roleId));
  const hasRuleRole = rules.length > 0;
  if (hasRuleRole && cmdName && rules.some((r) => r.command === cmdName)) return true;

  // (b) Обычная стафф-роль = полный доступ к стафф-командам.
  const roleIds = staff.roleIds || [];
  const hasStaffRole = roleIds.length > 0 && member.roles.cache.some((r) => roleIds.includes(r.id));
  if (hasStaffRole) return true;

  // (c) Есть роль с правилами, но команда в них не разрешена → запрет.
  if (hasRuleRole) return false;

  // (d) Ни стафф-роли, ни правил у участника нет.
  if (roleIds.length > 0 && staff.mode === 'roleOnly') return false;
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

/**
 * Эффективный кулдаун (сек) для участника на конкретную команду.
 * Приоритет: правило роль→команда → общий ролевой (roleCooldowns) → общий (cooldownSec).
 * Если у участника несколько подходящих ролей — берётся наименьший кулдаун.
 */
function cooldownFor(member, settings, cmdName) {
  const st = settings.staff || {};
  let best = null;
  for (const r of st.commandRules || []) {
    if (r && r.roleId && r.command === cmdName && r.seconds > 0 && member.roles.cache.has(r.roleId)) {
      best = best === null ? r.seconds : Math.min(best, r.seconds);
    }
  }
  if (best !== null) return best;
  for (const rc of st.roleCooldowns || []) {
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
  const secs = cooldownFor(member, settings, cmdName);
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

module.exports = { passes, isWhitelisted, channelAllowed, cooldownFor, cooldownRemaining, markCooldown };
