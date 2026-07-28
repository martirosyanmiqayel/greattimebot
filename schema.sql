-- ============================================================
-- Схема для Supabase (Postgres).
-- Запусти этот SQL один раз: Supabase → SQL Editor → New query → Run.
-- ============================================================

create table if not exists guild_settings (
  guild_id   text primary key,
  data       jsonb  not null default '{}'::jsonb,
  updated_at bigint not null default 0
);

create table if not exists warnings (
  id         bigserial primary key,
  guild_id   text   not null,
  user_id    text   not null,
  moderator  text   not null,
  reason     text,
  created_at bigint not null
);
create index if not exists warnings_guild_user_idx on warnings (guild_id, user_id);

create table if not exists tickets (
  id         bigserial primary key,
  guild_id   text   not null,
  channel_id text   not null,
  user_id    text   not null,
  status     text   not null default 'open',
  created_at bigint not null,
  closed_at  bigint
);
create index if not exists tickets_open_idx on tickets (guild_id, user_id, status);

create table if not exists reaction_roles (
  id         bigserial primary key,
  guild_id   text not null,
  message_id text not null,
  emoji      text not null,
  role_id    text not null
);
create index if not exists reaction_roles_msg_idx on reaction_roles (message_id, emoji);

-- ============================================================
-- XP-система
-- ============================================================
create table if not exists xp (
  guild_id   text   not null,
  user_id    text   not null,
  xp         bigint not null default 0,
  level      int    not null default 0,
  updated_at bigint not null default 0,
  primary key (guild_id, user_id)
);
create index if not exists xp_leaderboard_idx on xp (guild_id, xp desc);

-- История изменений XP (для аудита: кто и за что начислил/снял).
create table if not exists xp_history (
  id         bigserial primary key,
  guild_id   text   not null,
  user_id    text   not null,
  delta      bigint not null,
  reason     text,
  actor      text,
  created_at bigint not null
);
create index if not exists xp_history_idx on xp_history (guild_id, user_id, created_at desc);

-- ============================================================
-- Whitelist (для Anti-Crash). Люди отсюда игнорируются системой.
-- ============================================================
create table if not exists whitelist (
  guild_id   text   not null,
  user_id    text   not null,
  added_by   text,
  created_at bigint not null,
  primary key (guild_id, user_id)
);

-- ============================================================
-- История наказаний (баны / муты / кики / варны-как-действие).
-- Используется !history, !checkmute, дашбордом.
-- ============================================================
create table if not exists mod_actions (
  id          bigserial primary key,
  guild_id    text   not null,
  type        text   not null,          -- ban | mute | kick | unmute | unban | warn
  target_id   text   not null,
  moderator   text   not null,
  reason      text,
  duration_ms bigint,                    -- null = перманент / не применимо
  expires_at  bigint,                    -- когда истекает (для бана/мута), null = не истекает
  active      boolean not null default true,
  created_at  bigint not null
);
create index if not exists mod_actions_idx on mod_actions (guild_id, target_id, created_at desc);
create index if not exists mod_actions_active_idx on mod_actions (guild_id, type, active);

-- ============================================================
-- Полный лог действий (для дашборда / экспорта / !history-сводок).
-- ============================================================
create table if not exists action_logs (
  id         bigserial primary key,
  guild_id   text   not null,
  type       text   not null,           -- channelDelete, roleUpdate, anticrash, ...
  actor_id   text,
  target_id  text,
  detail     jsonb  not null default '{}'::jsonb,
  created_at bigint not null
);
create index if not exists action_logs_idx on action_logs (guild_id, created_at desc);
create index if not exists action_logs_type_idx on action_logs (guild_id, type, created_at desc);

-- ============================================================
-- Резервные копии структуры сервера (snapshot каналов/ролей/категорий).
-- ============================================================
create table if not exists backups (
  id         bigserial primary key,
  guild_id   text   not null,
  kind       text   not null default 'auto',   -- auto | manual
  data       jsonb  not null,
  created_at bigint not null
);
create index if not exists backups_idx on backups (guild_id, created_at desc);

-- ============================================================
-- Кастомные команды: name -> текст ответа (на сервер).
-- ============================================================
create table if not exists custom_commands (
  guild_id   text   not null,
  name       text   not null,
  response   text   not null,
  created_by text,
  created_at bigint not null,
  primary key (guild_id, name)
);

-- ============================================================
-- RLS: доступ идёт только через service_role с сервера (бот/дашборд),
-- который RLS обходит. Поэтому включаем RLS и НЕ создаём публичных политик —
-- так anon-ключ не сможет читать/писать эти таблицы напрямую.
-- ============================================================
alter table guild_settings enable row level security;
alter table warnings       enable row level security;
alter table tickets        enable row level security;
alter table reaction_roles enable row level security;
alter table xp             enable row level security;
alter table xp_history     enable row level security;
alter table whitelist      enable row level security;
alter table mod_actions    enable row level security;
alter table action_logs    enable row level security;
alter table backups        enable row level security;
alter table custom_commands enable row level security;
