-- =====================================================================
-- F8A-B1 — Canonical relationship foundation / legacy consolidation
-- =====================================================================

-- ---------------------------------------------------------------
-- 1. Party kind catalogue
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.party_kinds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  is_natural_person boolean NOT NULL DEFAULT false,
  is_legal_arrangement boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  is_system boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.party_kinds TO authenticated;
GRANT ALL ON public.party_kinds TO service_role;
ALTER TABLE public.party_kinds ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='party_kinds' AND policyname='party_kinds_read_internal') THEN
    CREATE POLICY party_kinds_read_internal ON public.party_kinds
      FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

INSERT INTO public.party_kinds (key, label, description, is_natural_person, is_legal_arrangement, sort_order)
VALUES
  ('PERSON','Natural person','Individual human being.',true,false,10),
  ('ORGANIZATION','Organization','Body corporate or other legal person.',false,false,20),
  ('TRUST','Trust','Trust arrangement.',false,true,30),
  ('FOUNDATION','Foundation','Foundation arrangement.',false,true,40),
  ('PARTNERSHIP','Partnership','Partnership arrangement.',false,true,50),
  ('OTHER_LEGAL_ARRANGEMENT','Other legal arrangement','Any other legal arrangement not otherwise catalogued.',false,true,60)
ON CONFLICT (key) DO NOTHING;

-- Existing PERSON/ORGANIZATION semantics unchanged; catalogue constraint only.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='parties_party_kind_catalogue_fk') THEN
    ALTER TABLE public.parties
      ADD CONSTRAINT parties_party_kind_catalogue_fk
      FOREIGN KEY (party_kind) REFERENCES public.party_kinds(key)
      ON UPDATE CASCADE NOT VALID;
    ALTER TABLE public.parties VALIDATE CONSTRAINT parties_party_kind_catalogue_fk;
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 2. Relationship catalogue semantics (configuration-driven)
-- ---------------------------------------------------------------
ALTER TABLE public.relationship_types
  ADD COLUMN IF NOT EXISTS is_hierarchical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_symmetric boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allows_self boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allows_structural_entry boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_ownership_authority boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.relationship_types.allows_structural_entry IS
  'F8A-B1: false = this type may not be written to party_relationships. Ownership-like types are non-authoritative presentation/compatibility rows only; ownership_interests is the sole ownership ledger.';

UPDATE public.relationship_types SET is_hierarchical = true
 WHERE key IN ('parent_of','subsidiary_of','branch_of');
UPDATE public.relationship_types SET is_symmetric = true
 WHERE key IN ('affiliate_of');
-- Ownership-like catalogue entries are retained but are NOT an ownership ledger.
UPDATE public.relationship_types
   SET allows_structural_entry = false,
       is_ownership_authority = false,
       description = COALESCE(description,'') 
 WHERE is_ownership = true;

INSERT INTO public.relationship_types (key,label,description,category,is_ownership,is_group,sort_order,is_system,is_active,is_hierarchical,is_symmetric,allows_structural_entry)
VALUES
  ('trustee_of','Trustee Of','Acts as trustee of a trust or similar arrangement.','arrangement',false,false,110,true,true,false,false,true),
  ('settlor_of','Settlor Of','Settled property on a trust or similar arrangement.','arrangement',false,false,120,true,true,false,false,true),
  ('beneficiary_of','Beneficiary Of','Beneficiary of a trust, foundation or similar arrangement.','arrangement',false,false,130,true,true,false,false,true),
  ('partner_of','Partner Of','Partner in a partnership.','arrangement',false,false,140,true,true,false,true,true)
ON CONFLICT (key) DO NOTHING;

-- Symmetric arrangement type is its own inverse.
UPDATE public.relationship_types rt
   SET inverse_key = 'partner_of', inverse_relationship_type_id = rt.id
 WHERE rt.key = 'partner_of' AND rt.inverse_relationship_type_id IS NULL;

-- ---------------------------------------------------------------
-- 3. Role catalogue extension (no existing key changed)
-- ---------------------------------------------------------------
INSERT INTO public.role_types (key,label,description,category,is_governance,requires_fit_and_proper,sort_order,is_system,is_active)
VALUES
  ('external_auditor','External Auditor','Appointed external auditor.','assurance',false,false,210,true,true),
  ('trustee','Trustee','Trustee of a regulated arrangement.','arrangement',false,false,220,true,true),
  ('partner','Partner','Partner of a regulated partnership.','arrangement',false,false,230,true,true),
  ('key_function_holder','Key Function Holder','Generic key function holder.','key_function',false,false,240,true,true)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------
