-- FINANCIAL GROUP MANAGEMENT GOVERNANCE
-- Adds ownership-variance / exclusion-rationale capture, server-side structural
-- and methodology validation, canonical audit coverage and a canonical ownership
-- reference lookup. No permission, grant or consolidation-maths changes.

ALTER TABLE public.financial_group_members
  ADD COLUMN IF NOT EXISTS exclusion_rationale text,
  ADD COLUMN IF NOT EXISTS ownership_variance_reason text,
  ADD COLUMN IF NOT EXISTS ownership_variance_note text;

-- Backfill: existing excluded members carry their rationale in notes today.
UPDATE public.financial_group_members
   SET exclusion_rationale = COALESCE(NULLIF(btrim(notes), ''), 'Rationale recorded before structured capture; review required.')
 WHERE consolidation_treatment = 'excluded'
   AND (exclusion_rationale IS NULL OR btrim(exclusion_rationale) = '');

ALTER TABLE public.financial_group_members
  DROP CONSTRAINT IF EXISTS fgm_variance_reason_check;
ALTER TABLE public.financial_group_members
  ADD CONSTRAINT fgm_variance_reason_check CHECK (
    ownership_variance_reason IS NULL OR ownership_variance_reason = ANY (ARRAY[
      'supervisory_perimeter_basis','indirect_effective_interest','temporary_structure',
      'regulatory_treatment','awaiting_verification','other'])
  );

-- ---------------------------------------------------------------------------
-- Server-side structural validation for the group hierarchy.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_fgm_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_p uuid; v_g uuid; v_hops int := 0;
BEGIN
  IF NEW.end_date IS NOT NULL AND NEW.effective_date IS NOT NULL
     AND NEW.end_date < NEW.effective_date THEN
    RAISE EXCEPTION 'GROUP_MEMBER_DATE_ORDER: end date cannot precede the effective date'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.consolidation_treatment = 'excluded'
     AND COALESCE(btrim(NEW.exclusion_rationale), '') = '' THEN
    RAISE EXCEPTION 'GROUP_MEMBER_EXCLUSION_RATIONALE_REQUIRED: an excluded member requires an exclusion rationale'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.parent_member_id IS NOT NULL THEN
    IF NEW.parent_member_id = NEW.id THEN
      RAISE EXCEPTION 'GROUP_MEMBER_SELF_PARENT: a member cannot be its own parent'
        USING ERRCODE = '22023';
    END IF;

    SELECT group_id INTO v_g FROM public.financial_group_members WHERE id = NEW.parent_member_id;
    IF v_g IS NULL OR v_g <> NEW.group_id THEN
      RAISE EXCEPTION 'GROUP_MEMBER_PARENT_OUT_OF_GROUP: the parent must belong to the same financial group'
        USING ERRCODE = '22023';
    END IF;

    IF NEW.member_role = 'ultimate_holding' THEN
      RAISE EXCEPTION 'GROUP_MEMBER_HOLDING_HAS_PARENT: the ultimate holding member cannot sit under a parent'
        USING ERRCODE = '22023';
    END IF;

    -- cycle detection: walk upwards from the proposed parent
    v_p := NEW.parent_member_id;
    WHILE v_p IS NOT NULL LOOP
      IF v_p = NEW.id THEN
        RAISE EXCEPTION 'GROUP_MEMBER_CYCLE: the proposed parent would create a circular hierarchy'
          USING ERRCODE = '22023';
      END IF;
      v_hops := v_hops + 1;
      IF v_hops > 64 THEN
        RAISE EXCEPTION 'GROUP_MEMBER_CYCLE: hierarchy depth limit exceeded' USING ERRCODE = '22023';
      END IF;
      SELECT parent_member_id INTO v_p FROM public.financial_group_members WHERE id = v_p;
    END LOOP;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_fgm_validate ON public.financial_group_members;
CREATE TRIGGER trg_fgm_validate
  BEFORE INSERT OR UPDATE ON public.financial_group_members
  FOR EACH ROW EXECUTE FUNCTION public.tg_fgm_validate();

