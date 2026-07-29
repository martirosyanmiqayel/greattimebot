'use strict';

/**
 * Роутер взаимодействий: slash-команды + кнопки (тикеты).
 */

const {
  ChannelType, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require('discord.js');
const db = require('../../shared/db');
const staff = require('../services/staff');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      // Стафф-гейт: для команд с ограничением по правам проверяем стафф-роли.
      if (interaction.inGuild()) {
        let dmp = null;
        try { dmp = command.data.toJSON().default_member_permissions; } catch { /* нет ограничения */ }
        if (dmp) {
          const settings = await db.getSettings(interaction.guild.id);
          if (!staff.passes(interaction.member, settings, BigInt(dmp), false)) {
            return interaction.reply({ content: settings.messages.noPermission || '⛔ Недостаточно прав для этой команды.', ephemeral: true }).catch(() => {});
          }
        }
      }

      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(`[bot] Ошибка команды ${interaction.commandName}:`, err);
        const payload = { content: '⚠️ Произошла ошибка при выполнении команды.', ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
      }
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'ticket_create') return openTicket(interaction);
      if (interaction.customId === 'ticket_close') return closeTicket(interaction);
    }
  }
};

async function openTicket(interaction) {
  const guild = interaction.guild;
  const settings = await db.getSettings(guild.id);
  const cfg = settings.tickets;

  const existing = await db.findOpenTicket(guild.id, interaction.user.id);
  if (existing) {
    return interaction.reply({ content: `У тебя уже есть открытый тикет: <#${existing.channel_id}>`, ephemeral: true });
  }

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
  ];
  if (cfg.supportRoleId) {
    overwrites.push({ id: cfg.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }

  const channel = await guild.channels.create({
    name: `ticket-${interaction.user.username}`.slice(0, 90),
    type: ChannelType.GuildText,
    parent: cfg.categoryId || undefined,
    permissionOverwrites: overwrites
  }).catch((e) => { console.error('[bot] ticket create:', e.message); return null; });

  if (!channel) {
    return interaction.reply({ content: 'Не удалось создать тикет-канал. Проверь права бота (Управление каналами) и категорию.', ephemeral: true });
  }

  await db.openTicket(guild.id, channel.id, interaction.user.id);

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Закрыть тикет').setStyle(ButtonStyle.Danger).setEmoji('🔒')
  );
  const embed = new EmbedBuilder().setTitle('Тикет открыт').setDescription(cfg.welcomeMessage).setColor(0x5865f2);

  await channel.send({
    content: `${interaction.user}${cfg.supportRoleId ? ` <@&${cfg.supportRoleId}>` : ''}`,
    embeds: [embed],
    components: [closeRow]
  });

  await interaction.reply({ content: `Тикет создан: ${channel}`, ephemeral: true });
}

async function closeTicket(interaction) {
  const channel = interaction.channel;
  const settings = await db.getSettings(interaction.guild.id);
  await db.closeTicket(channel.id);
  await interaction.reply({ content: settings.tickets.closeMessage || 'Тикет закрывается через 5 секунд...' });
  setTimeout(() => channel.delete().catch(() => {}), 5000);
}
