-- ============================================================
-- CHECKPOINT D — Regulatory Service + Task model (extend, do not duplicate)
-- CHECKPOINT E — External Service Provider security context
-- Additive. Existing `services` rows keep working; no workflow change.
-- ============================================================

-- ---------- D: extend the existing service catalogue ----------
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS regulator_id uuid REFERENCES public.regulators(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS regulatory_function_id uuid REFERENCES public.regulatory_functions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS lifecycle_stage text,
  ADD COLUMN IF NOT EXISTS workflow_id uuid,
  ADD COLUMN IF NOT EXISTS decision_type text,
  ADD COLUMN IF NOT EXISTS requires_fit_and_proper boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sla_days integer,
  ADD COLUMN IF NOT EXISTS fee_reference text,
  ADD COLUMN IF NOT EXISTS document_checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS effective_from timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS effective_to timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS set_services_updated_at ON public.services;
CREATE TRIGGER set_services_updated_at BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Task definitions with execution mode. Execution mode decides WHO WORKS,
-- never who decides.
CREATE TABLE IF NOT EXISTS public.regulatory_service_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
  regulatory_function_id uuid REFERENCES public.regulatory_functions(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  sequence_order integer NOT NULL DEFAULT 1,
  execution_mode text NOT NULL DEFAULT 'INTERNAL_ONLY',
  requires_internal_acceptance boolean NOT NULL DEFAULT true,
  required_capability_key text,
  sla_days integer,
  permitted_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT regulatory_service_tasks_mode_chk CHECK (execution_mode IN
    ('INTERNAL_ONLY','EXTERNAL_SUPPORT_ALLOWED','CO_SOURCED','EXTERNAL_TASK_WITH_INTERNAL_ACCEPTANCE')),
  CONSTRAINT regulatory_service_tasks_status_chk CHECK (status IN ('active','inactive')),
  -- Any externally executable task must end in internal acceptance.
  CONSTRAINT regulatory_service_tasks_acceptance_chk CHECK (
    execution_mode = 'INTERNAL_ONLY' OR requires_internal_acceptance = true),
  CONSTRAINT regulatory_service_tasks_code_uk UNIQUE (service_id, code)
);

GRANT SELECT ON public.regulatory_service_tasks TO authenticated;
GRANT ALL ON public.regulatory_service_tasks TO service_role;
ALTER TABLE public.regulatory_service_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY regulatory_service_tasks_read ON public.regulatory_service_tasks
  FOR SELECT TO authenticated USING (public.is_internal_staff(auth.uid()));

DROP TRIGGER IF EXISTS set_regulatory_service_tasks_updated_at ON public.regulatory_service_tasks;
CREATE TRIGGER set_regulatory_service_tasks_updated_at
  BEFORE UPDATE ON public.regulatory_service_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- E: provider organisations, membership, engagement ----------
CREATE TABLE IF NOT EXISTS public.service_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  provider_type text,
  status text NOT NULL DEFAULT 'active',
  nda_reference text,
  security_clearance_confirmed boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_providers_status_chk CHECK (status IN ('active','suspended','offboarded'))
);

CREATE TABLE IF NOT EXISTS public.service_provider_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  member_role text NOT NULL DEFAULT 'specialist',
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  nda_accepted_at timestamptz,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_provider_members_role_chk CHECK (member_role IN ('provider_admin','specialist')),
  CONSTRAINT service_provider_members_status_chk CHECK (status IN ('active','suspended','ended')),
  CONSTRAINT service_provider_members_uk UNIQUE (provider_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.provider_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE,
  regulatory_function_id uuid REFERENCES public.regulatory_functions(id) ON DELETE SET NULL,
  reference text NOT NULL,
  scope_sector_id uuid,
  scope_sub_sector_id uuid,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  nda_confirmed boolean NOT NULL DEFAULT false,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_engagements_status_chk CHECK (status IN ('active','suspended','expired','terminated'))
);

-- The scoped work package is the ONLY thing a provider ever sees.
CREATE TABLE IF NOT EXISTS public.provider_work_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.provider_engagements(id) ON DELETE CASCADE,
  service_task_id uuid REFERENCES public.regulatory_service_tasks(id) ON DELETE SET NULL,
  reference text NOT NULL,
  subject_module text NOT NULL,
  subject_record_id uuid,
  entity_id uuid,
  assigned_member_id uuid REFERENCES public.service_provider_members(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'REQUESTED',
  permitted_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  instructions text,
  due_at timestamptz,
  submitted_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid,
  closed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_work_packages_state_chk CHECK (state IN
    ('REQUESTED','ASSIGNED','IN_PROGRESS','SUBMITTED','INTERNAL_REVIEW',
     'ACCEPTED','CLARIFICATION_REQUIRED','REJECTED','CLOSED'))
);

CREATE TABLE IF NOT EXISTS public.provider_work_package_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL REFERENCES public.provider_work_packages(id) ON DELETE CASCADE,
  from_state text,
  to_state text NOT NULL,
  actor_id uuid,
  actor_context text NOT NULL,
  note text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_work_package_events_context_chk
    CHECK (actor_context IN ('provider','internal','system'))
);

