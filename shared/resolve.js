'use strict';

/**
 * Разбор упоминаний/ID пользователей и ролей для префикс-команд.
 * Slash-команды получают объекты напрямую; этот модуль нужен префиксу.
 */

/** '<@123>' | '<@!123>' | '123' -> '123'. Иначе null. */
function parseUserId(token) {
  if (!token) return null;
  const m = /^<@!?(\d{15,25})>$/.exec(token) || /^(\d{15,25})$/.exec(token);
  return m ? m[1] : null;
}

/** '<@&123>' | '123' -> '123'. */
function parseRoleId(token) {
  if (!token) return null;
  const m = /^<@&(\d{15,25})>$/.exec(token) || /^(\d{15,25})$/.exec(token);
  return m ? m[1] : null;
}

/** '<#123>' | '123' -> '123'. */
function parseChannelId(token) {
  if (!token) return null;
  const m = /^<#(\d{15,25})>$/.exec(token) || /^(\d{15,25})$/.exec(token);
  return m ? m[1] : null;
}

/** Достаёт User по токену (упоминание/ID). Возвращает null при неудаче. */
async function fetchUser(client, token) {
  const id = parseUserId(token);
  if (!id) return null;
  return client.users.fetch(id).catch(() => null);
}

/** Достаёт GuildMember по токену. Возвращает null, если участника нет на сервере. */
async function fetchMember(guild, token) {
  const id = parseUserId(token);
  if (!id) return null;
  return guild.members.fetch(id).catch(() => null);
}

module.exports = { parseUserId, parseRoleId, parseChannelId, fetchUser, fetchMember };
