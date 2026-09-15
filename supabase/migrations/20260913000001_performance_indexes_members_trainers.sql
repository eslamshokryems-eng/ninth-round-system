-- Performance indexes for the Members and Trainers pages. Applied
-- manually in the Supabase SQL editor on 2026-09-13; this file just
-- keeps the migration history in sync with the live database.
--
-- memberships.coach_id had no index at all — every Trainers page query
-- (packages/reception/infrastructure/supabase-trainer-repository.ts)
-- filters directly on it, a query pattern that didn't exist before that
-- feature.
create index if not exists idx_memberships_coach on memberships (coach_id);

-- members.full_name only had a GIN trigram index (idx_members_full_name_trgm),
-- which accelerates ILIKE search but cannot satisfy a plain ORDER BY. The
-- Members page's default (no search typed) view orders by full_name —
-- this adds the plain btree index that ordering needs.
create index if not exists idx_members_full_name on members (full_name);
