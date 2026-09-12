update public.goat_strength_profile
set height_cm = 190,
    updated_at = now();

alter table public.goat_strength_profile
  alter column height_cm set default 190,
  alter column height_cm set not null;

alter table public.goat_strength_profile
  drop constraint if exists goat_strength_profile_height_static;

alter table public.goat_strength_profile
  add constraint goat_strength_profile_height_static
  check (height_cm = 190);

drop policy if exists "Authorized user can write goat strength profile"
  on public.goat_strength_profile;

revoke insert, update, delete on table public.goat_strength_profile from authenticated;
grant select on table public.goat_strength_profile to authenticated;

comment on column public.goat_strength_profile.height_cm is
  'Static canonical height for the Kleos owner. Deterministically fixed at 190 cm; not user-editable.';
