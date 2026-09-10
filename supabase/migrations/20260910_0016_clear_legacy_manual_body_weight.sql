begin;

update public.goat_strength_profile
set body_weight_kg = null,
    updated_at = now()
where body_weight_measured_on is null
  and body_weight_kg is not null;

commit;
