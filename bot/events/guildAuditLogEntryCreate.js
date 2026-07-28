'use strict';

const anticrash = require('../services/anticrash');

module.exports = {
  name: 'guildAuditLogEntryCreate',
  async execute(entry, guild) {
    try {
      await anticrash.handleAuditEntry(entry, guild);
    } catch (err) {
      console.error('[anticrash] handler:', err);
    }
  }
};
