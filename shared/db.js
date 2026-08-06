'use strict';

/**
 * Общий слой доступа к данным на Supabase (Postgres).
 * Подключают И бот, И дашборд — оба ходят в одну базу с service_role ключом.
 * Все функции АСИНХРОННЫЕ (Promise) — вызывай с await.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[db] Не заданы SUPABASE_URL / SUPABASE_SERVICE_KEY в .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

/** Дефолтные настройки одного сервера. Именно эту форму читают модули бота. */
function defaultSettings() {
  return {
    prefix: '!',
    moderation: {
      enabled: true,
      logChannelId: null,
      muteRoleId: null,
      dmOnPunish: true,
      // Настраиваемые тексты ЛС-уведомлений. Плейсхолдеры: {server} {reason} {moderator} {duration}
      banDm: 'Тебя забанили на сервере {server}. Причина: {reason}',
      kickDm: 'Тебя кикнули с сервера {server}. Причина: {reason}',
      warnDm: 'Тебе выдали предупреждение на {server}. Причина: {reason}',
      muteDm: 'Тебе выдали мьют на {server} ({duration}). Причина: {reason}'
    },
    automod: {
      enabled: false,
      blockedWords: [],
      blockInvites: false,
      blockLinks: false,
      maxMentions: 0,
      punishment: 'delete',
      // Текст короткого уведомления в канал. Плейсхолдеры: {user} {reason}
      noticeMessage: '{user}, сообщение удалено: {reason}.'
    },
    welcome: {
      enabled: false,
      channelId: null,
      message: 'Добро пожаловать, {user}, на {server}! Теперь нас {count}.',
      dmMessage: null
    },
    goodbye: {
      enabled: false,
      channelId: null,
      message: '{username} покинул сервер. Нас осталось {count}.'
    },
    autorole: {
      enabled: false,
      roleIds: []
    },
    logging: {
      enabled: false,
      channelId: null,           // общий канал (fallback, если для категории не задан свой)
      // Отдельные каналы по категориям. Пусто → используется общий channelId.
      channels: {
        messages: null,          // удаление/редактирование сообщений
        members: null,           // входы/выходы участников
        roles: null,             // создание/удаление/изменение ролей
        voice: null,             // заход/выход/переход в голосовых
        moderation: null,        // баны/кики/разбаны (из аудита)
        tickets: null,           // открытие/закрытие тикетов
        server: null             // каналы/сервер/вебхуки
      },
      events: {
        messageDelete: true, messageEdit: true, memberJoin: true, memberLeave: true,
        channelCreate: true, channelDelete: true, channelUpdate: true,
        roleCreate: true, roleDelete: true, roleUpdate: true,
        memberBan: true, memberUnban: true, memberKick: true,
        webhookUpdate: true, guildUpdate: true,
        voice: true, ticketOpen: true, ticketClose: true
      }
    },
    // XP / уровни. Все значения меняются через дашборд или !config.
    xp: {
      enabled: false,
      perMessage: 10,          // XP за сообщение
      messageCooldownSec: 60,  // не чаще раза в N секунд
      perVoiceMinute: 5,       // XP за минуту в голосовом
      levelUpMessage: '🎉 {user}, ты достиг {level} уровня!',
      levelUpChannelId: null,  // null = отвечать в тот же канал; иначе отдельный канал
      announceLevelUp: true,
      // Формула порога: xp, нужный для достижения уровня L = base * L^exponent.
      levelBaseXp: 100,
      levelExponent: 2,
      // Награды за уровни: [{ level: 5, roleId: 'выдать', removeRoleId: 'снять' }, ...]
      // roleId/removeRoleId — любой из них можно опустить (null).
      levelRoles: []
    },
    // Anti-Crash — защита от рейда со стороны персонала.
    anticrash: {
      enabled: false,
      logChannelId: null,          // отдельный канал именно под Anti-Crash
      autoRestore: true,           // восстанавливать удалённое/изменённое
      punishment: 'timeout',       // что делать с нарушителем: timeout | kick | ban
      punishTimeoutHours: 3,       // длительность timeout (для режима timeout)
      stripRoles: true,            // снять все роли нарушителю
      alertOwner: true,            // писать владельцу сервера в ЛС при срабатывании
      alertWhitelist: true,        // писать всем из whitelist в ЛС при срабатывании
      exemptStaffRoles: false,     // считать стафф-роли доверенными (не трогать Anti-Crash'ем)
      // Дополнительные роли-исключения (кроме таблицы whitelist).
      whitelistRoleIds: [],
      // Какие действия отслеживать.
      protect: {
        channelDelete: true, channelUpdate: true,
        roleDelete: true, roleUpdate: true,
        channelCreate: false, roleCreate: false,
        guildUpdate: true,          // имя/иконка/баннер сервера
        webhookDelete: true, webhookUpdate: true,
        memberKick: true, memberBanAdd: true, memberPrune: true,
        memberRoleUpdate: true,     // выдача опасных ролей (Administrator и т.п.)
        botAdd: true                // добавление сторонних ботов
      },
      // Пороги: не более N действий за windowSec (даже для доверенных ролей — по TZ).
      // Срабатывание порога = наказание + попытка отката.
      limits: {
        channelDelete: { count: 3, windowSec: 30 },
        roleDelete: { count: 3, windowSec: 30 },
        memberKick: { count: 3, windowSec: 30 }
      }
    },
    // Стафф-роли: кто считается персоналом и имеет доступ к командам мод/настроек.
    // mode: 'either' (роль ИЛИ право Discord) | 'roleOnly' (только по роли).
    staff: {
      roleIds: [],
      mode: 'either',
      commandChannels: [],   // если не пусто — стафф-команды работают ТОЛЬКО в этих каналах
      cooldownSec: 0,        // общий кулдаун на стафф-команду (на пользователя, на команду)
      roleCooldowns: [],     // общий кулдаун по ролям (легаси): [{ roleId, seconds }]
      // Правила роль→команда: роль ограничена этими командами, у каждой свой кулдаун.
      commandRules: []       // [{ roleId, command, seconds }]
    },
    // Редактируемые тексты ответов бота (общие для команд). Placeholders: {user}
    messages: {
      noPermission: '⛔ Недостаточно прав для этой команды.',
      adminOnly: '⛔ Команда только для администраторов.',
      commandError: '⚠️ Произошла ошибка при выполнении команды.'
    },
    // Автоматический backup структуры сервера.
    backup: {
      enabled: false,
      intervalSec: 60,   // как часто снимать snapshot (30–60 по TZ)
      keep: 20           // сколько последних копий хранить
    },
    tickets: {
      enabled: false,
      categoryId: null,
      supportRoleId: null,
      panelChannelId: null,
      panelTitle: '🎫 Поддержка',
      panelDescription: 'Нажми на кнопку ниже, чтобы открыть тикет. Мы поможем!',
      panelButtonLabel: 'Открыть тикет',
      welcomeMessage: 'Спасибо за обращение! Опишите проблему, скоро ответим.',
      closeMessage: 'Тикет закрывается через 5 секунд...'
    }
  };
}