CREATE INDEX IF NOT EXISTS provider_work_packages_engagement_idx
  ON public.provider_work_packages (engagement_id, state);
CREATE INDEX IF NOT EXISTS provider_work_package_events_wp_idx
  ON public.provider_work_package_events (work_package_id, created_at DESC);

-- Grants: providers/staff read via RLS; all writes go through governed RPCs.
GRANT SELECT ON public.service_providers TO authenticated;
GRANT SELECT ON public.service_provider_members TO authenticated;
GRANT SELECT ON public.provider_engagements TO authenticated;
GRANT SELECT ON public.provider_work_packages TO authenticated;
GRANT SELECT ON public.provider_work_package_events TO authenticated;
GRANT ALL ON public.service_providers, public.service_provider_members,
             public.provider_engagements, public.provider_work_packages,
             public.provider_work_package_events TO service_role;

ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_provider_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_work_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_work_package_events ENABLE ROW LEVEL SECURITY;

-- Provider security context helpers (a provider is neither staff nor entity user).
CREATE OR REPLACE FUNCTION public.is_provider_member(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_provider_members m
      JOIN public.service_providers p ON p.id = m.provider_id
     WHERE m.user_id = _user_id
       AND m.status = 'active'
       AND (m.effective_to IS NULL OR m.effective_to > now())
       AND p.status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.provider_can_access_work_package(_user_id uuid, _work_package_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.provider_work_packages w
      JOIN public.provider_engagements e ON e.id = w.engagement_id
      JOIN public.service_provider_members m ON m.provider_id = e.provider_id
      JOIN public.service_providers p ON p.id = e.provider_id
     WHERE w.id = _work_package_id
       AND m.user_id = _user_id
       AND m.status = 'active' AND (m.effective_to IS NULL OR m.effective_to > now())
       AND p.status = 'active'
       AND e.status = 'active'
       AND e.effective_from <= now() AND (e.effective_to IS NULL OR e.effective_to > now())
       AND e.nda_confirmed = true
       AND (w.assigned_member_id IS NULL OR w.assigned_member_id = m.id
            OR m.member_role = 'provider_admin')
       AND w.state <> 'CLOSED');
$$;

REVOKE ALL ON FUNCTION public.is_provider_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.provider_can_access_work_package(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_provider_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provider_can_access_work_package(uuid,uuid) TO authenticated, service_role;

CREATE POLICY service_providers_read ON public.service_providers
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid())
         OR EXISTS (SELECT 1 FROM public.service_provider_members m
                     WHERE m.provider_id = service_providers.id
                       AND m.user_id = auth.uid() AND m.status = 'active'));

CREATE POLICY service_provider_members_read ON public.service_provider_members
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid())
         OR user_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.service_provider_members me
                     WHERE me.provider_id = service_provider_members.provider_id
                       AND me.user_id = auth.uid() AND me.status = 'active'
                       AND me.member_role = 'provider_admin'));

CREATE POLICY provider_engagements_read ON public.provider_engagements
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid())
         OR EXISTS (SELECT 1 FROM public.service_provider_members m
                     WHERE m.provider_id = provider_engagements.provider_id
                       AND m.user_id = auth.uid() AND m.status = 'active'));

CREATE POLICY provider_work_packages_read ON public.provider_work_packages
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid())
         OR public.provider_can_access_work_package(auth.uid(), id));

CREATE POLICY provider_work_package_events_read ON public.provider_work_package_events
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid())
         OR public.provider_can_access_work_package(auth.uid(), work_package_id));

