// Конфиг для pm2 — менеджера процессов, который держит бота онлайн 24/7,
// перезапускает при падении и после перезагрузки сервера.
//
// Запуск только бота (минимум для 24/7):
//   pm2 start ecosystem.config.js --only greattime-bot
// Запуск бота + дашборда:
//   pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'greattime-bot',
      script: 'bot/index.js',
      autorestart: true,
      max_restarts: 15,
      restart_delay: 3000,
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'greattime-dashboard',
      script: 'dashboard/server.js',
      autorestart: true,
      env: { NODE_ENV: 'production' }
    }
  ]
};