/** Глубокое слияние: сохранённые значения поверх дефолтов. */
function mergeDeep(base, override) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!override || typeof override !== 'object') return out;
  for (const key of Object.keys(override)) {
    const b = base ? base[key] : undefined;
    const o = override[key];
    if (o && typeof o === 'object' && !Array.isArray(o) && b && typeof b === 'object' && !Array.isArray(b)) {
      out[key] = mergeDeep(b, o);
    } else {
      out[key] = o;
    }
  }
  return out;
}

// ---- Настройки серверов ----
async function getSettings(guildId) {
  const { data, error } = await supabase
    .from('guild_settings').select('data').eq('guild_id', guildId).maybeSingle();
  if (error) console.error('[db] getSettings:', error.message);
  const stored = data && data.data ? data.data : {};
  return mergeDeep(defaultSettings(), stored);
}

async function saveSettings(guildId, settings) {
  const { error } = await supabase
    .from('guild_settings')
    .upsert({ guild_id: guildId, data: settings, updated_at: Date.now() }, { onConflict: 'guild_id' });
  if (error) console.error('[db] saveSettings:', error.message);
  return settings;
}

async function updateSettings(guildId, patch) {
  return saveSettings(guildId, mergeDeep(await getSettings(guildId), patch));
}

// ---- Предупреждения ----
async function addWarning(g, u, m, r) {
  const { data, error } = await supabase.from('warnings')
    .insert({ guild_id: g, user_id: u, moderator: m, reason: r || null, created_at: Date.now() })
    .select('id').single();
  if (error) console.error('[db] addWarning:', error.message);
  return data ? data.id : null;
}
async function getWarnings(g, u) {
  const { data, error } = await supabase.from('warnings').select('*')
    .eq('guild_id', g).eq('user_id', u).order('created_at', { ascending: false });
  if (error) console.error('[db] getWarnings:', error.message);
  return data || [];
}
async function clearWarnings(g, u) {
  const { data, error } = await supabase.from('warnings').delete()
    .eq('guild_id', g).eq('user_id', u).select('id');
  if (error) console.error('[db] clearWarnings:', error.message);
  return data ? data.length : 0;
}

