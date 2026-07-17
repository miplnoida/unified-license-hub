
-- 1. Idempotency key on complaints (unique per creator when set)
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS complaints_idempotency_creator_uidx
  ON public.complaints (internal_created_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND internal_created_by IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS complaints_idempotency_email_uidx
  ON public.complaints (lower(email), idempotency_key)
  WHERE idempotency_key IS NOT NULL AND internal_created_by IS NULL AND email IS NOT NULL;

-- 2. Extend escalation rule criterion to include vulnerability
ALTER TABLE public.complaint_escalation_rules
  DROP CONSTRAINT IF EXISTS complaint_escalation_rules_criterion_check;

ALTER TABLE public.complaint_escalation_rules
  ADD CONSTRAINT complaint_escalation_rules_criterion_check
  CHECK (criterion = ANY (ARRAY['harm','age','risk_rating','volume','recurrence','vulnerability']));

-- 3. Atomic create_complaint + link staged attachments
CREATE OR REPLACE FUNCTION public.create_complaint_with_attachments(
  _variant text,
  _payload jsonb,
  _staged_upload_ids uuid[] DEFAULT ARRAY[]::uuid[],
  _idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing_id uuid;
  v_existing jsonb;
  v_result jsonb;
  v_complaint_id uuid;
  v_reg uuid;
  v_upload record;
  v_payload jsonb := coalesce(_payload,'{}'::jsonb);
BEGIN
  -- Idempotency short-circuit (authenticated callers only)
  IF _idempotency_key IS NOT NULL AND v_uid IS NOT NULL THEN
    SELECT id INTO v_existing_id
      FROM public.complaints
     WHERE internal_created_by = v_uid AND idempotency_key = _idempotency_key
     LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      SELECT jsonb_build_object(
        'id', c.id,
        'complaint_number', c.complaint_number,
        'workflow_instance_id', (
          SELECT wi.id FROM public.workflow_instances wi
           WHERE wi.entity_type='complaint' AND wi.entity_id=c.id
           ORDER BY wi.created_at DESC LIMIT 1
        ),
        'complaint', to_jsonb(c),
        'idempotent', true
      ) INTO v_existing FROM public.complaints c WHERE c.id = v_existing_id;
      RETURN v_existing;
    END IF;
  END IF;

  -- Delegate to canonical create_complaint (same tx; any raise rolls back)
  v_result := public.create_complaint(_variant, v_payload);
  v_complaint_id := (v_result->>'id')::uuid;

  IF v_complaint_id IS NULL THEN
    RAISE EXCEPTION 'create_complaint returned no id';
  END IF;

  -- Store idempotency key
  IF _idempotency_key IS NOT NULL THEN
    UPDATE public.complaints
       SET idempotency_key = _idempotency_key
     WHERE id = v_complaint_id;
  END IF;

  SELECT regulator_id INTO v_reg FROM public.complaints WHERE id = v_complaint_id;

  -- Validate + link staged uploads (any failure aborts entire tx)
  IF _staged_upload_ids IS NOT NULL AND array_length(_staged_upload_ids,1) > 0 THEN
    FOR v_upload IN
      SELECT id, uploaded_by, entity_type, entity_id
        FROM public.file_uploads
       WHERE id = ANY(_staged_upload_ids)
    LOOP
      -- Ownership
      IF v_uid IS NOT NULL AND v_upload.uploaded_by IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'Staged upload % not owned by caller', v_upload.id
          USING ERRCODE='42501';
      END IF;
      -- Not already linked to a different complaint
      IF EXISTS (
        SELECT 1 FROM public.complaint_evidence ce
         WHERE ce.file_upload_id = v_upload.id AND ce.complaint_id <> v_complaint_id
      ) THEN
        RAISE EXCEPTION 'Staged upload % already linked to another complaint', v_upload.id
          USING ERRCODE='23505';
      END IF;
    END LOOP;

    -- All checks passed, link via existing finalize function (which enforces
    -- regulator scope + idempotent inserts internally).
    PERFORM public.finalize_complaint_with_attachments(v_complaint_id, _staged_upload_ids);
  END IF;

  RETURN v_result || jsonb_build_object('idempotent', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_complaint_with_attachments(text, jsonb, uuid[], text)
  TO authenticated, anon, service_role;

-- 4. Regulator-scoped assignment teams reference
CREATE OR REPLACE FUNCTION public.list_complaint_assignment_teams(_regulator_id uuid DEFAULT NULL)
RETURNS TABLE(team text, complaint_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT assigned_team AS team, count(*)::bigint AS complaint_count
    FROM public.complaints
   WHERE assigned_team IS NOT NULL
     AND btrim(assigned_team) <> ''
     AND (_regulator_id IS NULL OR regulator_id = _regulator_id)
   GROUP BY assigned_team
   ORDER BY assigned_team;
$$;

GRANT EXECUTE ON FUNCTION public.list_complaint_assignment_teams(uuid)
  TO authenticated, service_role;

-- 5. Vulnerability branch inside per-complaint evaluator (wrapper)
--    We keep the existing evaluate_complaint_escalations logic and add
--    a supplementary function invoked after it. This avoids rewriting the
--    entire evaluator while still opening cases for vulnerability rules.
CREATE OR REPLACE FUNCTION public.evaluate_complaint_vulnerability_escalations(_complaint_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c public.complaints%ROWTYPE;
  v_rule public.complaint_escalation_rules%ROWTYPE;
  v_opened integer := 0;
  v_thresholds jsonb;
  v_required_state text;
  v_required_cats text[];
BEGIN
  SELECT * INTO v_c FROM public.complaints WHERE id = _complaint_id;
  IF NOT FOUND OR v_c.status IN ('closed','withdrawn','rejected') THEN
    RETURN 0;
  END IF;

  FOR v_rule IN
    SELECT * FROM public.complaint_escalation_rules
     WHERE criterion = 'vulnerability'
       AND coalesce(enabled, true)
       AND (regulator_id IS NULL OR regulator_id = v_c.regulator_id)
  LOOP
    v_thresholds := coalesce(v_rule.thresholds, '{}'::jsonb);
    v_required_state := NULLIF(v_thresholds->>'review_state','');
    v_required_cats := CASE
      WHEN jsonb_typeof(v_thresholds->'categories') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(v_thresholds->'categories'))
      ELSE NULL
    END;

    -- Rule fires when:
    --   * indicator is true, AND
    --   * (no state filter) OR review_state matches, AND
    --   * (no category filter) OR category in required set
    IF v_c.vulnerability_indicator
       AND (v_required_state IS NULL OR v_c.vulnerability_review_state::text = v_required_state)
       AND (v_required_cats IS NULL OR v_c.vulnerability_category = ANY(v_required_cats))
    THEN
      -- Dedupe: no active case of same rule for this complaint
      IF NOT EXISTS (
        SELECT 1 FROM public.complaint_escalation_cases ec
         WHERE ec.complaint_id = _complaint_id
           AND ec.rule_key = v_rule.key
           AND ec.status = 'open'
      ) THEN
        INSERT INTO public.complaint_escalation_cases (
          complaint_id, rule_key, criterion, target_tier, status,
          triggered_at, regulator_id
        ) VALUES (
          _complaint_id, v_rule.key, 'vulnerability',
          coalesce(v_rule.target_tier, 'head_of_unit'), 'open',
          now(), v_c.regulator_id
        );
        v_opened := v_opened + 1;

        INSERT INTO public.audit_logs (entity_type, entity_id, action, changes, user_id)
        VALUES ('complaint', _complaint_id, 'escalation.vulnerability.opened',
                jsonb_build_object('rule_key', v_rule.key), NULL);
      END IF;
    END IF;
  END LOOP;

  RETURN v_opened;
END;
$$;

GRANT EXECUTE ON FUNCTION public.evaluate_complaint_vulnerability_escalations(uuid)
  TO authenticated, service_role;

-- Hook vulnerability evaluator into the main evaluators.
CREATE OR REPLACE FUNCTION public.evaluate_complaint_escalations_v2(_complaint_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_a integer := 0;
  v_b integer := 0;
BEGIN
  v_a := public.evaluate_complaint_escalations(_complaint_id);
  v_b := public.evaluate_complaint_vulnerability_escalations(_complaint_id);
  RETURN v_a + v_b;
END;
$$;

GRANT EXECUTE ON FUNCTION public.evaluate_complaint_escalations_v2(uuid)
  TO authenticated, service_role;

-- Update the sweep to include vulnerability
CREATE OR REPLACE FUNCTION public.evaluate_all_complaint_escalations()
RETURNS TABLE(scanned integer, escalated integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c record;
  v_scanned integer := 0;
  v_escalated integer := 0;
  v_opened integer;
BEGIN
  FOR v_c IN
    SELECT id FROM public.complaints
     WHERE status NOT IN ('closed','withdrawn','rejected')
  LOOP
    v_scanned := v_scanned + 1;
    BEGIN
      v_opened := public.evaluate_complaint_escalations_v2(v_c.id);
      v_escalated := v_escalated + coalesce(v_opened,0);
    EXCEPTION WHEN OTHERS THEN
      -- Never abort the sweep on a single-record failure
      NULL;
    END;
  END LOOP;
  RETURN QUERY SELECT v_scanned, v_escalated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.evaluate_all_complaint_escalations()
  TO authenticated, service_role;