-- 4. Ownership validation (server boundary)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ownership_interests_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE v_owner_party uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.parties WHERE id = NEW.owner_party_id) THEN
    RAISE EXCEPTION 'Ownership owner_party_id % is not a canonical party', NEW.owner_party_id;
  END IF;
  SELECT party_id INTO v_owner_party FROM public.licensees WHERE id = NEW.owned_entity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ownership owned_entity_id % is not a regulated entity', NEW.owned_entity_id;
  END IF;
  IF v_owner_party IS NOT NULL AND v_owner_party = NEW.owner_party_id THEN
    RAISE EXCEPTION 'Self-ownership is not valid: owner party equals the owned entity party';
  END IF;
  IF NEW.economic_interest_percentage IS NOT NULL
     AND (NEW.economic_interest_percentage < 0 OR NEW.economic_interest_percentage > 100) THEN
    RAISE EXCEPTION 'economic_interest_percentage must be between 0 and 100';
  END IF;
  IF NEW.voting_rights_percentage IS NOT NULL
     AND (NEW.voting_rights_percentage < 0 OR NEW.voting_rights_percentage > 100) THEN
    RAISE EXCEPTION 'voting_rights_percentage must be between 0 and 100';
  END IF;
  IF NEW.beneficial_interest_percentage IS NOT NULL
     AND (NEW.beneficial_interest_percentage < 0 OR NEW.beneficial_interest_percentage > 100) THEN
    RAISE EXCEPTION 'beneficial_interest_percentage must be between 0 and 100';
  END IF;
  IF NEW.shares_held IS NOT NULL AND NEW.total_shares IS NOT NULL
     AND NEW.shares_held > NEW.total_shares THEN
    RAISE EXCEPTION 'shares_held cannot exceed total_shares';
  END IF;
  IF NEW.effective_to IS NOT NULL AND NEW.effective_from IS NOT NULL
     AND NEW.effective_to < NEW.effective_from THEN
    RAISE EXCEPTION 'effective_from must be on or before effective_to';
  END IF;
  IF NEW.ownership_type_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.ownership_types WHERE id = NEW.ownership_type_id AND is_active) THEN
    RAISE EXCEPTION 'ownership_type_id must reference an active ownership type';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_ownership_interests_validate ON public.ownership_interests;
CREATE TRIGGER trg_ownership_interests_validate
  BEFORE INSERT OR UPDATE ON public.ownership_interests
  FOR EACH ROW EXECUTE FUNCTION public.ownership_interests_validate();

-- ---------------------------------------------------------------
-- 5. Party relationship governance
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.party_relationships_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  rt record;
  v_cycle boolean;
BEGIN
  SELECT * INTO rt FROM public.relationship_types WHERE id = NEW.relationship_type_id;
  IF NOT FOUND OR NOT rt.is_active THEN
    RAISE EXCEPTION 'relationship_type_id must reference an active relationship type';
  END IF;
  IF NOT rt.allows_structural_entry THEN
    RAISE EXCEPTION 'Relationship type % is not permitted as a structural relationship fact; ownership belongs to ownership_interests', rt.key;
  END IF;
  IF NEW.source_party_id = NEW.target_party_id AND NOT rt.allows_self THEN
    RAISE EXCEPTION 'Self relationship is not permitted for relationship type %', rt.key;
  END IF;
  IF NEW.effective_to IS NOT NULL AND NEW.effective_from IS NOT NULL
     AND NEW.effective_to < NEW.effective_from THEN
    RAISE EXCEPTION 'effective_from must be on or before effective_to';
  END IF;

  -- Duplicate overlapping semantic edge
  IF EXISTS (
    SELECT 1 FROM public.party_relationships r
    WHERE r.id <> NEW.id
      AND r.superseded_at IS NULL
      AND r.source_party_id = NEW.source_party_id
      AND r.target_party_id = NEW.target_party_id
      AND r.relationship_type_id = NEW.relationship_type_id
      AND tstzrange(r.effective_from, r.effective_to, '[)')
          && tstzrange(NEW.effective_from, NEW.effective_to, '[)')
  ) THEN
    RAISE EXCEPTION 'Duplicate overlapping relationship fact already recorded';
  END IF;

  -- Inverse duplicate: the inverse is rendered, never stored twice
  IF rt.inverse_relationship_type_id IS NOT NULL AND NOT rt.is_symmetric THEN
    IF EXISTS (
      SELECT 1 FROM public.party_relationships r
      WHERE r.id <> NEW.id
        AND r.superseded_at IS NULL
        AND r.source_party_id = NEW.target_party_id
        AND r.target_party_id = NEW.source_party_id
        AND r.relationship_type_id = rt.inverse_relationship_type_id
        AND tstzrange(r.effective_from, r.effective_to, '[)')
            && tstzrange(NEW.effective_from, NEW.effective_to, '[)')
    ) THEN
      RAISE EXCEPTION 'Inverse of this relationship is already recorded; the inverse is derived for presentation, not stored';
    END IF;
  END IF;

  -- Hierarchical cycle prohibition (legal/group hierarchy only; ownership cycles
  -- are legitimate facts and are detected, not refused, by the F8A-B2 resolver).
  IF rt.is_hierarchical THEN
    WITH RECURSIVE walk(party_id, depth) AS (
      SELECT NEW.target_party_id, 1
      UNION ALL
      SELECT r.target_party_id, w.depth + 1
      FROM public.party_relationships r
      JOIN public.relationship_types t ON t.id = r.relationship_type_id AND t.is_hierarchical
      JOIN walk w ON w.party_id = r.source_party_id
      WHERE r.superseded_at IS NULL AND r.effective_to IS NULL AND w.depth < 32
    )
    SELECT EXISTS (SELECT 1 FROM walk WHERE party_id = NEW.source_party_id) INTO v_cycle;
    IF v_cycle THEN
      RAISE EXCEPTION 'Hierarchical relationship would create an invalid group cycle';
    END IF;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_party_relationships_validate ON public.party_relationships;