// ---- Тикеты ----
async function openTicket(g, c, u) {
  const { data, error } = await supabase.from('tickets')
    .insert({ guild_id: g, channel_id: c, user_id: u, status: 'open', created_at: Date.now() })
    .select('id').single();
  if (error) console.error('[db] openTicket:', error.message);
  return data ? data.id : null;
}
async function closeTicket(c) {
  const { error } = await supabase.from('tickets')
    .update({ status: 'closed', closed_at: Date.now() }).eq('channel_id', c);
  if (error) console.error('[db] closeTicket:', error.message);
}
async function findOpenTicket(g, u) {
  const { data, error } = await supabase.from('tickets').select('*')
    .eq('guild_id', g).eq('user_id', u).eq('status', 'open').maybeSingle();
  if (error) console.error('[db] findOpenTicket:', error.message);
  return data || null;
}

// ---- Reaction roles ----
async function addReactionRole(g, m, e, r, maxRoles = 0) {
  const { data, error } = await supabase.from('reaction_roles')
    .insert({ guild_id: g, message_id: m, emoji: e, role_id: r, max_roles: maxRoles || 0 }).select('id').single();
  if (error) console.error('[db] addReactionRole:', error.message);
  return data ? data.id : null;
}
/** Все привязки одного сообщения (для лимита ролей на панель). */
async function listReactionRolesForMessage(m) {
  const { data, error } = await supabase.from('reaction_roles').select('*').eq('message_id', m);
  if (error) console.error('[db] listReactionRolesForMessage:', error.message);
  return data || [];
}
async function findReactionRole(m, e) {
  const { data, error } = await supabase.from('reaction_roles').select('*')
    .eq('message_id', m).eq('emoji', e).maybeSingle();
  if (error) console.error('[db] findReactionRole:', error.message);
  return data || null;
}
async function listReactionRoles(g) {
  const { data, error } = await supabase.from('reaction_roles').select('*')
    .eq('guild_id', g).order('id', { ascending: true });
  if (error) console.error('[db] listReactionRoles:', error.message);
  return data || [];
}
async function deleteReactionRole(id) {
  const { error } = await supabase.from('reaction_roles').delete().eq('id', id);
  if (error) console.error('[db] deleteReactionRole:', error.message);
}

// ---- XP ----
async function getXp(g, u) {
  const { data, error } = await supabase.from('xp').select('*')
    .eq('guild_id', g).eq('user_id', u).maybeSingle();
  if (error) console.error('[db] getXp:', error.message);
  return data || { guild_id: g, user_id: u, xp: 0, level: 0 };
}
/** Меняет XP на delta (может быть отрицательным). Возвращает новую строку. reason/actor — для истории. */
async function addXpDelta(g, u, delta, reason, actor) {
  const cur = await getXp(g, u);
  const next = Math.max(0, Number(cur.xp || 0) + Number(delta));
  return _writeXp(g, u, next, delta, reason, actor);
}
/** Полностью заменяет XP значением value. */
async function setXpValue(g, u, value, reason, actor) {
  const cur = await getXp(g, u);
  const next = Math.max(0, Number(value));
  return _writeXp(g, u, next, next - Number(cur.xp || 0), reason, actor);
}
async function _writeXp(g, u, next, delta, reason, actor) {
  const level = xpToLevel(next);
  const { data, error } = await supabase.from('xp')
    .upsert({ guild_id: g, user_id: u, xp: next, level, updated_at: Date.now() }, { onConflict: 'guild_id,user_id' })
    .select('*').single();
  if (error) console.error('[db] _writeXp:', error.message);
  if (delta) {
    await supabase.from('xp_history').insert({
      guild_id: g, user_id: u, delta, reason: reason || null, actor: actor || null, created_at: Date.now()
    });
  }
  return data || { guild_id: g, user_id: u, xp: next, level };
}
/** Формула уровня по XP: level = floor((xp/base)^(1/exponent)). base/exponent берутся из настроек при выдаче наград. */
let _xpFormula = { base: 100, exponent: 2 };
function setXpFormula(base, exponent) { _xpFormula = { base: Number(base) || 100, exponent: Number(exponent) || 2 }; }
function xpToLevel(xp) {
  const { base, exponent } = _xpFormula;
  if (xp < base) return 0;
  return Math.floor(Math.pow(xp / base, 1 / exponent));
}
function levelToXp(level) {
  const { base, exponent } = _xpFormula;
  return Math.ceil(base * Math.pow(level, exponent));
}
async function topXp(g, limit = 10) {
  const { data, error } = await supabase.from('xp').select('*')
    .eq('guild_id', g).order('xp', { ascending: false }).limit(limit);
  if (error) console.error('[db] topXp:', error.message);
  return data || [];
}
/** Позиция пользователя в топе по XP (1 = первый). */
async function getXpRank(g, u) {
  const me = await getXp(g, u);
  const { count, error } = await supabase.from('xp')
    .select('*', { count: 'exact', head: true }).eq('guild_id', g).gt('xp', Number(me.xp || 0));
  if (error) console.error('[db] getXpRank:', error.message);
  return { rank: (count || 0) + 1, xp: Number(me.xp || 0), level: me.level || 0 };
}

