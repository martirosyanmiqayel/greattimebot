'use strict';

/**
 * Каталог команд для веб-панели. Строится ДИНАМИЧЕСКИ из реальных модулей бота
 * (bot/commands/** — slash, bot/prefixCommands/** — префикс), поэтому список
 * на сайте всегда совпадает с тем, что реально есть в боте.
 */

const fs = require('fs');
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');

const SLASH_DIR = path.join(__dirname, '..', 'bot', 'commands');
const PREFIX_DIR = path.join(__dirname, '..', 'bot', 'prefixCommands');

// Красивые названия категорий (ключ = папка slash / имя файла префикса).
const CATEGORY_META = {
  moderation: { title: '🛡️ Модерация', order: 1 },
  modtools: { title: '🛡️ Модерация', order: 1 },
  xp: { title: '⭐ XP и уровни', order: 2 },
  config: { title: '⚙️ Конфигурация и безопасность', order: 3 },
  backup: { title: '⚙️ Конфигурация и безопасность', order: 3 },
  whitelist: { title: '⚙️ Конфигурация и безопасность', order: 3 },
  security: { title: '⚙️ Конфигурация и безопасность', order: 3 },
  tickets: { title: '🎫 Тикеты', order: 4 },
  utility: { title: '🧰 Утилиты', order: 5 },
  fun: { title: '🎲 Развлечения', order: 6 },
  other: { title: '📦 Прочее', order: 9 }
};

const PERM_LABELS = [
  [PermissionFlagsBits.Administrator, 'Администратор'],
  [PermissionFlagsBits.ManageGuild, 'Управление сервером'],
  [PermissionFlagsBits.BanMembers, 'Бан участников'],
  [PermissionFlagsBits.KickMembers, 'Кик участников'],
  [PermissionFlagsBits.ModerateMembers, 'Тайм-аут участников'],
  [PermissionFlagsBits.ManageMessages, 'Управление сообщениями'],
  [PermissionFlagsBits.ManageRoles, 'Управление ролями']
];

function permLabel(perm, adminOnly) {
  if (adminOnly) return 'Администратор';
  if (perm == null) return null;
  for (const [flag, label] of PERM_LABELS) if (BigInt(perm) === BigInt(flag)) return label;
  return 'Особые права';
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.js') && !entry.name.startsWith('_')) out.push(full);
  }
  return out;
}

/** Собирает usage-строку slash-команды из её JSON-описания. */
function slashUsage(json) {
  const opts = json.options || [];
  const subs = opts.filter((o) => o.type === 1 || o.type === 2); // subcommand / group
  if (subs.length) return { usage: `/${json.name} <подкоманда>`, subs: subs.map((s) => s.name) };
  const args = opts.map((o) => (o.required ? `<${o.name}>` : `[${o.name}]`));
  return { usage: `/${json.name}${args.length ? ' ' + args.join(' ') : ''}`, subs: [] };
}

function categoryOf(key) {
  return CATEGORY_META[key] ? key : 'other';
}

function safeRequire(file) {
  try { return require(file); } catch (e) { console.error('[catalog] require', file, e.message); return null; }
}

/** Возвращает массив категорий: [{ key, title, order, commands: [...] }]. */
function buildCatalog() {
  const byName = new Map(); // name -> merged command entry

  // --- Slash ---
  for (const file of walk(SLASH_DIR)) {
    const mod = safeRequire(file);
    if (!mod) continue;
    const list = Array.isArray(mod) ? mod : [mod];
    const catKey = categoryOf(path.basename(path.dirname(file)));
    for (const cmd of list) {
      if (!cmd || !cmd.data) continue;
      let json;
      try { json = cmd.data.toJSON(); } catch { continue; }
      const u = slashUsage(json);
      const entry = byName.get(json.name) || { name: json.name, category: catKey, description: json.description, prefix: false, slash: false };
      entry.slash = true;
      entry.slashUsage = u.usage;
      entry.subs = u.subs;
      if (!entry.description) entry.description = json.description;
      entry.category = catKey; // slash-папка приоритетнее
      byName.set(json.name, entry);
    }
  }

  // --- Prefix ---
  for (const file of walk(PREFIX_DIR)) {
    const mod = safeRequire(file);
    if (!mod) continue;
    const list = Array.isArray(mod) ? mod : [mod];
    const fileKey = categoryOf(path.basename(file, '.js'));
    for (const cmd of list) {
      if (!cmd || !cmd.name || typeof cmd.run !== 'function') continue;
      const entry = byName.get(cmd.name) || { name: cmd.name, category: fileKey, description: cmd.description, prefix: false, slash: false };
      entry.prefix = true;
      entry.prefixUsage = `!${cmd.name}`;
      entry.aliases = cmd.aliases || [];
      entry.perm = permLabel(cmd.permission, cmd.adminOnly);
      if (!entry.description) entry.description = cmd.description;
      if (!entry.slash) entry.category = fileKey;
      byName.set(cmd.name, entry);
    }
  }

  // --- Группировка по категориям ---
  const groups = new Map();
  for (const entry of byName.values()) {
    const meta = CATEGORY_META[entry.category] || CATEGORY_META.other;
    if (!groups.has(meta.title)) groups.set(meta.title, { title: meta.title, order: meta.order, commands: [] });
    groups.get(meta.title).commands.push(entry);
  }
  const result = [...groups.values()].sort((a, b) => a.order - b.order);
  for (const g of result) g.commands.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

/** Плоские счётчики для страницы «о боте». */
function stats(catalog) {
  let total = 0, slash = 0, prefix = 0, both = 0;
  for (const g of catalog) for (const c of g.commands) {
    total++;
    if (c.slash) slash++;
    if (c.prefix) prefix++;
    if (c.slash && c.prefix) both++;
  }
  return { total, slash, prefix, both, categories: catalog.length };
}

module.exports = { buildCatalog, stats };