CREATE TRIGGER trg_party_relationships_validate
  BEFORE INSERT OR UPDATE ON public.party_relationships
  FOR EACH ROW EXECUTE FUNCTION public.party_relationships_validate();

-- ---------------------------------------------------------------
-- 6. Governed change-set apply / withdraw + maker-checker
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entity_change_set_transition(_change_set_id uuid, _action text, _notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cs record;
  v_item record;
  v_uid uuid := auth.uid();
  v_applied int := 0;
  v_pv jsonb;
BEGIN
  SELECT * INTO v_cs FROM public.entity_change_sets WHERE id = _change_set_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Change set not found'; END IF;

  IF _action = 'submit' THEN
    PERFORM public.wb_require('entity_structure','propose', v_cs.entity_id, 'submit_structural_form');
    IF v_cs.status <> 'DRAFT' THEN RAISE EXCEPTION 'Only draft change sets can be submitted'; END IF;
    UPDATE public.entity_change_sets SET status='SUBMITTED', submitted_by=v_uid, submitted_at=now(),
      updated_at=now() WHERE id=_change_set_id;

  ELSIF _action = 'review' THEN
    PERFORM public.wb_require('entity_structure','review');
    UPDATE public.entity_change_sets SET status='RECOMMENDED', reviewed_by=v_uid, reviewed_at=now(),
      review_notes=_notes, updated_at=now() WHERE id=_change_set_id AND status IN ('SUBMITTED','UNDER_REVIEW');

  ELSIF _action = 'withdraw' THEN
    PERFORM public.wb_require('entity_structure','propose', v_cs.entity_id, 'submit_structural_form');
    IF v_cs.status IN ('APPLIED','REJECTED','WITHDRAWN') THEN
      RAISE EXCEPTION 'Change set cannot be withdrawn from status %', v_cs.status;
    END IF;
    UPDATE public.entity_change_sets SET status='WITHDRAWN', review_notes=COALESCE(_notes, review_notes),
      updated_at=now() WHERE id=_change_set_id;
    PERFORM public.create_audit_log(v_uid,'entity.change_set.withdrawn','entity_change_set',
      _change_set_id::text,NULL,jsonb_build_object('entity_id',v_cs.entity_id),NULL);

  ELSIF _action = 'approve' THEN
    PERFORM public.wb_require('entity_structure','approve');
    IF v_cs.status NOT IN ('SUBMITTED','UNDER_REVIEW','RECOMMENDED') THEN
      RAISE EXCEPTION 'Change set cannot be approved from status %', v_cs.status;
    END IF;
    -- Maker-checker: proposer may never approve their own structural change
    IF v_uid IS NOT NULL AND (v_uid = v_cs.submitted_by OR v_uid = v_cs.created_by) THEN
      RAISE EXCEPTION 'Maker-checker violation: the proposer of a structural change cannot approve it'
        USING ERRCODE = '42501';
    END IF;
    UPDATE public.entity_change_sets SET status='APPROVED', approved_by=v_uid, approved_at=now(),
      updated_at=now() WHERE id=_change_set_id;
    PERFORM public.create_audit_log(v_uid,'entity.change_set.approved','entity_change_set',
      _change_set_id::text,NULL,jsonb_build_object('entity_id',v_cs.entity_id),NULL);

  ELSIF _action = 'reject' THEN
    PERFORM public.wb_require('entity_structure','approve');
    IF v_uid IS NOT NULL AND (v_uid = v_cs.submitted_by OR v_uid = v_cs.created_by) THEN
      RAISE EXCEPTION 'Maker-checker violation: the proposer of a structural change cannot decide it'
        USING ERRCODE = '42501';
    END IF;
    UPDATE public.entity_change_sets SET status='REJECTED', rejected_by=v_uid, rejected_at=now(),
      rejection_reason=_notes, updated_at=now() WHERE id=_change_set_id;
    PERFORM public.create_audit_log(v_uid,'entity.change_set.rejected','entity_change_set',
      _change_set_id::text,NULL,jsonb_build_object('reason',_notes),NULL);

  ELSIF _action = 'apply' THEN
    PERFORM public.wb_require('entity_structure','approve');
    IF v_cs.status = 'APPLIED' THEN
      -- idempotent replay
      RETURN jsonb_build_object('success',true,'change_set_id',_change_set_id,'action','apply',
                                'applied',0,'idempotent',true);
    END IF;
    IF v_cs.status <> 'APPROVED' THEN
      RAISE EXCEPTION 'Only approved change sets can be applied (status %)', v_cs.status;
    END IF;

    FOR v_item IN
      SELECT * FROM public.entity_change_items WHERE change_set_id = _change_set_id ORDER BY sequence
    LOOP
      v_pv := COALESCE(v_item.proposed_value, '{}'::jsonb);

      IF v_item.target_table = 'ownership_interests' THEN
        INSERT INTO public.ownership_interests (
          owner_party_id, owned_entity_id, ownership_type_id, share_class_id,
          shares_held, total_shares,
          economic_interest_percentage, voting_rights_percentage, beneficial_interest_percentage,
          is_direct, is_controller, is_ubo, control_determination,
          effective_from, effective_to, approval_status, approved_by, approved_at,
          source_submission_id, source_form_version_id, source_change_set_id, recorded_at)
        VALUES (
          (v_pv->>'owner_party_id')::uuid,
          COALESCE(NULLIF(v_pv->>'owned_entity_id','')::uuid, v_cs.entity_id),
          NULLIF(v_pv->>'ownership_type_id','')::uuid,
          NULLIF(v_pv->>'share_class_id','')::uuid,
          NULLIF(v_pv->>'shares_held','')::numeric,
          NULLIF(v_pv->>'total_shares','')::numeric,
          NULLIF(v_pv->>'economic_interest_percentage','')::numeric,
          NULLIF(v_pv->>'voting_rights_percentage','')::numeric,
          NULLIF(v_pv->>'beneficial_interest_percentage','')::numeric,
          COALESCE((v_pv->>'is_direct')::boolean, true),
          COALESCE((v_pv->>'is_controller')::boolean, false),
          COALESCE((v_pv->>'is_ubo')::boolean, false),
          NULLIF(v_pv->>'control_determination',''),
          COALESCE(NULLIF(v_pv->>'effective_from','')::timestamptz, v_item.effective_from,
                   COALESCE(v_cs.effective_date::timestamptz, now())),
          COALESCE(NULLIF(v_pv->>'effective_to','')::timestamptz, v_item.effective_to),
          'APPROVED', v_cs.approved_by, v_cs.approved_at,
          v_cs.source_submission_id, v_cs.source_form_version_id, v_cs.id, now());
        v_applied := v_applied + 1;

      ELSIF v_item.target_table = 'party_relationships' THEN
        INSERT INTO public.party_relationships (
          source_party_id, target_party_id, relationship_type_id, entity_id,
          effective_from, effective_to, status, notes,
          source_submission_id, source_form_version_id, source_change_set_id, recorded_at)
        VALUES (
          (v_pv->>'source_party_id')::uuid,
          (v_pv->>'target_party_id')::uuid,
          (v_pv->>'relationship_type_id')::uuid,
          COALESCE(NULLIF(v_pv->>'entity_id','')::uuid, v_cs.entity_id),
          COALESCE(NULLIF(v_pv->>'effective_from','')::timestamptz, v_item.effective_from,
                   COALESCE(v_cs.effective_date::timestamptz, now())),
          COALESCE(NULLIF(v_pv->>'effective_to','')::timestamptz, v_item.effective_to),
          COALESCE(NULLIF(v_pv->>'status',''), 'ACTIVE'),
          NULLIF(v_pv->>'notes',''),
          v_cs.source_submission_id, v_cs.source_form_version_id, v_cs.id, now());
        v_applied := v_applied + 1;

      ELSIF v_item.target_table = 'entity_appointments' THEN
        INSERT INTO public.entity_appointments (
          entity_id, person_party_id, role_type_id, appointment_date,
          effective_from, effective_to, is_executive, status, regulatory_approval_status,
          fp_individual_id, source_submission_id, source_form_version_id, source_change_set_id, recorded_at)
        VALUES (
          COALESCE(NULLIF(v_pv->>'entity_id','')::uuid, v_cs.entity_id),
          (v_pv->>'person_party_id')::uuid,
          (v_pv->>'role_type_id')::uuid,
          NULLIF(v_pv->>'appointment_date','')::date,
          COALESCE(NULLIF(v_pv->>'effective_from','')::timestamptz, v_item.effective_from,
                   COALESCE(v_cs.effective_date::timestamptz, now())),
          COALESCE(NULLIF(v_pv->>'effective_to','')::timestamptz, v_item.effective_to),
          COALESCE((v_pv->>'is_executive')::boolean, false),
          COALESCE(NULLIF(v_pv->>'status',''), 'ACTIVE'),
          COALESCE(NULLIF(v_pv->>'regulatory_approval_status',''), 'APPROVED'),
          NULLIF(v_pv->>'fp_individual_id','')::uuid,
          v_cs.source_submission_id, v_cs.source_form_version_id, v_cs.id, now());
        v_applied := v_applied + 1;
      END IF;
    END LOOP;

    UPDATE public.entity_change_sets
       SET status='APPLIED', applied_by=v_uid, applied_at=now(), updated_at=now()
     WHERE id=_change_set_id;
    UPDATE public.licensees
       SET structure_version = COALESCE(structure_version,0) + 1
     WHERE id = v_cs.entity_id;

    PERFORM public.create_audit_log(v_uid,'entity.change_set.applied','entity_change_set',
      _change_set_id::text,
      jsonb_build_object('status', v_cs.status),
      jsonb_build_object('status','APPLIED','entity_id',v_cs.entity_id,'records_written',v_applied,
                         'proposed_by',v_cs.submitted_by,'approved_by',v_cs.approved_by),NULL);

    RETURN jsonb_build_object('success',true,'change_set_id',_change_set_id,'action','apply',
                              'applied',v_applied,'idempotent',false);
  ELSE
    RAISE EXCEPTION 'Unknown action %', _action;
  END IF;

  RETURN jsonb_build_object('success',true,'change_set_id',_change_set_id,'action',_action);
END $function$;

-- ---------------------------------------------------------------
-- 7. Governed structural read contract
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entity_structure_can_view(_entity_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  RETURN public.has_permission(v_uid,'entity_membership','view')
      OR public.has_permission(v_uid,'license_management','view')
      OR EXISTS (SELECT 1 FROM public.entity_user_memberships m
                  WHERE m.user_id = v_uid AND m.entity_id = _entity_id AND m.status = 'APPROVED');
END $fn$;

CREATE OR REPLACE FUNCTION public.entity_structure_ownership(_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF NOT public.entity_structure_can_view(_entity_id) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
  END IF;
  SELECT COALESCE(jsonb_agg(x ORDER BY ord), '[]'::jsonb) INTO v_out FROM (
    SELECT jsonb_build_object(
      'id', o.id,
      'owner_party_id', o.owner_party_id,
      'owner_name', p.display_name,
      'owner_party_kind', p.party_kind,
      'owner_entity_id', lo.id,
      'ownership_type', ot.label,
      'economic_interest_percentage', o.economic_interest_percentage,
      'voting_rights_percentage', o.voting_rights_percentage,
      'beneficial_interest_percentage', o.beneficial_interest_percentage,
      'is_direct', o.is_direct,
      'is_controller', o.is_controller,
      'recorded_ubo', o.is_ubo,
      'control_determination', o.control_determination,
      'approval_status', o.approval_status,
      'effective_from', o.effective_from,
      'effective_to', o.effective_to,
      'source_change_set_id', o.source_change_set_id,
      'source_submission_id', o.source_submission_id,
      'recorded_at', o.recorded_at) AS x,
      COALESCE(o.economic_interest_percentage, -1) AS ord
    FROM public.ownership_interests o
    LEFT JOIN public.parties p ON p.id = o.owner_party_id
    LEFT JOIN public.licensees lo ON lo.party_id = o.owner_party_id
    LEFT JOIN public.ownership_types ot ON ot.id = o.ownership_type_id
    WHERE o.owned_entity_id = _entity_id AND o.superseded_at IS NULL
  ) s;
  RETURN v_out;
END $fn$;

CREATE OR REPLACE FUNCTION public.entity_structure_appointments(_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF NOT public.entity_structure_can_view(_entity_id) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id,
      'person_party_id', a.person_party_id,
      'person_name', p.display_name,
      'role_label', rt.label,
      'role_key', rt.key,
      'is_governance', rt.is_governance,
      'is_executive', a.is_executive,
      'status', a.status,
      'regulatory_approval_status', a.regulatory_approval_status,
      'appointment_date', a.appointment_date,
      'effective_from', a.effective_from,
      'effective_to', a.effective_to,
      'fp_individual_id', a.fp_individual_id,
      'source_change_set_id', a.source_change_set_id
    ) ORDER BY a.effective_from DESC), '[]'::jsonb) INTO v_out
  FROM public.entity_appointments a
  LEFT JOIN public.parties p ON p.id = a.person_party_id
  LEFT JOIN public.role_types rt ON rt.id = a.role_type_id
  WHERE a.entity_id = _entity_id AND a.superseded_at IS NULL;
  RETURN v_out;
END $fn$;

CREATE OR REPLACE FUNCTION public.entity_structure_relationships(_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_out jsonb; v_party uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF NOT public.entity_structure_can_view(_entity_id) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
  END IF;
  SELECT party_id INTO v_party FROM public.licensees WHERE id = _entity_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'related_party_id', CASE WHEN r.source_party_id = v_party THEN r.target_party_id ELSE r.source_party_id END,
      'related_party_name', CASE WHEN r.source_party_id = v_party THEN pt.display_name ELSE ps.display_name END,
      'related_party_kind', CASE WHEN r.source_party_id = v_party THEN pt.party_kind ELSE ps.party_kind END,
      'related_entity_id', CASE WHEN r.source_party_id = v_party THEN lt.id ELSE ls.id END,
      'relationship_label', CASE WHEN r.source_party_id = v_party THEN rt.label ELSE COALESCE(irt.label, rt.label) END,
      'relationship_key', CASE WHEN r.source_party_id = v_party THEN rt.key ELSE COALESCE(irt.key, rt.key) END,
      'perspective', CASE WHEN r.source_party_id = v_party THEN 'DIRECT' ELSE 'INVERSE' END,
      'status', r.status,
      'effective_from', r.effective_from,
      'effective_to', r.effective_to,
      'source_change_set_id', r.source_change_set_id,
      'recorded_at', r.recorded_at
    ) ORDER BY r.effective_from DESC), '[]'::jsonb) INTO v_out
  FROM public.party_relationships r
  JOIN public.relationship_types rt ON rt.id = r.relationship_type_id
  LEFT JOIN public.relationship_types irt ON irt.id = rt.inverse_relationship_type_id
  LEFT JOIN public.parties ps ON ps.id = r.source_party_id
  LEFT JOIN public.parties pt ON pt.id = r.target_party_id
  LEFT JOIN public.licensees ls ON ls.party_id = r.source_party_id
  LEFT JOIN public.licensees lt ON lt.party_id = r.target_party_id
  WHERE r.superseded_at IS NULL
    AND (r.entity_id = _entity_id OR r.source_party_id = v_party OR r.target_party_id = v_party);
  RETURN v_out;
