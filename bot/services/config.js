'use strict';

/**
 * Изменение настроек сервера через команды (без правки config.json/дашборда).
 * Разрешён только белый список путей — чтобы нельзя было записать произвольную дичь.
 */

const db = require('../../shared/db');
const { parseChannelId, parseRoleId } = require('../../shared/resolve');

// путь -> тип. Типы: bool | int | string | channel | role
const CONFIG_KEYS = {
  'prefix': 'string',
  'moderation.logChannelId': 'channel',
  'moderation.dmOnPunish': 'bool',
  'logging.enabled': 'bool',
  'logging.channelId': 'channel',
  'xp.enabled': 'bool',
  'xp.perMessage': 'int',
  'xp.messageCooldownSec': 'int',
  'xp.perVoiceMinute': 'int',
  'xp.announceLevelUp': 'bool',
  'xp.levelUpChannelId': 'channel',
  'xp.levelBaseXp': 'int',
  'xp.levelExponent': 'int',
  'anticrash.enabled': 'bool',
  'anticrash.autoRestore': 'bool',
  'anticrash.stripRoles': 'bool',
  'anticrash.punishTimeoutHours': 'int',
  'anticrash.logChannelId': 'channel',
  'backup.enabled': 'bool',
  'backup.intervalSec': 'int',
  'backup.keep': 'int',
  'messages.noPermission': 'string',
  'messages.adminOnly': 'string',
  'messages.commandError': 'string'
};

// Короткие псевдонимы для удобства (напр. !config set xp 15).
const ALIASES = {
  xp: 'xp.perMessage',
  anticrash: 'anticrash.enabled',
  backup: 'backup.enabled',
  logs: 'logging.channelId',
  modlogs: 'moderation.logChannelId'
};

function resolvePath(key) {
  const k = String(key || '').trim();
  return ALIASES[k] || k;
}

function coerce(type, raw) {
  if (type === 'bool') {
    if (/^(true|on|1|вкл|yes|да)$/i.test(raw)) return { ok: true, value: true };
    if (/^(false|off|0|выкл|no|нет)$/i.test(raw)) return { ok: true, value: false };
    return { ok: false, error: 'ожидается on/off' };
  }
  if (type === 'int') {
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? { ok: false, error: 'ожидается число' } : { ok: true, value: n };
  }
  if (type === 'channel') {
    if (/^(none|null|off|-)$/i.test(raw)) return { ok: true, value: null };
    const id = parseChannelId(raw);
    return id ? { ok: true, value: id } : { ok: false, error: 'ожидается канал (#канал или id)' };
  }
  if (type === 'role') {
    if (/^(none|null|off|-)$/i.test(raw)) return { ok: true, value: null };
    const id = parseRoleId(raw);
    return id ? { ok: true, value: id } : { ok: false, error: 'ожидается роль (@роль или id)' };
  }
  return { ok: true, value: raw };
}

function getValue(settings, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), settings);
}

/** Записать значение по пути. Возвращает { ok, error?, path, value }. */
async function setValue(guildId, key, raw) {
  const path = resolvePath(key);
  const type = CONFIG_KEYS[path];
  if (!type) return { ok: false, error: `Неизвестный ключ \`${key}\`. Список — \`!config list\`.` };
  const c = coerce(type, String(raw));
  if (!c.ok) return { ok: false, error: `Для \`${path}\` ${c.error}.` };
  // Собираем вложенный patch.
  const parts = path.split('.');
  const patch = {};
  let cur = patch;
  for (let i = 0; i < parts.length - 1; i++) { cur[parts[i]] = {}; cur = cur[parts[i]]; }
  cur[parts[parts.length - 1]] = c.value;
  await db.updateSettings(guildId, patch);
  return { ok: true, path, value: c.value };
}

function listKeys(settings) {
  return Object.keys(CONFIG_KEYS).map((path) => {
    const v = getValue(settings, path);
    return `\`${path}\` = ${v === null || v === undefined ? '—' : v}`;
  });
}

module.exports = { CONFIG_KEYS, ALIASES, setValue, getValue, listKeys, resolvePath };
