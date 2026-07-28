'use strict';

/**
 * Подстановка плейсхолдеров в пользовательские шаблоны сообщений.
 * Пример: fill('Привет, {user}!', { user: '<@1>' }) -> 'Привет, <@1>!'
 * Неизвестные плейсхолдеры остаются как есть.
 */
function fill(template, vars = {}) {
  return String(template == null ? '' : template).replace(/\{(\w+)\}/g, (m, key) =>
    vars[key] != null ? String(vars[key]) : m
  );
}

module.exports = { fill };