DROP TRIGGER IF EXISTS set_service_providers_updated_at ON public.service_providers;
CREATE TRIGGER set_service_providers_updated_at BEFORE UPDATE ON public.service_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_service_provider_members_updated_at ON public.service_provider_members;
CREATE TRIGGER set_service_provider_members_updated_at BEFORE UPDATE ON public.service_provider_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_provider_engagements_updated_at ON public.provider_engagements;
CREATE TRIGGER set_provider_engagements_updated_at BEFORE UPDATE ON public.provider_engagements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_provider_work_packages_updated_at ON public.provider_work_packages;
CREATE TRIGGER set_provider_work_packages_updated_at BEFORE UPDATE ON public.provider_work_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Governed state machine. Provider actions and internal actions are separate,
-- and a provider can never accept its own submission or make a decision.
CREATE OR REPLACE FUNCTION public.provider_work_package_transition(
  _work_package_id uuid,
  _action text,
  _note text DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wp public.provider_work_packages;
  v_task public.regulatory_service_tasks;
  v_is_provider boolean;
  v_is_staff boolean;
  v_next text;
  v_context text;
BEGIN
  SELECT * INTO v_wp FROM public.provider_work_packages WHERE id = _work_package_id;
  IF v_wp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'work_package_not_found');
  END IF;

  SELECT * INTO v_task FROM public.regulatory_service_tasks WHERE id = v_wp.service_task_id;
  v_is_staff := public.is_internal_staff(v_uid);
  v_is_provider := public.provider_can_access_work_package(v_uid, _work_package_id);

  IF NOT v_is_staff AND NOT v_is_provider THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorised',
      'reason', 'no active engagement, membership or internal role for this work package');
  END IF;

  -- Provider-side actions.
  IF NOT v_is_staff THEN
    IF v_task.id IS NOT NULL AND v_task.execution_mode = 'INTERNAL_ONLY' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'task_is_internal_only');
    END IF;
    v_context := 'provider';
    v_next := CASE
      WHEN _action = 'start' AND v_wp.state IN ('ASSIGNED','CLARIFICATION_REQUIRED') THEN 'IN_PROGRESS'
      WHEN _action = 'submit' AND v_wp.state IN ('IN_PROGRESS','CLARIFICATION_REQUIRED') THEN 'SUBMITTED'
      ELSE NULL END;
    IF _action IN ('accept','reject','request_clarification','close','decide') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'provider_cannot_perform_internal_action',
        'reason', 'acceptance and regulatory decisions are internal-only');
    END IF;
  ELSE
    -- Internal-side actions require the module permission, not the engagement.
    IF NOT public.has_permission(v_uid, 'application_management', 'edit')
       AND NOT public.has_role(v_uid, 'super_admin'::public.app_role) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_authorised',
        'reason', 'internal acceptance requires module permission');
    END IF;
    v_context := 'internal';
    v_next := CASE
      WHEN _action = 'assign' AND v_wp.state = 'REQUESTED' THEN 'ASSIGNED'
      WHEN _action = 'review' AND v_wp.state = 'SUBMITTED' THEN 'INTERNAL_REVIEW'
      WHEN _action = 'accept' AND v_wp.state IN ('SUBMITTED','INTERNAL_REVIEW') THEN 'ACCEPTED'
      WHEN _action = 'request_clarification' AND v_wp.state IN ('SUBMITTED','INTERNAL_REVIEW')
        THEN 'CLARIFICATION_REQUIRED'
      WHEN _action = 'reject' AND v_wp.state IN ('SUBMITTED','INTERNAL_REVIEW') THEN 'REJECTED'
      WHEN _action = 'close' AND v_wp.state IN ('ACCEPTED','REJECTED') THEN 'CLOSED'
      ELSE NULL END;
  END IF;

  IF v_next IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_transition',
      'state', v_wp.state, 'action', _action);
  END IF;

  -- Provider output is never a regulatory decision or accepted evidence by itself.
  UPDATE public.provider_work_packages SET
    state = v_next,
    assigned_member_id = COALESCE(
      NULLIF(_payload->>'assigned_member_id','')::uuid, assigned_member_id),
    submitted_at = CASE WHEN v_next = 'SUBMITTED' THEN now() ELSE submitted_at END,
    accepted_at = CASE WHEN v_next = 'ACCEPTED' THEN now() ELSE accepted_at END,
    accepted_by = CASE WHEN v_next = 'ACCEPTED' THEN v_uid ELSE accepted_by END,
    closed_at = CASE WHEN v_next = 'CLOSED' THEN now() ELSE closed_at END,
    updated_at = now()
  WHERE id = _work_package_id;

  INSERT INTO public.provider_work_package_events(
    work_package_id, from_state, to_state, actor_id, actor_context, note, payload)
  VALUES (_work_package_id, v_wp.state, v_next, v_uid, v_context, _note, COALESCE(_payload,'{}'::jsonb));

  RETURN jsonb_build_object('ok', true, 'from_state', v_wp.state, 'to_state', v_next,
    'actor_context', v_context,
    'is_regulatory_decision', false,
    'is_accepted_supervisory_evidence', (v_next = 'ACCEPTED'));
END;
$$;

REVOKE ALL ON FUNCTION public.provider_work_package_transition(uuid,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_work_package_transition(uuid,text,text,jsonb) TO authenticated, service_role;

-- Task execution-mode resolver used by module UIs to decide outsourcing options.
CREATE OR REPLACE FUNCTION public.regulatory_service_task_execution(_task_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
        'task_id', t.id, 'code', t.code, 'execution_mode', t.execution_mode,
        'may_be_outsourced', t.execution_mode <> 'INTERNAL_ONLY',
        'requires_internal_acceptance', t.requires_internal_acceptance,
        'required_capability_key', t.required_capability_key,
        'permitted_data', t.permitted_data,
        'confers_decision_authority', false)
       FROM public.regulatory_service_tasks t
      WHERE t.id = _task_id AND t.status = 'active'),
    jsonb_build_object('task_id', NULL, 'execution_mode', 'INTERNAL_ONLY',
      'may_be_outsourced', false, 'requires_internal_acceptance', true,
      'confers_decision_authority', false));
$$;

REVOKE ALL ON FUNCTION public.regulatory_service_task_execution(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regulatory_service_task_execution(uuid) TO authenticated, service_role;