END $fn$;

CREATE OR REPLACE FUNCTION public.entity_structure_change_sets(_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF NOT public.entity_structure_can_view(_entity_id) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC), '[]'::jsonb) INTO v_out
  FROM public.entity_change_sets c WHERE c.entity_id = _entity_id;
  RETURN v_out;
END $fn$;

CREATE OR REPLACE FUNCTION public.entity_structure_change_items(_change_set_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_out jsonb; v_entity uuid;
BEGIN
  SELECT entity_id INTO v_entity FROM public.entity_change_sets WHERE id = _change_set_id;
  IF v_entity IS NULL THEN RAISE EXCEPTION 'Change set not found'; END IF;
  IF NOT public.entity_structure_can_view(v_entity) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', i.id, 'change_type', i.change_type, 'operation', i.operation,
      'target_table', i.target_table, 'target_record_id', i.target_record_id,
      'current_value', i.current_value, 'proposed_value', i.proposed_value,
      'effective_from', i.effective_from, 'effective_to', i.effective_to,
      'sequence', i.sequence,
      'concept_code', dc.code, 'concept_name', dc.name
    ) ORDER BY i.sequence), '[]'::jsonb) INTO v_out
  FROM public.entity_change_items i
  LEFT JOIN public.data_concepts dc ON dc.id = i.data_concept_id
  WHERE i.change_set_id = _change_set_id;
  RETURN v_out;
