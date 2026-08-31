-- =====================================================================
-- DEMO ENVIRONMENT: DEMO_SLU_FSRA_2026 — CLEANUP
-- Removes ONLY the records created by the two demo seed scripts
-- (fixed 5c1a…/5c1b…/5c1c…/5c1d…/5c1f…/5c21…/5c30…/5c31… UUID families).
-- Pre-existing certification data is untouched. Audit rows are deliberately
-- NOT deleted: audit evidence is append-only by design.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF public.is_production_environment() THEN
    RAISE EXCEPTION 'DEMO cleanup refused: production environment';
  END IF;
END $$;

-- Supervision thread (stage 3)
-- return_threshold_breaches, its acknowledgements and prudential_action_events are
-- append-only regulatory evidence. Breach detections and their actions are therefore
-- retained; only their demo linkage is neutralised so no demo narrative survives.
DELETE FROM public.return_threshold_breach_acknowledgements WHERE breach_id::text LIKE '5c30%';
UPDATE public.prudential_actions
   SET status = 'cancelled', title = '[Retired demonstration record] ' || title
 WHERE id::text LIKE '5c31%' AND status <> 'cancelled';

-- Group, ownership, relationships, addresses, entities (stage 1)
DELETE FROM public.financial_group_members WHERE group_id::text LIKE '5c21%';
DELETE FROM public.financial_groups WHERE id::text LIKE '5c21%';
DELETE FROM public.ownership_interests WHERE id::text LIKE '5c1f%';
DELETE FROM public.party_relationships
 WHERE from_party_id::text LIKE '5c1%' OR to_party_id::text LIKE '5c1%';
DELETE FROM public.address_usages WHERE subject_id::text LIKE '5c1%';
DELETE FROM public.entity_appointments WHERE entity_id::text LIKE '5c1a%';
DELETE FROM public.licensees WHERE id::text LIKE '5c1a%';
DELETE FROM public.persons WHERE party_id::text LIKE '5c1c%';
DELETE FROM public.organizations WHERE party_id::text LIKE '5c1%';
DELETE FROM public.parties WHERE id::text LIKE '5c1b%' OR id::text LIKE '5c1c%' OR id::text LIKE '5c1d%';

COMMIT;
