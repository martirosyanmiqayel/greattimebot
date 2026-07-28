'use strict';

const { PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const { fetchUser } = require('../../shared/resolve');

const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

module.exports = [
  {
    name: 'ping',
    description: 'Задержка бота',
    async run(ctx) {
      await ctx.reply(`🏓 Понг! WS: **${Math.round(ctx.client.ws.ping)} мс**.`);
    }
  },
  {
    name: 'avatar',
    aliases: ['av'],
    description: 'Аватар пользователя: !avatar [user]',
    async run(ctx) {
      const user = ctx.args[0] ? await fetchUser(ctx.client, ctx.args[0]) : ctx.author;
      if (!user) return ctx.error('Пользователь не найден.');
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(`Аватар ${user.tag}`)
        .setImage(user.displayAvatarURL({ size: 512 }));
      await ctx.reply({ embeds: [embed] });
    }
  },
  {
    name: 'userinfo',
    aliases: ['ui', 'whois'],
    description: 'Инфо об участнике: !userinfo [user]',
    async run(ctx) {
      const user = ctx.args[0] ? await fetchUser(ctx.client, ctx.args[0]) : ctx.author;
      if (!user) return ctx.error('Пользователь не найден.');
      const member = await ctx.guild.members.fetch(user.id).catch(() => null);
      const embed = new EmbedBuilder().setColor(0x5865f2)
        .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
        .addFields(
          { name: 'ID', value: user.id, inline: true },
          { name: 'Аккаунт создан', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
        );
      if (member) {
        if (member.joinedTimestamp) embed.addFields({ name: 'Зашёл на сервер', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true });
        const roles = member.roles.cache.filter((r) => r.id !== ctx.guild.id).map((r) => `<@&${r.id}>`).slice(0, 15);
        embed.addFields({ name: `Роли (${roles.length})`, value: roles.join(' ') || '—' });
      }
      await ctx.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }
  },
  {
    name: 'serverinfo',
    aliases: ['si'],
    description: 'Информация о сервере',
    async run(ctx) {
      const g = ctx.guild;
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(g.name)
        .setThumbnail(g.iconURL({ size: 256 }) || null)
        .addFields(
          { name: 'Участников', value: `${g.memberCount}`, inline: true },
          { name: 'Каналов', value: `${g.channels.cache.size}`, inline: true },
          { name: 'Ролей', value: `${g.roles.cache.size}`, inline: true },
          { name: 'Владелец', value: `<@${g.ownerId}>`, inline: true },
          { name: 'Создан', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
          { name: 'Буст', value: `${g.premiumSubscriptionCount || 0} (ур. ${g.premiumTier})`, inline: true }
        );
      await ctx.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }
  },
  {
    name: 'membercount',
    aliases: ['members', 'mc'],
    description: 'Количество участников',
    async run(ctx) {
      await ctx.reply(`👥 На сервере **${ctx.guild.memberCount}** участников.`);
    }
  },
  {
    name: 'say',
    description: 'Сказать от имени бота: !say <текст>',
    permission: PermissionFlagsBits.ManageMessages,
    async run(ctx) {
      const text = ctx.args.join(' ');
      if (!text) return ctx.error('Использование: `!say <текст>`');
      await ctx.message.delete().catch(() => {});
      await ctx.channel.send({ content: text.slice(0, 2000), allowedMentions: { parse: [] } });
    }
  },
  {
    name: 'embed',
    description: 'Отправить embed: !embed Заголовок | Описание',
    permission: PermissionFlagsBits.ManageMessages,
    async run(ctx) {
      const [title, ...rest] = ctx.args.join(' ').split('|');
      if (!title) return ctx.error('Использование: `!embed Заголовок | Описание`');
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(title.trim().slice(0, 256));
      const desc = rest.join('|').trim();
      if (desc) embed.setDescription(desc.slice(0, 4000));
      await ctx.message.delete().catch(() => {});
      await ctx.channel.send({ embeds: [embed] });
    }
  },
  {
    name: 'poll',
    description: 'Опрос: !poll Вопрос? | вар1 | вар2 ...',
    async run(ctx) {
      const parts = ctx.args.join(' ').split('|').map((s) => s.trim()).filter(Boolean);
      if (!parts.length) return ctx.error('Использование: `!poll Вопрос? | вариант1 | вариант2`');
      const question = parts[0];
      const options = parts.slice(1, 11);
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('📊 ' + question.slice(0, 256))
        .setFooter({ text: `Опрос от ${ctx.author.tag}` });
      if (options.length) embed.setDescription(options.map((o, i) => `${NUM[i]} ${o}`).join('\n'));
      const msg = await ctx.channel.send({ embeds: [embed] });
      if (options.length) { for (let i = 0; i < options.length; i++) await msg.react(NUM[i]).catch(() => {}); }
      else { await msg.react('👍').catch(() => {}); await msg.react('👎').catch(() => {}); }
      await ctx.message.delete().catch(() => {});
    }
  }
];
