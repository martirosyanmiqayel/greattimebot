# Запуск GreatTime Bot 24/7

Боту нужен **постоянно включённый** хост (у него живой WebSocket к Discord и
фоновые задачи) — на «серверлес» вроде Vercel он работать не будет. Дашборд —
обычный Express, поэтому и бот, и панель удобно держать на одном хосте: команда
`npm start` поднимает оба процесса сразу (через `concurrently`), а дашборд слушает
порт из переменной `PORT`, который выдаёт платформа.

Ниже два пути:
- **A. Railway** — проще всего, «залил репозиторий → работает» (похоже на то, что ты хотел от Vercel).
- **B. VPS + PM2** (Oracle Cloud Always Free и т.п.) — полностью бесплатно и без засыпаний.

---

## A. Railway (бот + дашборд в одном сервисе)

1. Залей проект на **GitHub** (файл `.env` НЕ коммить — он уже в `.gitignore`).
2. https://railway.app → **New Project → Deploy from GitHub repo** → выбери репозиторий.
   Railway сам поставит зависимости и запустит `npm start` (поднимутся и бот, и дашборд).
3. **Variables** → добавь переменные из `.env.example`:
   `DISCORD_TOKEN`, `CLIENT_ID`, `CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
   `SESSION_SECRET` (любая длинная строка). `PORT` задавать не нужно — Railway даёт свой.
4. **Settings → Networking → Generate Domain** — получишь адрес вида `https://xxx.up.railway.app`.
   Добавь ещё две переменные:
   ```
   DASHBOARD_URL=https://xxx.up.railway.app
   OAUTH_REDIRECT_URI=https://xxx.up.railway.app/auth/callback
   ```
5. Discord Developer Portal → **OAuth2 → Redirects** → добавь тот же
   `https://xxx.up.railway.app/auth/callback`.
6. Один раз зарегистрируй slash-команды. Проще всего — локально со своего ПК:
   ```bash
   npm run deploy
   ```
   (нужны только `DISCORD_TOKEN` и `CLIENT_ID` в локальном `.env`.) Либо запусти
   `npm run deploy` как разовую команду в Railway.
7. Discord Developer Portal → **Bot** → включи *Server Members Intent* и *Message Content Intent*.

Готово: бот онлайн 24/7, дашборд — по выданному адресу. Обновление — просто `git push`,
Railway пере-деплоит сам (`npm run deploy` повторяй только если менялись команды).

> ⚠️ Про бесплатные тарифы: у Railway пробный кредит ограничен; у **Render free**
> веб-сервисы «засыпают» при простое — для бота это значит уход в оффлайн, поэтому
> либо платный план, либо путь **B (VPS)** ниже — он бесплатный и без засыпаний.

---

## B. VPS + PM2 (Oracle Cloud Always Free / любой Ubuntu)

Полностью бесплатный вариант на Oracle Cloud Always Free. Те же шаги подойдут для любого
Ubuntu-VPS. Дашборд можно держать локально и запускать по надобности — 24/7
обязателен только бот.

## 1. Создать бесплатный сервер (Oracle Cloud Always Free)

1. Зарегистрируйся на https://www.oracle.com/cloud/free/ (нужна карта только
   для верификации, с «Always Free» ресурсов деньги не списывают).
2. Создай инстанс: Compute → Instances → Create Instance.
   - Image: **Ubuntu 22.04**.
   - Shape: **Ampere (ARM), Always Free eligible** (например VM.Standard.A1.Flex, 1 OCPU / 6 ГБ — с запасом).
3. Скачай приватный SSH-ключ при создании.
4. В разделе Networking открой доступ: Security List → добавь Ingress-правило
   на порт **3000** (нужно только если хочешь открыть дашборд снаружи).

## 2. Подключиться и поставить окружение

```bash
ssh -i твой_ключ.key ubuntu@ПУБЛИЧНЫЙ_IP

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# pm2 — менеджер процессов (держит бота онлайн)
sudo npm install -g pm2
```

## 3. Залить код

Вариант А (через git — рекомендую):
```bash
git clone ТВОЙ_РЕПОЗИТОРИЙ greattime-bot
cd greattime-bot
```
Вариант Б: закинь папку проекта через scp/SFTP на сервер.

> Важно: файл `.env` НЕ коммить в git. Его создаём прямо на сервере (шаг 4).

```bash
npm install
```

## 4. Создать .env на сервере

```bash
nano .env
```
Вставь свои значения (см. `.env.example`). Для продакшена поменяй адреса
дашборда на реальные (если открываешь его наружу):
```
DASHBOARD_URL=http://ПУБЛИЧНЫЙ_IP:3000
OAUTH_REDIRECT_URI=http://ПУБЛИЧНЫЙ_IP:3000/auth/callback
```
И в Discord Developer Portal → OAuth2 → Redirects добавь этот же
`http://ПУБЛИЧНЫЙ_IP:3000/auth/callback`.

Если дашборд наружу не нужен — оставь localhost и запускай дашборд когда надо
у себя на компе; на сервере крути только бота.

## 5. Зарегистрировать команды (один раз)

```bash
npm run deploy
```

## 6. Запустить 24/7 через pm2

Только бот (минимум для 24/7):
```bash
pm2 start ecosystem.config.js --only greattime-bot
```
Бот + дашборд:
```bash
pm2 start ecosystem.config.js
```

Сохранить список процессов и включить автозапуск после перезагрузки сервера:
```bash
pm2 save
pm2 startup    # выполни команду, которую он подскажет (sudo ...)
```

## Полезные команды pm2

```bash
pm2 list             # что запущено
pm2 logs             # живые логи (Ctrl+C — выйти)
pm2 logs greattime-bot
pm2 restart greattime-bot
pm2 stop greattime-bot
```

## Обновление кода

```bash
cd greattime-bot
git pull
npm install
npm run deploy       # только если менялись/добавлялись команды
pm2 restart all
```

## Частые проблемы

- **Used disallowed intents** — включи в Discord Developer Portal → Bot →
  Server Members Intent и Message Content Intent.
- **Бот онлайн, но не отвечает на команды** — прогони `npm run deploy` и подожди
  (глобальные команды обновляются до ~1 часа; для мгновенного обновления укажи
  `GUILD_ID` в .env).
- **Дашборд не открывается снаружи** — проверь Ingress-правило на порт 3000 и что
  процесс `greattime-dashboard` запущен (`pm2 list`).
