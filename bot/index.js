'use strict';

/**
 * Точка входа бота. Загружает все команды из bot/commands/**,
 * все события из bot/events/**, логинится в Discord.
 */

const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
require('dotenv').config();

if (!process.env.DISCORD_TOKEN) {
  console.error('[bot] Не задан DISCORD_TOKEN в .env — бот не может запуститься.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    // GuildModeration нужен для события guildAuditLogEntryCreate (Anti-Crash).
    GatewayIntentBits.GuildModeration,
    // GuildVoiceStates — для начисления XP за время в голосовых.
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember]
});

// ---- Загрузка slash-команд ----
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');

function registerCommand(command, source) {
  if (command && command.data && command.execute) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`[bot] Пропущена команда ${source}: нет data/execute.`);
  }
}

function loadCommands(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadCommands(full);
    } else if (entry.name.endsWith('.js')) {
      const mod = require(full);
      if (Array.isArray(mod)) mod.forEach((c) => registerCommand(c, full));
      else registerCommand(mod, full);
    }
  }
}
loadCommands(commandsPath);
console.log(`[bot] Загружено slash-команд: ${client.commands.size}`);

// ---- Загрузка префикс-команд ----
// Модули из bot/prefixCommands/**: { name, aliases?, permission?, adminOnly?, run(ctx) }.
// Файлы, начинающиеся с '_', — вспомогательные, не команды.
client.prefixCommands = new Collection();
const prefixPath = path.join(__dirname, 'prefixCommands');

function registerPrefix(command, source) {
  if (!command || !command.name || typeof command.run !== 'function') {
    console.warn(`[bot] Пропущена префикс-команда ${source}: нет name/run.`);
    return;
  }
  client.prefixCommands.set(command.name.toLowerCase(), command);
  for (const alias of command.aliases || []) client.prefixCommands.set(alias.toLowerCase(), command);
}
function loadPrefix(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) loadPrefix(full);
    else if (entry.name.endsWith('.js') && !entry.name.startsWith('_')) {
      const mod = require(full);
      if (Array.isArray(mod)) mod.forEach((c) => registerPrefix(c, full));
      else registerPrefix(mod, full);
    }
  }
}
if (fs.existsSync(prefixPath)) loadPrefix(prefixPath);
console.log(`[bot] Загружено префикс-имён: ${client.prefixCommands.size}`);

// ---- Загрузка событий ----
// Файл события может экспортировать один объект {name, execute} или массив таких.
const eventsPath = path.join(__dirname, 'events');
function registerEvent(event) {
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}
for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'))) {
  const mod = require(path.join(eventsPath, file));
  if (Array.isArray(mod)) mod.forEach(registerEvent);
  else registerEvent(mod);
}

process.on('unhandledRejection', (err) => console.error('[bot] unhandledRejection:', err));

client.login(process.env.DISCORD_TOKEN);
