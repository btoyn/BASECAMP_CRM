-- Basecamp — Spheres and the look pipeline
--
-- Two navigation ideas replace five screens.
--
-- Spheres is one list of saved views over the lender table: the three tiers
-- first, then the filters that used to be a row of chips above Lenders. Tiers
-- already exist on the lender record (`relationship_tier`, A/B/C/unassigned),
-- so nothing is added here for them — what changed is that a tier now carries a
-- contact cadence (A fortnightly, B monthly, C quarterly), and that lives in
-- `lib/tiers.ts` as a pure constant rather than a column, because it is a rule
-- and not a per-lender fact.
--
-- Pipeline turns Looks into a three-column board, which needs a column to put a
-- card in.

-- ---------------------------------------------------------------------------
-- opportunities.look_status: which column a look sits in.
-- ---------------------------------------------------------------------------
-- `stage` stays as it is. It carries the longer deal vocabulary this table was
-- built with and is still what closes the follow-up clock. The board needs
-- something narrower and explicit: "followed up" is a place he drags a card to,
-- not something to infer from an attempt counter that also ticks for an
-- unanswered voicemail.
alter table opportunities
  add column look_status text not null default 'new'
  check (look_status in ('new', 'followed_up', 'became_loan', 'went_nowhere'));

-- Existing looks land in the column they already belong in.
update opportunities set look_status = case
  when stage = 'handed_off' then 'became_loan'
  when stage in ('dormant', 'closed_no_handoff') then 'went_nowhere'
  when follow_up_attempt_count > 0 then 'followed_up'
  else 'new'
end;

create index opportunities_look_status_idx
  on opportunities (user_id, look_status)
  where deleted_at is null;

comment on column opportunities.look_status is
  'Which Pipeline column this look sits in. `stage` still drives the follow-up clock.';
