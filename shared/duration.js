'use strict';

/**
 * Разбор и форматирование длительностей.
 * Поддерживает комбинации: "30d", "2h", "1d12h30m", "45s", "1w".
 * Единицы: s (сек), m (мин), h (час), d (день), w (неделя).
 */

const UNIT_MS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000
};

/** '2h30m' -> ms. Возвращает null, если строка не распознана. */
function parseDuration(str) {
  if (str == null) return null;
  const s = String(str).trim().toLowerCase();
  if (!s) return null;
  if (s === 'perm' || s === 'permanent' || s === 'навсегда') return null;
  const re = /(\d+)\s*(s|m|h|d|w)/g;
  let total = 0;
  let matched = false;
  let m;
  while ((m = re.exec(s)) !== null) {
    matched = true;
    total += parseInt(m[1], 10) * UNIT_MS[m[2]];
  }
  return matched ? total : null;
}

const RU_UNITS = [
  { ms: UNIT_MS.d, forms: ['день', 'дня', 'дней'] },
  { ms: UNIT_MS.h, forms: ['час', 'часа', 'часов'] },
  { ms: UNIT_MS.m, forms: ['минута', 'минуты', 'минут'] },
  { ms: UNIT_MS.s, forms: ['секунда', 'секунды', 'секунд'] }
];

/** Русская форма числительного: 2 -> 'часа', 5 -> 'часов'. */
function plural(n, [one, few, many]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** ms -> человекочитаемо по-русски: '2 часа 30 минут'. null/0 -> 'навсегда'. */
function humanizeDuration(ms) {
  if (ms == null || ms <= 0) return 'навсегда';
  let rest = ms;
  const parts = [];
  for (const u of RU_UNITS) {
    if (rest >= u.ms) {
      const n = Math.floor(rest / u.ms);
      rest -= n * u.ms;
      parts.push(`${n} ${plural(n, u.forms)}`);
      if (parts.length >= 2) break; // достаточно двух старших единиц
    }
  }
  return parts.length ? parts.join(' ') : 'меньше секунды';
}

module.exports = { parseDuration, humanizeDuration, UNIT_MS };
