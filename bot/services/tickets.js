'use strict';

/** Сборка панели тикетов: меню выбора типа (если заданы types) или обычная кнопка. */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');

/** Парсит эмодзи для компонента: кастом <:name:id> -> {id,name}, иначе строка. */
function parseEmoji(input) {
  const s = String(input || '').trim();
  if (!s) return undefined;
  const m = /^<(a?):(\w+):(\d+)>$/.exec(s);
  if (m) return { animated: !!m[1], name: m[2], id: m[3] };
  return s; // юникод-эмодзи
}

function buildPanel(settings) {
  const t = settings.tickets || {};
  const embed = new EmbedBuilder()
    .setTitle(t.panelTitle || '🎫 Поддержка')
    .setDescription(t.panelDescription || 'Нажми на кнопку ниже, чтобы открыть тикет.')
    .setColor(0x5865f2);

  const types = (t.types || []).filter((x) => x && x.label);
  let row;
  if (types.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket_type')
      .setPlaceholder(t.selectPlaceholder || 'Выберите тип обращения');
    types.slice(0, 25).forEach((ty, i) => {
      const opt = { label: String(ty.label).slice(0, 100), value: String(i) };
      if (ty.description) opt.description = String(ty.description).slice(0, 100);
      const emoji = parseEmoji(ty.emoji);
      if (emoji) { try { opt.emoji = emoji; } catch { /* кривой эмодзи — пропускаем */ } }
      menu.addOptions(opt);
    });
    row = new ActionRowBuilder().addComponents(menu);
  } else {
    row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_create').setLabel(t.panelButtonLabel || 'Открыть тикет').setStyle(ButtonStyle.Primary).setEmoji('🎫')
    );
  }
  return { embeds: [embed], components: [row] };
}

module.exports = { buildPanel, parseEmoji };
