-- A fourth tier: cold, but worth a note twice a year so they know I exist.
-- The other three keep their meaning; D takes the people who were previously
-- being filed under C for want of anywhere colder.
alter table lenders drop constraint lenders_relationship_tier_check;
alter table lenders add constraint lenders_relationship_tier_check
  check (relationship_tier = any (array['A','B','C','D','unassigned']));
