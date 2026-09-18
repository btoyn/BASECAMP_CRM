-- Basecamp — the Microsoft 365 connection
--
-- One row per user, holding the OAuth tokens that let the app see a real
-- calendar instead of guessing from its own records.
--
-- Everything here is dormant until an Entra app registration exists and the
-- user presses Connect in Settings. Without a row, every caller falls back to
-- exactly what the app did before: availability windows checked against the
-- meetings the CRM already knows about, and email handed to Outlook through a
-- mailto link.
--
-- Tokens are encrypted before they are written (AES-256-GCM, key in
-- MICROSOFT_TOKEN_ENCRYPTION_KEY). RLS already stops one user reading
-- another's row; the encryption is for the other threat — a database dump
-- should not hand someone a live mailbox.

create table microsoft_connections (
  id uuid primary key default gen_random_uuid(),
  -- One Microsoft account per user. Reconnecting replaces the row rather than
  -- adding a second, so there is never a question of which token is current.
  user_id uuid not null unique references users (id) on delete cascade,

  -- Whose mailbox this is, so Settings can show it and a wrong-account
  -- connection is obvious at a glance.
  account_email text,
  microsoft_user_id text,

  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  access_token_expires_at timestamptz not null,

  -- What Microsoft actually granted, which can be less than what was asked
  -- for. The screens read this to say which half works.
  scopes text[] not null default '{}',

  connected_at timestamptz not null default now(),

  -- Set when Microsoft stops accepting the refresh token — consent revoked, a
  -- password change, a policy. Recorded rather than deleted so the UI can say
  -- "reconnect" and why, instead of quietly behaving like it was never
  -- connected.
  invalidated_at timestamptz,
  invalidated_reason text,

  updated_at timestamptz not null default now()
);

create index microsoft_connections_user_idx on microsoft_connections (user_id);

comment on table microsoft_connections is
  'OAuth tokens for Microsoft Graph, one row per user. Tokens are encrypted at rest.';
comment on column microsoft_connections.scopes is
  'Scopes Microsoft granted. Less than requested is possible; screens degrade per scope.';
comment on column microsoft_connections.invalidated_at is
  'Set when the refresh token stops working, so the user is told to reconnect.';

-- ---------------------------------------------------------------------------
-- RLS — the same owner-only policies every other table gets (§7).
-- ---------------------------------------------------------------------------
alter table microsoft_connections enable row level security;

create policy microsoft_connections_select_own on microsoft_connections
  for select using (user_id = (select auth.uid()));
create policy microsoft_connections_insert_own on microsoft_connections
  for insert with check (user_id = (select auth.uid()));
create policy microsoft_connections_update_own on microsoft_connections
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy microsoft_connections_delete_own on microsoft_connections
  for delete using (user_id = (select auth.uid()));
