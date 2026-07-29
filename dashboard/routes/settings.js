'use strict';

/**
 * Роуты настроек одного сервера. req.guild, req.settings, req.botPresent
 * подготовлены middleware в server.js. Данные пишутся в общую БД.
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../../shared/db');
const discord = require('../discord');

const bool = (v) => v === 'on' || v === 'true' || v === true;
const lines = (v) => (v || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

// ---- Страница модулей ----
router.get('/', async (req, res) => {
  const [reactionRoles, whitelist, customCommands, backups] = await Promise.all([
    db.listReactionRoles(req.guild.id),
    db.whitelistList(req.guild.id),
    db.listCustomCommands(req.guild.id),
    db.listBackups(req.guild.id, 20)
  ]);
  res.render('guild', {
    guild: req.guild,
    settings: req.settings,
    saved: req.query.saved,
    botPresent: req.botPresent,
    reactionRoles,
    whitelist,
    customCommands,
    backups
  });
});

// ---- Модерация + автомод (+ тексты сообщений) ----
router.post('/moderation', async (req, res) => {
  const b = req.body;
  await db.updateSettings(req.guild.id, {
    moderation: {
      enabled: bool(b.mod_enabled),
      logChannelId: b.logChannelId || null,
      muteRoleId: b.muteRoleId || null,
      dmOnPunish: bool(b.dmOnPunish),
      banDm: b.banDm || '',
      kickDm: b.kickDm || '',
      warnDm: b.warnDm || '',
      muteDm: b.muteDm || ''
    },
    automod: {
      enabled: bool(b.automod_enabled),
      blockedWords: lines(b.blockedWords),
      blockInvites: bool(b.blockInvites),
      blockLinks: bool(b.blockLinks),
      maxMentions: parseInt(b.maxMentions, 10) || 0,
      punishment: b.punishment || 'delete',
      noticeMessage: b.noticeMessage || ''
    }
  });
  res.redirect(`/dashboard/${req.guild.id}?saved=moderation#moderation`);
});

// ---- Приветствия / прощания ----
router.post('/welcome', async (req, res) => {
  const b = req.body;
  await db.updateSettings(req.guild.id, {
    welcome: {
      enabled: bool(b.welcome_enabled),
      channelId: b.welcomeChannelId || null,
      message: b.welcomeMessage || '',
      dmMessage: b.dmMessage ? b.dmMessage : null
    },
    goodbye: {
      enabled: bool(b.goodbye_enabled),
      channelId: b.goodbyeChannelId || null,
      message: b.goodbyeMessage || ''
    }
  });
  res.redirect(`/dashboard/${req.guild.id}?saved=welcome#welcome`);
});

// ---- Автороли ----
router.post('/autorole', async (req, res) => {
  const b = req.body;
  await db.updateSettings(req.guild.id, {
    autorole: { enabled: bool(b.autorole_enabled), roleIds: lines(b.roleIds) }
  });
  res.redirect(`/dashboard/${req.guild.id}?saved=autorole#autorole`);
});

// ---- Логирование ----
const LOG_EVENTS = [
  'messageDelete', 'messageEdit', 'memberJoin', 'memberLeave',
  'channelCreate', 'channelDelete', 'channelUpdate',
  'roleCreate', 'roleDelete', 'roleUpdate',
  'memberBan', 'memberUnban', 'memberKick', 'webhookUpdate', 'guildUpdate'
];
router.post('/logging', async (req, res) => {
  const b = req.body;
  const events = {};
  for (const key of LOG_EVENTS) events[key] = bool(b['ev_' + key]);
  await db.updateSettings(req.guild.id, {
    logging: { enabled: bool(b.logging_enabled), channelId: b.logChannelId || null, events }
  });
  res.redirect(`/dashboard/${req.guild.id}?saved=logging#logging`);
});

// ---- XP / уровни ----
router.post('/xp', async (req, res) => {
  const b = req.body;
  // Роли-награды: параллельные массивы lvl_level[], lvl_role[] (выдать), lvl_remove[] (снять).
  const levels = arr(b.lvl_level);
  const roleIds = arr(b.lvl_role);
  const removeIds = arr(b.lvl_remove);
  const levelRoles = [];
  for (let i = 0; i < levels.length; i++) {
    const lv = parseInt(levels[i], 10);
    const rid = (roleIds[i] || '').trim();
    const rem = (removeIds[i] || '').trim();
    if (!Number.isNaN(lv) && (rid || rem)) levelRoles.push({ level: lv, roleId: rid || null, removeRoleId: rem || null });
  }
  await db.updateSettings(req.guild.id, {
    xp: {
      enabled: bool(b.xp_enabled),
      perMessage: parseInt(b.perMessage, 10) || 0,
      messageCooldownSec: parseInt(b.messageCooldownSec, 10) || 0,
      perVoiceMinute: parseInt(b.perVoiceMinute, 10) || 0,
      announceLevelUp: bool(b.announceLevelUp),
      levelUpChannelId: b.levelUpChannelId || null,
      levelUpMessage: b.levelUpMessage || '',
      levelBaseXp: parseInt(b.levelBaseXp, 10) || 100,
      levelExponent: parseFloat(b.levelExponent) || 2,
      levelRoles
    }
  });
  res.redirect(`/dashboard/${req.guild.id}?saved=xp#xp`);
});

// ---- Anti-Crash ----
router.post('/anticrash', async (req, res) => {
  const b = req.body;
  const protectKeys = ['channelDelete', 'channelUpdate', 'roleDelete', 'roleUpdate', 'guildUpdate',
    'webhookDelete', 'webhookUpdate', 'memberKick', 'memberBanAdd', 'memberPrune', 'memberRoleUpdate', 'botAdd'];
  const protect = {};
  for (const k of protectKeys) protect[k] = bool(b['p_' + k]);
  const limitKeys = ['channelDelete', 'roleDelete', 'memberKick'];
  const limits = {};
  for (const k of limitKeys) {
    limits[k] = {
      count: parseInt(b['lim_' + k + '_count'], 10) || 3,
      windowSec: parseInt(b['lim_' + k + '_window'], 10) || 30
    };
  }
  const punishment = ['timeout', 'kick', 'ban'].includes(b.punishment) ? b.punishment : 'timeout';
  await db.updateSettings(req.guild.id, {
    anticrash: {
      enabled: bool(b.anticrash_enabled),
      logChannelId: b.ac_logChannelId || null,
      autoRestore: bool(b.autoRestore),
      stripRoles: bool(b.stripRoles),
      alertOwner: bool(b.alertOwner),
      alertWhitelist: bool(b.alertWhitelist),
      punishment,
      punishTimeoutHours: parseInt(b.punishTimeoutHours, 10) || 3,
      whitelistRoleIds: lines(b.whitelistRoleIds),
      protect,
      limits
    }
  });
  res.redirect(`/dashboard/${req.guild.id}?saved=anticrash#anticrash`);
});

// ---- Backup: настройки ----
router.post('/backup', async (req, res) => {
  const b = req.body;
  await db.updateSettings(req.guild.id, {
    backup: {
      enabled: bool(b.backup_enabled),
      intervalSec: Math.max(30, parseInt(b.intervalSec, 10) || 60),
      keep: Math.max(1, parseInt(b.keep, 10) || 20)
    }
  });
  res.redirect(`/dashboard/${req.guild.id}?saved=backup#backup`);
});

// ---- Backup: создать снимок прямо из панели (через бот-токен) ----
router.post('/backup/create', async (req, res) => {
  try {
    const snap = await discord.buildSnapshot(req.guild.id, req.guild.name);
    await db.saveBackup(req.guild.id, snap, 'manual', req.settings.backup.keep || 20);
    res.redirect(`/dashboard/${req.guild.id}?saved=backup_created#backup`);
  } catch (err) {
    console.error('[dashboard] backup create:', err.message);
    res.redirect(`/dashboard/${req.guild.id}?saved=backup_error#backup`);
  }
});
router.post('/backup/delete', async (req, res) => {
  const id = parseInt(req.body.id, 10);
  if (!Number.isNaN(id)) await db.deleteBackup(req.guild.id, id);
  res.redirect(`/dashboard/${req.guild.id}?saved=backup_deleted#backup`);
});

// ---- Стафф-роли ----
router.post('/staff', async (req, res) => {
  const b = req.body;
  const mode = ['either', 'roleOnly'].includes(b.mode) ? b.mode : 'either';
  await db.updateSettings(req.guild.id, { staff: { roleIds: lines(b.roleIds), mode } });
  res.redirect(`/dashboard/${req.guild.id}?saved=staff#staff`);
});

// ---- Тексты ответов бота ----
router.post('/messages', async (req, res) => {
  const b = req.body;
  await db.updateSettings(req.guild.id, {
    messages: {
      noPermission: b.noPermission || '',
      adminOnly: b.adminOnly || '',
      commandError: b.commandError || ''
    }
  });
  res.redirect(`/dashboard/${req.guild.id}?saved=messages#messages`);
});

// ---- Whitelist Anti-Crash (add / remove) ----
router.post('/whitelist/add', async (req, res) => {
  const id = (req.body.userId || '').replace(/\D/g, '');
  if (id) await db.whitelistAdd(req.guild.id, id, 'dashboard');
  res.redirect(`/dashboard/${req.guild.id}?saved=whitelist#anticrash`);
});
router.post('/whitelist/remove', async (req, res) => {
  const id = (req.body.userId || '').replace(/\D/g, '');
  if (id) await db.whitelistRemove(req.guild.id, id);
  res.redirect(`/dashboard/${req.guild.id}?saved=whitelist#anticrash`);
});

// ---- Тикеты (+ тексты) ----
router.post('/tickets', async (req, res) => {
  const b = req.body;
  await db.updateSettings(req.guild.id, {
    tickets: {
      enabled: bool(b.tickets_enabled),
      categoryId: b.categoryId || null,
      supportRoleId: b.supportRoleId || null,
      panelChannelId: b.panelChannelId || null,
      panelTitle: b.panelTitle || '',
      panelDescription: b.panelDescription || '',
      panelButtonLabel: b.panelButtonLabel || 'Открыть тикет',
      welcomeMessage: b.ticketMessage || '',
      closeMessage: b.closeMessage || ''
    }
  });
  res.redirect(`/dashboard/${req.guild.id}?saved=tickets#tickets`);
});

// ---- Reaction roles: создать панель (бот постит сообщение и вешает реакции) ----
router.post('/reactionroles', async (req, res) => {
  const b = req.body;
  const channelId = (b.channelId || '').trim();
  const message = b.message || 'Выбери роль реакцией ниже';
  const emojis = arr(b.emoji);
  const roles = arr(b.role);

  const pairs = [];
  for (let i = 0; i < emojis.length; i++) {
    const e = (emojis[i] || '').trim();
    const r = (roles[i] || '').trim();
    if (e && r) pairs.push({ emoji: e, role: r });
  }

  if (!channelId || !pairs.length) {
    return res.redirect(`/dashboard/${req.guild.id}?saved=rr_error#reactionroles`);
  }

  try {
    const listText = pairs.map((p) => `${p.emoji} — <@&${p.role}>`).join('\n');
    const msg = await discord.postMessage(channelId, {
      embeds: [{ title: 'Роли по реакции', description: `${message}\n\n${listText}`, color: 0x5865f2 }]
    });
    for (const p of pairs) {
      const pe = discord.parseEmoji(p.emoji);
      await discord.addReaction(channelId, msg.id, pe.reaction);
      await db.addReactionRole(req.guild.id, msg.id, pe.key, p.role);
      await new Promise((r) => setTimeout(r, 300)); // мягко к rate-limit
    }
    res.redirect(`/dashboard/${req.guild.id}?saved=reactionroles#reactionroles`);
  } catch (err) {
    console.error('[dashboard] reactionroles:', err.message);
    res.status(500).send('Не удалось создать панель ролей: ' + err.message + '. Проверь ID канала и права бота.');
  }
});

// ---- Кастомные команды ----
router.post('/customcommands/add', async (req, res) => {
  const name = (req.body.name || '').trim().toLowerCase();
  const response = (req.body.response || '').trim();
  if (name && response && /^[a-zа-я0-9_-]{1,32}$/i.test(name)) {
    await db.addCustomCommand(req.guild.id, name, response, req.session.user ? req.session.user.id : 'dashboard');
  }
  res.redirect(`/dashboard/${req.guild.id}?saved=customcommands#customcommands`);
});
router.post('/customcommands/delete', async (req, res) => {
  if (req.body.name) await db.removeCustomCommand(req.guild.id, req.body.name);
  res.redirect(`/dashboard/${req.guild.id}?saved=cc_deleted#customcommands`);
});

// ---- Reaction roles: удалить одну привязку ----
router.post('/reactionroles/delete', async (req, res) => {
  if (req.body.id) await db.deleteReactionRole(req.body.id);
  res.redirect(`/dashboard/${req.guild.id}?saved=rr_deleted#reactionroles`);
});

module.exports = router;
