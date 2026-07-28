# GreatTime Bot — Discord-бот + веб-дашборд

Мультифункциональный Discord-бот с веб-панелью настройки. Всё, что ты меняешь на
сайте, бот подхватывает сразу — бот и дашборд ходят в одну общую базу
**Supabase (Postgres)**.

> ⚠️ Безопасность: никогда не публикуй `DISCORD_TOKEN` и `service_role` ключ Supabase
> (в чатах, скриншотах, git). Если засветил — сразу перевыпусти их. Все секреты живут
> только в файле `.env`, который уже в `.gitignore`.

> Все новые модули работают **и как slash-команды, и как префикс-команды** (`!`).
> Префикс меняется через `!config set prefix <symbol>`.

## Что умеет

- **Anti-Crash:** защита от рейда со стороны персонала. Следит за аудит-логом; если
  не-whitelist удаляет/меняет каналы, роли, вебхуки, имя сервера или добавляет бота —
  бот снимает все роли нарушителю, выдаёт timeout (по умолч. 3 ч) и **откатывает**
  изменение (пересоздаёт канал/роль из backup, возвращает старые настройки).
  Пороговые лимиты (`не более N действий за окно`) применяются даже к доверенным ролям.
- **Whitelist:** `!whitelist add/remove/list` (`/whitelist`) — доверенные для Anti-Crash.
- **Backup:** авто-snapshot структуры сервера каждые 30–60 с; ручной `!backup create/list/delete`
  и восстановление `!restore <id>` (`/backup`).
- **XP / уровни:** `!xp` `!leaderxp` `!setxp` `!addxp` `!removexp` (+ slash). Авто-начисление
  за сообщения (с кулдауном) и за время в голосовых; формула уровней и роли-награды настраиваемы.
- **Модерация:** `!ban <user> [срок] [причина]` (временный/перманентный), `!mute <user> <срок>`,
  `!unmute`, `!unban`, `!kick`, `!checkmute`, `!history` + `/warn` `/warnings` `/clearwarns` `/purge`.
  Вся история наказаний пишется в БД.
- **Автомодерация:** фильтр запрещённых слов, ссылок, инвайтов, массовых упоминаний.
- **Логи:** отдельный канал общих логов (кто/что/когда — из аудит-лога: каналы, роли,
  баны, кики, вебхуки, изменения сервера) + **отдельный канал Anti-Crash**.
- **Конфигурация через команды:** `!config set/get/list` — меняет настройки без правки кода/дашборда.
- **Проверка безопасности:** `!security` (`/security`) — статус backup, аудит-лога, БД, Anti-Crash.
- **Приветствия/прощания, автороли, reaction-роли, тикеты, утилиты/fun** — как раньше.
- **Дашборд:** вход через Discord OAuth2, список серверов, формы модулей.

> ⚠️ **Формула уровней глобальна в процессе** — при нескольких серверах с разными
> `xp.levelExponent` возможны редкие гонки при одновременной записи XP. Для одного-двух
> серверов это некритично.

## Требования Discord (важно для новых модулей)

- **Интенты** (в коде уже включены): `GuildModeration` — для события аудит-лога (Anti-Crash),
  `GuildVoiceStates` — для XP за голосовые. Оба **не** являются привилегированными,
  тумблеры в портале включать не нужно (в отличие от *Server Members* и *Message Content*).
- **Права бота на сервере** (обязательно для Anti-Crash/backup):
  *View Audit Log, Manage Channels, Manage Roles, Manage Server, Ban Members, Moderate Members*.
  Роль бота должна быть **выше** ролей, которые он защищает/снимает.
- После добавления новых команд один раз выполни `npm run deploy`, чтобы slash-команды появились.

## Структура

```
juniper-clone/
├── schema.sql       SQL для создания таблиц в Supabase (запустить один раз)
├── shared/          общий слой БД (Supabase) — используют и бот, и сайт
│   ├── db.js
│   └── modlog.js
├── bot/             discord.js v14
│   ├── index.js         точка входа
│   ├── deploy-commands.js  регистрация slash-команд
│   ├── commands/    команды (moderation, tickets, config, utility, fun)
│   └── events/      события (приветствия, автомод, логи, тикеты, reaction-роли)
└── dashboard/       Express + EJS
    ├── server.js        OAuth2 + сервер
    ├── routes/          сохранение настроек
    ├── views/           страницы
    └── public/          CSS
```

## Установка

Нужен Node.js 18+ (для встроенного `fetch`).

```bash
cd juniper-clone
npm install
cp .env.example .env      # Windows: copy .env.example .env
```

## Настройка Supabase

1. В своём проекте на https://supabase.com открой **SQL Editor → New query**.
2. Вставь содержимое `schema.sql` и нажми **Run** — создадутся таблицы.
3. **Project Settings → API**: скопируй **Project URL** → в `.env` как `SUPABASE_URL`,
   и ключ **`service_role`** → в `.env` как `SUPABASE_SERVICE_KEY`.
   `anon`/`public` ключ этому серверу не нужен — доступ идёт по `service_role` только с бэкенда.

## Настройка Discord-приложения

1. Открой https://discord.com/developers/applications → **New Application**.
2. **Bot** → включи *Server Members Intent* и *Message Content Intent* (нужны для приветствий и автомода). Скопируй **Token** → в `.env` как `DISCORD_TOKEN`.
3. **General Information** → **Application ID** → в `.env` как `CLIENT_ID`.
4. **OAuth2** → **Client Secret** (Reset Secret) → в `.env` как `CLIENT_SECRET`.
5. **OAuth2 → Redirects** → добавь `http://localhost:3000/auth/callback` (точь-в-точь как `OAUTH_REDIRECT_URI`).
6. Пригласи бота на сервер: **OAuth2 → URL Generator** → scopes `bot` + `applications.commands`, права: Ban/Kick/Manage Roles/Manage Channels/Moderate Members/Manage Messages. Открой полученную ссылку.

Заполни `.env` (см. `.env.example`).

## Запуск

```bash
npm run deploy      # один раз: регистрирует slash-команды
                    # (для мгновенной регистрации на своём сервере
                    #  добавь GUILD_ID=... в .env — иначе глобально, до ~1 часа)

npm run bot         # запустить бота
npm run dashboard   # запустить сайт (в другом терминале)
# или всё сразу:
npm start
```

Дашборд: http://localhost:3000 → «Войти через Discord» → выбери сервер → настраивай.

## Как это работает вместе

Бот и сайт подключают один и тот же `shared/db.js` и ходят в одну базу Supabase.
Сохранил настройку на сайте → она записалась в Postgres → бот читает её при следующем
событии (сообщение, вход участника, команда). Перезапуск не нужен, хосты могут быть разными.

## Заметки

- Мьют реализован через встроенный **timeout** Discord (до 28 дней) — отдельная мьют-роль не обязательна.
- Reaction-роли: запусти `/reactionrole` в том же канале, где висит сообщение.
- Права видимости серверов на дашборде определяются флагом *Manage Guild*.
```
#   g r e a t t i m e b o t  
 