// ---- Whitelist ----
async function whitelistAdd(g, u, by) {
  const { error } = await supabase.from('whitelist')
    .upsert({ guild_id: g, user_id: u, added_by: by || null, created_at: Date.now() }, { onConflict: 'guild_id,user_id' });
  if (error) console.error('[db] whitelistAdd:', error.message);
}
async function whitelistRemove(g, u) {
  const { data, error } = await supabase.from('whitelist').delete()
    .eq('guild_id', g).eq('user_id', u).select('user_id');
  if (error) console.error('[db] whitelistRemove:', error.message);
  return data ? data.length : 0;
}
async function whitelistHas(g, u) {
  const { data, error } = await supabase.from('whitelist').select('user_id')
    .eq('guild_id', g).eq('user_id', u).maybeSingle();
  if (error) console.error('[db] whitelistHas:', error.message);
  return !!data;
}
async function whitelistList(g) {
  const { data, error } = await supabase.from('whitelist').select('*')
    .eq('guild_id', g).order('created_at', { ascending: true });
  if (error) console.error('[db] whitelistList:', error.message);
  return data || [];
}

// ---- История наказаний (mod_actions) ----
async function addModAction(a) {
  const { data, error } = await supabase.from('mod_actions').insert({
    guild_id: a.guild_id, type: a.type, target_id: a.target_id, moderator: a.moderator,
    reason: a.reason || null, duration_ms: a.duration_ms ?? null, expires_at: a.expires_at ?? null,
    active: a.active !== false, created_at: Date.now()
  }).select('*').single();
  if (error) console.error('[db] addModAction:', error.message);
  return data || null;
}
async function getModHistory(g, u, limit = 25) {
  const { data, error } = await supabase.from('mod_actions').select('*')
    .eq('guild_id', g).eq('target_id', u).order('created_at', { ascending: false }).limit(limit);
  if (error) console.error('[db] getModHistory:', error.message);
  return data || [];
}
/** Последнее активное наказание указанного типа (для !checkmute). */
async function getActiveAction(g, u, type) {
  const { data, error } = await supabase.from('mod_actions').select('*')
    .eq('guild_id', g).eq('target_id', u).eq('type', type).eq('active', true)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) console.error('[db] getActiveAction:', error.message);
  return data || null;
}
async function deactivateActions(g, u, type) {
  const { error } = await supabase.from('mod_actions').update({ active: false })
    .eq('guild_id', g).eq('target_id', u).eq('type', type).eq('active', true);
  if (error) console.error('[db] deactivateActions:', error.message);
}
/** Сводка по модератору: сколько каких действий выдал (для !staffstats / истории). */
async function countActionsByModerator(g, moderator) {
  const { data, error } = await supabase.from('mod_actions').select('type')
    .eq('guild_id', g).eq('moderator', moderator);
  if (error) console.error('[db] countActionsByModerator:', error.message);
  const out = {};
  for (const row of data || []) out[row.type] = (out[row.type] || 0) + 1;
  return out;
}