-- ---------------------------------------------------------------------------
-- Methodology validation against the tokens the consolidation engine supports.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_gcm_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r jsonb; t text;
BEGIN
  IF jsonb_typeof(COALESCE(NEW.ratio_rules, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'METHODOLOGY_RULES_NOT_ARRAY: ratio rules must be a list' USING ERRCODE = '22023';
  END IF;

  FOR r IN SELECT x FROM jsonb_array_elements(COALESCE(NEW.ratio_rules, '[]'::jsonb)) x LOOP
    IF jsonb_typeof(r) <> 'object' THEN
      RAISE EXCEPTION 'METHODOLOGY_RULE_NOT_OBJECT: each ratio rule must be an object' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(btrim(r->>'ratio_key'), '') = '' THEN
      RAISE EXCEPTION 'METHODOLOGY_RULE_RATIO_KEY_REQUIRED: each ratio rule requires a ratio key' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(r->>'method', 'sum') NOT IN ('sum', 'weighted_avg') THEN
      RAISE EXCEPTION 'METHODOLOGY_RULE_METHOD_UNSUPPORTED: aggregation method % is not supported by the consolidation engine (use sum or weighted_avg)', r->>'method'
        USING ERRCODE = '22023';
    END IF;
    IF r ? 'eliminate' AND jsonb_typeof(r->'eliminate') <> 'boolean' THEN
      RAISE EXCEPTION 'METHODOLOGY_RULE_ELIMINATE_INVALID: eliminate must be true or false' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOREACH t IN ARRAY COALESCE(NEW.eliminate_exposure_types, ARRAY[]::text[]) LOOP
    IF t NOT IN ('loan', 'deposit', 'capital', 'guarantee', 'other') THEN
      RAISE EXCEPTION 'METHODOLOGY_EXPOSURE_TYPE_INVALID: % is not a supported exposure type', t
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF NEW.large_exposure_pct IS NULL OR NEW.large_exposure_pct < 0 OR NEW.large_exposure_pct > 100 THEN
    RAISE EXCEPTION 'METHODOLOGY_LARGE_EXPOSURE_PCT_INVALID: the large exposure threshold must be between 0 and 100'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_gcm_validate ON public.group_consolidation_methods;
CREATE TRIGGER trg_gcm_validate
  BEFORE INSERT OR UPDATE ON public.group_consolidation_methods
  FOR EACH ROW EXECUTE FUNCTION public.tg_gcm_validate();

-- ---------------------------------------------------------------------------
-- Canonical audit coverage for governed group mutations.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_group_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_action text;
  v_group uuid;
  v_before jsonb := NULL;
  v_after jsonb := NULL;
  v_ca public.compliance_audit_action := 'UPDATE';
BEGIN
  IF TG_OP = 'DELETE' THEN v_before := to_jsonb(OLD); ELSE v_after := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE' THEN v_before := to_jsonb(OLD); END IF;
  IF TG_OP = 'INSERT' THEN v_ca := 'CREATE'; ELSIF TG_OP = 'DELETE' THEN v_ca := 'DELETE'; END IF;

  IF TG_TABLE_NAME = 'financial_groups' THEN
    v_group := COALESCE(NEW.id, OLD.id);
    v_action := CASE TG_OP WHEN 'INSERT' THEN 'GROUP_CREATED' ELSE 'GROUP_MASTER_UPDATED' END;
  ELSIF TG_TABLE_NAME = 'financial_group_members' THEN
    v_group := COALESCE(NEW.group_id, OLD.group_id);
    v_action := CASE TG_OP
      WHEN 'INSERT' THEN 'GROUP_MEMBER_ADDED'
      WHEN 'DELETE' THEN 'GROUP_MEMBER_REMOVED'
      ELSE 'GROUP_MEMBER_UPDATED' END;
  ELSIF TG_TABLE_NAME = 'group_consolidation_methods' THEN
    v_group := COALESCE(NEW.group_id, OLD.group_id);
    v_action := CASE TG_OP WHEN 'INSERT' THEN 'GROUP_METHODOLOGY_VERSION_CREATED' ELSE 'GROUP_METHODOLOGY_UPDATED' END;
  ELSIF TG_TABLE_NAME = 'intragroup_exposures' THEN
    v_group := COALESCE(NEW.group_id, OLD.group_id);
    v_action := CASE TG_OP
      WHEN 'INSERT' THEN 'INTRAGROUP_EXPOSURE_RECORDED'
      WHEN 'DELETE' THEN 'INTRAGROUP_EXPOSURE_DELETED'
      ELSE 'INTRAGROUP_EXPOSURE_UPDATED' END;
  ELSIF TG_TABLE_NAME = 'group_ewi_alerts' THEN
    v_group := COALESCE(NEW.group_id, OLD.group_id);
    IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
    v_action := CASE WHEN TG_OP = 'UPDATE' AND NEW.status = 'acknowledged'
                     THEN 'GROUP_EWI_ACKNOWLEDGED' ELSE 'GROUP_EWI_STATUS_CHANGED' END;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM public.prudential_audit_event(
    v_action, 'financial_group', v_group, v_before, v_after,
    jsonb_build_object('surface', TG_TABLE_NAME, 'operation', TG_OP),
    CASE WHEN TG_TABLE_NAME = 'financial_group_members'
         THEN COALESCE(NEW.exclusion_rationale, NEW.ownership_variance_note) END,
    v_ca);

  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_fg_audit ON public.financial_groups;
CREATE TRIGGER trg_fg_audit AFTER INSERT OR UPDATE ON public.financial_groups
  FOR EACH ROW EXECUTE FUNCTION public.tg_group_audit();

DROP TRIGGER IF EXISTS trg_fgm_audit ON public.financial_group_members;
CREATE TRIGGER trg_fgm_audit AFTER INSERT OR UPDATE OR DELETE ON public.financial_group_members
  FOR EACH ROW EXECUTE FUNCTION public.tg_group_audit();

DROP TRIGGER IF EXISTS trg_gcm_audit ON public.group_consolidation_methods;
CREATE TRIGGER trg_gcm_audit AFTER INSERT ON public.group_consolidation_methods
  FOR EACH ROW EXECUTE FUNCTION public.tg_group_audit();

DROP TRIGGER IF EXISTS trg_ige_audit ON public.intragroup_exposures;
CREATE TRIGGER trg_ige_audit AFTER INSERT OR UPDATE OR DELETE ON public.intragroup_exposures
  FOR EACH ROW EXECUTE FUNCTION public.tg_group_audit();

DROP TRIGGER IF EXISTS trg_gea_audit ON public.group_ewi_alerts;
CREATE TRIGGER trg_gea_audit AFTER UPDATE ON public.group_ewi_alerts
  FOR EACH ROW EXECUTE FUNCTION public.tg_group_audit();

-- ---------------------------------------------------------------------------
-- Canonical ownership reference (read-only) for the group member form.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financial_group_ownership_reference(
  _group_id uuid,
  _parent_licensee_id uuid,
  _member_licensee_id uuid,
  _as_of date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid; v_owned uuid; r record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_read_financial_group(auth.uid(), _group_id) THEN
    RAISE EXCEPTION 'not authorised to view this financial group' USING ERRCODE = '42501';
  END IF;
  IF _parent_licensee_id IS NULL OR _member_licensee_id IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'PARENT_OR_MEMBER_NOT_SPECIFIED');
  END IF;

  SELECT party_id INTO v_owner FROM public.licensees WHERE id = _parent_licensee_id;
  SELECT party_id INTO v_owned FROM public.licensees WHERE id = _member_licensee_id;
  IF v_owner IS NULL OR v_owned IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'ENTITY_NOT_CANONICAL_PARTY');
  END IF;

  SELECT oi.economic_interest_percentage AS economic, oi.voting_rights_percentage AS voting,
         oi.is_controller, oi.control_determination, oi.approval_status,
         oi.effective_from::date AS effective_from, oi.verified_at
    INTO r
    FROM public.ownership_interests oi
   WHERE oi.owner_party_id = v_owner
     AND oi.owned_party_id = v_owned
     AND oi.superseded_at IS NULL
     AND oi.approval_status = 'APPROVED'
     AND oi.is_direct
     AND oi.effective_from::date <= _as_of
     AND (oi.effective_to IS NULL OR oi.effective_to::date > _as_of)
   ORDER BY oi.effective_from DESC
   LIMIT 1;

  IF r IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'NO_APPROVED_DIRECT_OWNERSHIP');
  END IF;

  RETURN jsonb_build_object(
    'available', true,
    'as_of', _as_of,
    'economic_interest_percentage', r.economic,
    'voting_rights_percentage', r.voting,
    'is_controller', r.is_controller,
    'control_determination', r.control_determination,
    'approval_status', r.approval_status,
    'effective_from', r.effective_from,
    'verified', r.verified_at IS NOT NULL,
    'verified_at', r.verified_at);
END; $$;

REVOKE ALL ON FUNCTION public.financial_group_ownership_reference(uuid, uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.financial_group_ownership_reference(uuid, uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financial_group_ownership_reference(uuid, uuid, uuid, date) TO service_role;