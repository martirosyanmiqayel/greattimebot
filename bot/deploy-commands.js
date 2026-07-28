'use strict';

/**
 * Регистрирует slash-команды в Discord.
 * Запуск: npm run deploy
 *
 * По умолчанию регистрирует ГЛОБАЛЬНО (может обновляться до ~1 часа).
 * Если задан GUILD_ID в .env — регистрирует на конкретном сервере мгновенно
 * (удобно при разработке).
 */

const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
require('dotenv').config();

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

function push(command) {
  if (command && command.data && command.execute) commands.push(command.data.toJSON());
}
function collect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (entry.name.endsWith('.js')) {
      const mod = require(full);
      if (Array.isArray(mod)) mod.forEach(push);
      else push(mod);
    }
  }
}
collect(commandsPath);

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`[deploy] Регистрирую ${commands.length} команд...`);
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log(`[deploy] Готово (сервер ${process.env.GUILD_ID}).`);
    } else {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log('[deploy] Готово (глобально). Обновление может занять до часа.');
    }
  } catch (err) {
    console.error('[deploy] Ошибка:', err);
    process.exit(1);
  }
})();
