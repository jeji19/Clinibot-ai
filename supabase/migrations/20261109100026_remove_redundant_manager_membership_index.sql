-- The unique index now enforces the same user_id lookup efficiently.
-- Remove the older non-unique index to avoid maintaining two equivalent indexes.
drop index if exists public.clinic_members_user_id_idx;
