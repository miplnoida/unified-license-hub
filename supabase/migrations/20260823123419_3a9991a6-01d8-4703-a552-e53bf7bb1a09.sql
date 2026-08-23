-- Maker-checker integrity: the approver of an escalated entity resolution case
-- may never be the officer who recommended it, even when one identity holds
-- both entity_resolution.resolve and .approve.
create or replace function public.trg_entity_resolution_maker_checker()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
BEGIN
  IF NEW.approved_by IS NOT NULL
     AND NEW.recommended_by IS NOT NULL
     AND NEW.approved_by = NEW.recommended_by THEN
    RAISE EXCEPTION 'Maker-checker violation: the recommending officer cannot approve the same entity resolution case'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.supervisor_decided_by IS NOT NULL
     AND NEW.recommended_by IS NOT NULL
     AND NEW.supervisor_decided_by = NEW.recommended_by THEN
    RAISE EXCEPTION 'Maker-checker violation: the recommending officer cannot record the supervisory decision'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

drop trigger if exists entity_resolution_maker_checker on public.entity_resolution_cases;
create trigger entity_resolution_maker_checker
  before insert or update on public.entity_resolution_cases
  for each row execute function public.trg_entity_resolution_maker_checker();