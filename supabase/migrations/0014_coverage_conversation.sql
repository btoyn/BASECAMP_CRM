-- A third clock, for the tiers where a touch has to have been two-way.
--
-- `last_personal_touch_at` already drops campaign blasts. That is the right bar
-- for C and D, where the point is that they heard from him. It is the wrong bar
-- for A and B: an email he sent into silence would mark an active relationship
-- as covered, and the list of people to call would go green exactly as it went
-- quiet. `last_conversation_at` counts only what someone else took part in.
--
-- The set mirrors CONVERSATION_TYPES in src/lib/tiers.ts. If one moves, move
-- the other.
drop view lender_coverage;

create view lender_coverage
with (security_invoker = true) as
select
  l.id as lender_id,
  l.user_id,
  greatest(
    (select max(a.occurred_at) from activities a
      where a.lender_id = l.id and a.deleted_at is null and a.counts_for_coverage),
    (select max(m.start_at) from meetings m
       join meeting_attendees ma on ma.meeting_id = m.id
      where ma.lender_id = l.id and m.deleted_at is null
        and m.status = 'confirmed' and m.start_at <= now())
  ) as last_visible_touch_at,
  greatest(
    (select max(a.occurred_at) from activities a
      where a.lender_id = l.id and a.deleted_at is null and a.counts_for_coverage
        and a.activity_type <> 'campaign_email'),
    (select max(m.start_at) from meetings m
       join meeting_attendees ma on ma.meeting_id = m.id
      where ma.lender_id = l.id and m.deleted_at is null
        and m.status = 'confirmed' and m.start_at <= now())
  ) as last_personal_touch_at,
  greatest(
    (select max(a.occurred_at) from activities a
      where a.lender_id = l.id and a.deleted_at is null and a.counts_for_coverage
        and a.activity_type in (
          'incoming_email','text','call','lunch','breakfast','golf',
          'office_visit','pop_in','general_meeting','deal_conversation','sba_question'
        )),
    (select max(m.start_at) from meetings m
       join meeting_attendees ma on ma.meeting_id = m.id
      where ma.lender_id = l.id and m.deleted_at is null
        and m.status = 'confirmed' and m.start_at <= now())
  ) as last_conversation_at,
  exists (
    select 1 from meetings m
      join meeting_attendees ma on ma.meeting_id = m.id
     where ma.lender_id = l.id and m.deleted_at is null
       and m.status = 'confirmed' and m.start_at > now()
  ) as has_confirmed_future_meeting
from lenders l
where l.deleted_at is null;
