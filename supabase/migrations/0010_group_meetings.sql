-- Lender CRM — group meeting proposals
--
-- Brandon rarely meets one lender at a time: he takes a bank's team to lunch,
-- or three of seven to golf. This adds a group path beside the single-lender
-- flow, which is untouched and still the common case.
--
-- Two things had to change. A group proposal has no single lender, so
-- meeting_proposals.lender_id becomes optional and the institution takes its
-- place. And each attendee answers separately, so the reply can no longer live
-- as one set of columns on the proposal row — that is the new table below.

-- ---------------------------------------------------------------------------
-- meeting_proposals: one lender, or one institution's people.
-- ---------------------------------------------------------------------------
alter table meeting_proposals alter column lender_id drop not null;

-- Who the group is drawn from. Also what the email calls them ("the team at
-- Zions"), and how the picker knows which lenders to offer.
alter table meeting_proposals
  add column institution_id uuid references institutions (id) on delete set null;

-- Exactly the two shapes that exist: a lender, or a bank. Neither is not a
-- proposal, and a row that lost both would be unreachable from every screen.
alter table meeting_proposals
  add constraint meeting_proposals_subject_present
  check (lender_id is not null or institution_id is not null);

create index meeting_proposals_institution_idx
  on meeting_proposals (institution_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- meeting_proposal_attendees: who was asked, and what each of them said.
-- ---------------------------------------------------------------------------
-- Not meeting_attendees: that hangs off a meetings row, and most proposals
-- never become a meeting. Replies arrive before there is anything to attach
-- them to.
create table meeting_proposal_attendees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  proposal_id uuid not null references meeting_proposals (id) on delete cascade,
  lender_id uuid not null references lenders (id) on delete cascade,

  -- Their reply as it arrived, kept for the same reason the single flow keeps
  -- it: so he can read it himself when the reader isn't sure.
  reply_text text,
  replied_at timestamptz,

  -- What the reply reader made of the reply as a whole. Recorded for the
  -- record; the per-date verdicts below are what the tally counts.
  reply_intent text check (reply_intent in ('accepted', 'declined', 'countered', 'unclear')),
  countered_slot timestamptz,

  -- One verdict per offered date, positionally aligned with
  -- meeting_proposals.offered_slots. An array rather than a second table
  -- because there are at most three dates and they are already an array — a
  -- row per (attendee, date) would be a join for nothing. 'unclear' is a real
  -- answer here, not a missing one: it means he has to read it himself.
  slot_verdicts text[] not null default '{}',
  constraint slot_verdicts_known
    check (slot_verdicts <@ array['yes', 'no', 'unclear']::text[]),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Nobody is invited to the same meeting twice.
  unique (proposal_id, lender_id)
);

create index mpa_proposal_idx on meeting_proposal_attendees (proposal_id);
create index mpa_lender_idx on meeting_proposal_attendees (lender_id);

-- ---------------------------------------------------------------------------
-- RLS — the same owner-only policies every other table gets (§7).
-- ---------------------------------------------------------------------------
alter table meeting_proposal_attendees enable row level security;

create policy meeting_proposal_attendees_select_own on meeting_proposal_attendees
  for select using (user_id = (select auth.uid()));
create policy meeting_proposal_attendees_insert_own on meeting_proposal_attendees
  for insert with check (user_id = (select auth.uid()));
create policy meeting_proposal_attendees_update_own on meeting_proposal_attendees
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy meeting_proposal_attendees_delete_own on meeting_proposal_attendees
  for delete using (user_id = (select auth.uid()));