// ---- Полный лог действий (action_logs) ----
async function addActionLog(g, type, actorId, targetId, detail) {
  const { error } = await supabase.from('action_logs').insert({
    guild_id: g, type, actor_id: actorId || null, target_id: targetId || null,
    detail: detail || {}, created_at: Date.now()
  });
  if (error) console.error('[db] addActionLog:', error.message);
}
async function listActionLogs(g, { type, limit = 100 } = {}) {
  let q = supabase.from('action_logs').select('*').eq('guild_id', g);
  if (type) q = q.eq('type', type);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) console.error('[db] listActionLogs:', error.message);
  return data || [];
}

// ---- Backups ----
async function saveBackup(g, data, kind = 'auto', keep = 20) {
  const { data: row, error } = await supabase.from('backups')
    .insert({ guild_id: g, kind, data, created_at: Date.now() }).select('id, created_at').single();
  if (error) { console.error('[db] saveBackup:', error.message); return null; }
  // Чистим старьё: оставляем последние keep копий этого сервера.
  const { data: ids } = await supabase.from('backups').select('id')
    .eq('guild_id', g).order('created_at', { ascending: false });
  if (ids && ids.length > keep) {
    const toDelete = ids.slice(keep).map((r) => r.id);
    await supabase.from('backups').delete().in('id', toDelete);
  }
  return row;
}
async function listBackups(g, limit = 20) {
  const { data, error } = await supabase.from('backups').select('id, kind, created_at')
    .eq('guild_id', g).order('created_at', { ascending: false }).limit(limit);
  if (error) console.error('[db] listBackups:', error.message);
  return data || [];
}
async function getBackup(g, id) {
  const { data, error } = await supabase.from('backups').select('*')
    .eq('guild_id', g).eq('id', id).maybeSingle();
  if (error) console.error('[db] getBackup:', error.message);
  return data || null;
}
async function getLatestBackup(g) {
  const { data, error } = await supabase.from('backups').select('*')
    .eq('guild_id', g).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) console.error('[db] getLatestBackup:', error.message);
  return data || null;
}
async function deleteBackup(g, id) {
  const { data, error } = await supabase.from('backups').delete()
    .eq('guild_id', g).eq('id', id).select('id');
  if (error) console.error('[db] deleteBackup:', error.message);
  return data ? data.length : 0;
}

// ---- Кастомные команды ----
async function addCustomCommand(g, name, response, by) {
  const { error } = await supabase.from('custom_commands')
    .upsert({ guild_id: g, name: name.toLowerCase(), response, created_by: by || null, created_at: Date.now() }, { onConflict: 'guild_id,name' });
  if (error) console.error('[db] addCustomCommand:', error.message);
  return !error;
}
async function removeCustomCommand(g, name) {
  const { data, error } = await supabase.from('custom_commands').delete()
    .eq('guild_id', g).eq('name', name.toLowerCase()).select('name');
  if (error) console.error('[db] removeCustomCommand:', error.message);
  return data ? data.length : 0;
}
async function getCustomCommand(g, name) {
  const { data, error } = await supabase.from('custom_commands').select('*')
    .eq('guild_id', g).eq('name', name.toLowerCase()).maybeSingle();
  if (error) console.error('[db] getCustomCommand:', error.message);
  return data || null;
}
async function listCustomCommands(g) {
  const { data, error } = await supabase.from('custom_commands').select('*')
    .eq('guild_id', g).order('name', { ascending: true });
  if (error) console.error('[db] listCustomCommands:', error.message);
  return data || [];
}

module.exports = {
  supabase, defaultSettings, getSettings, saveSettings, updateSettings,
  addCustomCommand, removeCustomCommand, getCustomCommand, listCustomCommands,
  addWarning, getWarnings, clearWarnings,
  openTicket, closeTicket, findOpenTicket,
  addReactionRole, findReactionRole, listReactionRoles, listReactionRolesForMessage, deleteReactionRole,
  // XP
  getXp, addXpDelta, setXpValue, topXp, getXpRank, setXpFormula, xpToLevel, levelToXp,
  // Whitelist
  whitelistAdd, whitelistRemove, whitelistHas, whitelistList,
  // Мод-история
  addModAction, getModHistory, getActiveAction, deactivateActions, countActionsByModerator,
  // Логи
  addActionLog, listActionLogs,
  // Backups
  saveBackup, listBackups, getBackup, getLatestBackup, deleteBackup
};
