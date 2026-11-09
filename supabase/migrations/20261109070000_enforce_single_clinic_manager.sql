-- The manager dashboard and API resolve exactly one clinic per manager.
-- Enforce this invariant in the database as well as in the Super Admin API,
-- preventing concurrent assignments from creating an unusable multi-clinic account.
create unique index if not exists clinic_members_one_clinic_per_user_idx
  on public.clinic_members (user_id);
