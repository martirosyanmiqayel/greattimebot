'use strict';

/**
 * Веб-дашборд GreatTime Bot. Логин через Discord OAuth2, выбор сервера,
 * страницы настроек модулей. Всё сохраняется в общую БД (shared/db.js),
 * откуда бот читает настройки без перезапуска.
 */

const path = require('path');
const express = require('express');
const session = require('express-session');
require('dotenv').config();

const db = require('../shared/db');
const settingsRoutes = require('./routes/settings');
const { buildCatalog, stats } = require('./catalog');

// Каталог команд строим один раз при старте (список статичен в рамках процесса).
const COMMAND_CATALOG = buildCatalog();
const COMMAND_STATS = stats(COMMAND_CATALOG);

const app = express();
const PORT = process.env.PORT || 3000;
const { CLIENT_ID, CLIENT_SECRET, OAUTH_REDIRECT_URI, SESSION_SECRET, DISCORD_TOKEN } = process.env;

const DISCORD_API = 'https://discord.com/api/v10';
const SCOPES = ['identify', 'guilds'];
// ADMINISTRATOR (0x8). BigInt — permissions приходит огромным числом.
const ADMINISTRATOR = 0x8n;

// Кэш серверов, где присутствует сам бот (по токену бота).
let _botGuilds = { ids: new Set(), at: 0 };
async function getBotGuildIds() {
  if (!DISCORD_TOKEN) return new Set();
  if (Date.now() - _botGuilds.at < 30000) return _botGuilds.ids;
  try {
    const res = await fetch(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: `Bot ${DISCORD_TOKEN}` } });
    const data = await res.json();
    _botGuilds = { ids: new Set(Array.isArray(data) ? data.map((g) => g.id) : []), at: Date.now() };
  } catch (err) {
    console.error('[dashboard] getBotGuildIds:', err.message);
  }
  return _botGuilds.ids;
}

// Кэш профиля бота (имя/аватар/id) — для страницы «о боте».
let _botUser = { data: null, at: 0 };
async function getBotUser() {
  if (!DISCORD_TOKEN) return null;
  if (_botUser.data && Date.now() - _botUser.at < 300000) return _botUser.data;
  try {
    const res = await fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bot ${DISCORD_TOKEN}` } });
    if (res.ok) _botUser = { data: await res.json(), at: Date.now() };
  } catch (err) {
    console.error('[dashboard] getBotUser:', err.message);
  }
  return _botUser.data;
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 3600 * 1000 }
}));

const INVITE_URL = CLIENT_ID
  ? `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands`
  : null;

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.inviteUrl = INVITE_URL;
  next();
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

app.get('/', (req, res) => res.render('index'));

// Публичные страницы: список всех команд и информация о боте.
app.get('/commands', (req, res) => {
  res.render('commands', { catalog: COMMAND_CATALOG, stats: COMMAND_STATS });
});

app.get('/bot', async (req, res) => {
  const [botUser, botGuilds] = await Promise.all([getBotUser(), getBotGuildIds()]);
  const avatar = botUser && botUser.avatar
    ? `https://cdn.discordapp.com/avatars/${botUser.id}/${botUser.avatar}.png?size=128`
    : null;
  res.render('botinfo', {
    bot: botUser ? { id: botUser.id, name: botUser.global_name || botUser.username, avatar } : null,
    serverCount: botGuilds.size,
    stats: COMMAND_STATS
  });
});

app.get('/login', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).send('Не заданы CLIENT_ID / CLIENT_SECRET в .env');
  const url =
    `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}` +
    `&response_type=code&scope=${encodeURIComponent(SCOPES.join(' '))}`;
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/');
  try {
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code', code, redirect_uri: OAUTH_REDIRECT_URI
      })
    });
    const token = await tokenRes.json();
    if (!token.access_token) throw new Error('Нет access_token: ' + JSON.stringify(token));

    const auth = { headers: { Authorization: `Bearer ${token.access_token}` } };
    const [me, guilds] = await Promise.all([
      fetch(`${DISCORD_API}/users/@me`, auth).then((r) => r.json()),
      fetch(`${DISCORD_API}/users/@me/guilds`, auth).then((r) => r.json())
    ]);

    req.session.user = { id: me.id, username: me.username, global_name: me.global_name, avatar: me.avatar };
    req.session.guilds = (Array.isArray(guilds) ? guilds : []).filter((g) => {
      if (g.owner) return true;
      try { return (BigInt(g.permissions) & ADMINISTRATOR) === ADMINISTRATOR; } catch { return false; }
    });
    res.redirect('/dashboard');
  } catch (err) {
    console.error('[dashboard] OAuth ошибка:', err);
    res.status(500).send('Ошибка авторизации. Проверь redirect URI и секреты в .env.');
  }
});

app.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/')); });

app.get('/dashboard', requireAuth, async (req, res) => {
  const botGuilds = await getBotGuildIds();
  const guilds = (req.session.guilds || []).map((g) => ({ ...g, botPresent: botGuilds.has(g.id) }));
  res.render('dashboard', { guilds });
});

app.use('/dashboard/:guildId', requireAuth, async (req, res, next) => {
  const guild = (req.session.guilds || []).find((g) => g.id === req.params.guildId);
  if (!guild) return res.status(403).send('Нет доступа к этому серверу.');
  req.guild = guild;
  try {
    req.settings = await db.getSettings(guild.id);
    const botGuilds = await getBotGuildIds();
    req.botPresent = botGuilds.has(guild.id);
    next();
  } catch (err) {
    console.error('[dashboard] getSettings:', err);
    res.status(500).send('Ошибка чтения настроек из Supabase.');
  }
}, settingsRoutes);

app.listen(PORT, () => console.log(`[dashboard] Запущен: http://localhost:${PORT}`));
