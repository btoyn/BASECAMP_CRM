-- SBA approval is the finish line, not closing.
--
-- Once a loan is approved it goes to the closing department and stops being
-- his job. The old value named a handoff he doesn't own; the new one names the
-- thing he was actually working towards. Nothing had used the old value yet.
alter table active_loans drop constraint active_loans_closing_outcome_check;

update active_loans set closing_outcome = 'sba_approved'
where closing_outcome = 'sent_to_closing';

alter table active_loans add constraint active_loans_closing_outcome_check
  check (closing_outcome = any (array['sba_approved','did_not_happen']));