END $fn$;

REVOKE ALL ON FUNCTION public.entity_structure_can_view(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.entity_structure_ownership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_structure_appointments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_structure_relationships(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_structure_change_sets(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_structure_change_items(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.entity_structure_ownership(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.entity_structure_appointments(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.entity_structure_relationships(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.entity_structure_change_sets(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.entity_structure_change_items(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ownership_interests_validate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.party_relationships_validate() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------
-- 8. Browser lockdown of canonical structural tables
-- ---------------------------------------------------------------
REVOKE ALL ON public.ownership_interests FROM anon, authenticated;
REVOKE ALL ON public.party_relationships FROM anon, authenticated;
REVOKE ALL ON public.entity_appointments FROM anon, authenticated;
REVOKE ALL ON public.entity_change_sets FROM anon, authenticated;
REVOKE ALL ON public.entity_change_items FROM anon, authenticated;
GRANT ALL ON public.ownership_interests TO service_role;
GRANT ALL ON public.party_relationships TO service_role;
GRANT ALL ON public.entity_appointments TO service_role;
GRANT ALL ON public.entity_change_sets TO service_role;
GRANT ALL ON public.entity_change_items TO service_role;

-- ---------------------------------------------------------------
-- 9. Legacy retirement — entity_relationships + its RPCs
-- ---------------------------------------------------------------
REVOKE ALL ON FUNCTION public.entity_relationship_save(uuid, text, text, uuid, uuid, numeric, date, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.entity_relationship_delete(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.entity_relationships FROM anon, authenticated;
GRANT ALL ON public.entity_relationships TO service_role;

COMMENT ON TABLE public.entity_relationships IS
  'DEAD / RETIRED (F8A-B1). Historical structure retained for audit only. Zero operational rows. Canonical non-ownership relationships live in public.party_relationships; ownership lives in public.ownership_interests.';
COMMENT ON FUNCTION public.entity_relationship_save(uuid, text, text, uuid, uuid, numeric, date, text, text) IS
  'RETIRED (F8A-B1). Not browser-callable. Superseded by the governed entity change-set pipeline.';
COMMENT ON FUNCTION public.entity_relationship_delete(uuid, text) IS
  'RETIRED (F8A-B1). Not browser-callable. Superseded by the governed entity change-set pipeline.';

-- Competing ownership fields — formally classified, not deleted.
COMMENT ON COLUMN public.fp_individual_roles.ownership_pct IS
  'NOT ownership authority (F8A-B1). Legacy/contextual fit-and-proper role information. Authoritative ownership is public.ownership_interests.';
COMMENT ON COLUMN public.financial_group_members.ownership_percentage IS
  'NOT legal ownership authority (F8A-B1). Prudential consolidation/perimeter metadata. Authoritative ownership is public.ownership_interests.';
COMMENT ON COLUMN public.ownership_interests.is_ubo IS
  'RECORDED/declared UBO marker from the governed source record. NOT a deterministic calculated UBO result; recursive UBO resolution arrives in F8A-B2.';
COMMENT ON COLUMN public.ownership_interests.is_direct IS
  'true = direct structural ownership/control edge, eligible for recursive traversal (F8A-B2). false = declared/reported indirect interest, contextual only, and MUST NOT be traversed as an additional structural edge (double-count invariant).';

-- ---------------------------------------------------------------
-- 10. Entity 360 canonical section repair
-- ---------------------------------------------------------------
DO $patch$
DECLARE
  d text;
  old_rel text;
  new_rel text;
  old_own text;
  new_own text;
BEGIN
  d := pg_get_functiondef('public.entity360_section(uuid,text,timestamptz,int,int)'::regprocedure);

  old_rel := $old$  ELSIF _section = 'relationships' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', r.id, 'related_entity_id', r.related_entity_id,
        'related_entity_name', COALESCE(r.related_entity_name, l2.name),
        'relationship_type', r.relationship_type, 'ownership_percentage', r.ownership_percentage,
        'status', r.status, 'effective_date', r.effective_date) AS x
      FROM public.entity_relationships r
      LEFT JOIN public.licensees l2 ON l2.id = r.related_entity_id
      WHERE r.entity_id = _entity_id
        AND (_as_of IS NULL OR r.effective_date IS NULL OR r.effective_date <= asof::date)
      ORDER BY r.created_at DESC LIMIT lim OFFSET off) s), '[]'::jsonb);$old$;

  new_rel := $new$  ELSIF _section = 'relationships' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', r.id,
        'related_party_id', CASE WHEN r.source_party_id = e.ep THEN r.target_party_id ELSE r.source_party_id END,
        'related_entity_name', CASE WHEN r.source_party_id = e.ep THEN COALESCE(lt.name, pt.display_name)
                                    ELSE COALESCE(ls.name, ps.display_name) END,
        'related_party_kind', CASE WHEN r.source_party_id = e.ep THEN pt.party_kind ELSE ps.party_kind END,
        'related_entity_id', CASE WHEN r.source_party_id = e.ep THEN lt.id ELSE ls.id END,
        'relationship_type', CASE WHEN r.source_party_id = e.ep THEN rt.label ELSE COALESCE(irt.label, rt.label) END,
        'relationship_key', CASE WHEN r.source_party_id = e.ep THEN rt.key ELSE COALESCE(irt.key, rt.key) END,
        'perspective', CASE WHEN r.source_party_id = e.ep THEN 'DIRECT' ELSE 'INVERSE' END,
        'status', r.status, 'valid_from', r.effective_from, 'valid_to', r.effective_to,
        'source', CASE WHEN r.source_change_set_id IS NOT NULL THEN 'Governed change set'
                       WHEN r.source_submission_id IS NOT NULL THEN 'Regulatory submission'
                       ELSE 'Regulator record' END) AS x
      FROM public.party_relationships r
      CROSS JOIN (SELECT party_id AS ep FROM public.licensees WHERE id = _entity_id) e
      JOIN public.relationship_types rt ON rt.id = r.relationship_type_id
      LEFT JOIN public.relationship_types irt ON irt.id = rt.inverse_relationship_type_id
      LEFT JOIN public.parties ps ON ps.id = r.source_party_id
      LEFT JOIN public.parties pt ON pt.id = r.target_party_id
      LEFT JOIN public.licensees ls ON ls.party_id = r.source_party_id
      LEFT JOIN public.licensees lt ON lt.party_id = r.target_party_id
      WHERE r.superseded_at IS NULL
        AND (r.entity_id = _entity_id OR r.source_party_id = e.ep OR r.target_party_id = e.ep)
        AND (_as_of IS NULL
             OR (r.effective_from <= asof
                 AND (r.effective_to IS NULL OR r.effective_to > asof)
                 AND (r.superseded_at IS NULL OR r.superseded_at > asof)))
      ORDER BY r.effective_from DESC LIMIT lim OFFSET off) s), '[]'::jsonb);$new$;

  IF position(old_rel in d) = 0 THEN
    RAISE EXCEPTION 'F8A-B1: entity360_section relationships block not found — aborting patch';
  END IF;
  d := replace(d, old_rel, new_rel);

  old_own := $old$        'is_direct', oi.is_direct, 'is_controller', oi.is_controller, 'is_ubo', oi.is_ubo,
        'approval_status', oi.approval_status, 'effective_from', oi.effective_from,
        'effective_to', oi.effective_to) AS x
      FROM public.ownership_interests oi
      LEFT JOIN public.parties p ON p.id = oi.owner_party_id$old$;

  new_own := $new$        'is_direct', oi.is_direct, 'is_controller', oi.is_controller,
        'recorded_ubo', oi.is_ubo,
        'ownership_type', ot.label,
        'owner_entity_id', lo.id,
        'source', CASE WHEN oi.source_change_set_id IS NOT NULL THEN 'Governed change set'
                       WHEN oi.source_submission_id IS NOT NULL THEN 'Regulatory submission'
                       ELSE 'Regulator record' END,
        'approval_status', oi.approval_status, 'valid_from', oi.effective_from,
        'valid_to', oi.effective_to) AS x
      FROM public.ownership_interests oi
      LEFT JOIN public.ownership_types ot ON ot.id = oi.ownership_type_id
      LEFT JOIN public.licensees lo ON lo.party_id = oi.owner_party_id
      LEFT JOIN public.parties p ON p.id = oi.owner_party_id$old_marker$;$new$;

  new_own := replace(new_own, '$old_marker$;', '');

  IF position(old_own in d) = 0 THEN
    RAISE EXCEPTION 'F8A-B1: entity360_section ownership block not found — aborting patch';
  END IF;
  d := replace(d, old_own, new_own);

  EXECUTE d;
END $patch$;
