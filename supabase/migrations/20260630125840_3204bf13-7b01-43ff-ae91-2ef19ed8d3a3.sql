
-- 1. Flag on approval_steps
ALTER TABLE public.approval_steps
  ADD COLUMN IF NOT EXISTS is_legal_compliance_stage boolean NOT NULL DEFAULT false;

-- 2. Ensure canonical Legal/Compliance Reviewer role exists
INSERT INTO public.roles (name, description, system_role, is_system, role_type)
SELECT 'Legal/Compliance Reviewer', 'Reviews applications for legal and compliance concerns', 'analyst', true, 'internal'
WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE name = 'Legal/Compliance Reviewer');

-- 3. Helper: is the user a legal/compliance reviewer?
CREATE OR REPLACE FUNCTION public.is_legal_compliance_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_dynamic_roles udr
    JOIN public.roles r ON r.id = udr.role_id
    WHERE udr.user_id = _user_id
      AND r.name IN ('Legal/Compliance Reviewer', 'Legal / Compliance Reviewer')
  )
$$;

-- 4. Helper: can the user view legal notes for an application?
CREATE OR REPLACE FUNCTION public.can_view_application_legal_notes(_user_id uuid, _application_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_workflow_id uuid;
  v_step_id uuid;
BEGIN
  IF _user_id IS NULL OR _application_id IS NULL THEN
    RETURN false;
  END IF;

  -- super_admin / admin / legal reviewers
  IF public.has_role(_user_id, 'super_admin'::app_role)
     OR public.has_role(_user_id, 'admin'::app_role)
     OR public.is_legal_compliance_user(_user_id) THEN
    RETURN true;
  END IF;

  -- Internal user who can act on any step of the application's workflow
  SELECT wi.workflow_id INTO v_workflow_id
  FROM public.workflow_instances wi
  WHERE wi.entity_type = 'application'
    AND wi.entity_id = _application_id
  ORDER BY wi.created_at DESC
  LIMIT 1;

  IF v_workflow_id IS NULL THEN
    RETURN false;
  END IF;

  FOR v_step_id IN
    SELECT id FROM public.approval_steps WHERE workflow_id = v_workflow_id
  LOOP
    BEGIN
      IF ((public.user_can_act_on_workflow_step(_user_id, v_step_id))->>'can_act')::boolean THEN
        RETURN true;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- ignore evaluation errors, keep checking
      NULL;
    END;
  END LOOP;

  RETURN false;
END;
$$;

-- 5. application_legal_notes table
CREATE TABLE IF NOT EXISTS public.application_legal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL,
  workflow_instance_id uuid,
  step_id uuid REFERENCES public.approval_steps(id) ON DELETE SET NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  note_text text NOT NULL,
  has_legal_concern boolean NOT NULL DEFAULT false,
  concern_severity text CHECK (concern_severity IN ('low','medium','high','critical')),
  recommended_conditions text,
  recommendation text NOT NULL CHECK (recommendation IN ('no_objection','approve_with_conditions','request_more_information','escalate','reject')),
  restricted boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_application_legal_notes_application ON public.application_legal_notes(application_id);
CREATE INDEX IF NOT EXISTS idx_application_legal_notes_instance ON public.application_legal_notes(workflow_instance_id);

GRANT SELECT, INSERT, UPDATE ON public.application_legal_notes TO authenticated;
GRANT ALL ON public.application_legal_notes TO service_role;

ALTER TABLE public.application_legal_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "legal_notes_select" ON public.application_legal_notes;
CREATE POLICY "legal_notes_select" ON public.application_legal_notes
  FOR SELECT TO authenticated
  USING (public.can_view_application_legal_notes(auth.uid(), application_id));

DROP POLICY IF EXISTS "legal_notes_insert" ON public.application_legal_notes;
CREATE POLICY "legal_notes_insert" ON public.application_legal_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND public.is_legal_compliance_user(auth.uid())
    AND step_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.approval_steps s
      WHERE s.id = step_id AND s.is_legal_compliance_stage = true
    )
  );

DROP POLICY IF EXISTS "legal_notes_update_own" ON public.application_legal_notes;
CREATE POLICY "legal_notes_update_own" ON public.application_legal_notes
  FOR UPDATE TO authenticated
  USING (actor_id = auth.uid() AND public.is_legal_compliance_user(auth.uid()))
  WITH CHECK (actor_id = auth.uid() AND public.is_legal_compliance_user(auth.uid()));

-- updated_at trigger (reuse generic helper if present)
CREATE OR REPLACE FUNCTION public.tg_set_updated_at_legal_notes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_legal_notes_updated_at ON public.application_legal_notes;
CREATE TRIGGER trg_legal_notes_updated_at
  BEFORE UPDATE ON public.application_legal_notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at_legal_notes();

-- 6. Audit denial helper + RPC for read-side denial logging
CREATE OR REPLACE FUNCTION public.log_restricted_legal_note_denial(
  _application_id uuid,
  _note_id uuid,
  _reason text,
  _source text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'restricted_legal_note_access_denied',
    'application_legal_note',
    COALESCE(_note_id::text, _application_id::text),
    jsonb_build_object(
      'user_id', auth.uid(),
      'application_id', _application_id,
      'note_id', _note_id,
      'reason', _reason,
      'source', _source,
      'timestamp', now()
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_restricted_legal_note_denial(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_legal_compliance_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_application_legal_notes(uuid, uuid) TO authenticated;

-- RPC the UI calls to gate the section + auto-log denials
CREATE OR REPLACE FUNCTION public.request_legal_notes_access(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  v_allowed := public.can_view_application_legal_notes(auth.uid(), _application_id);
  IF NOT v_allowed THEN
    PERFORM public.log_restricted_legal_note_denial(_application_id, NULL, 'view_denied', 'request_legal_notes_access');
  END IF;
  RETURN jsonb_build_object('allowed', v_allowed);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_legal_notes_access(uuid) TO authenticated;

-- 7. BEFORE INSERT trigger to log write denials before RLS surfaces an opaque error
CREATE OR REPLACE FUNCTION public.tg_legal_notes_audit_unauthorized_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_legal_compliance_user(auth.uid()) THEN
    PERFORM public.log_restricted_legal_note_denial(NEW.application_id, NULL, 'write_denied_not_legal_role', 'application_legal_notes_insert');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_legal_notes_audit_unauthorized ON public.application_legal_notes;
CREATE TRIGGER trg_legal_notes_audit_unauthorized
  BEFORE INSERT ON public.application_legal_notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_legal_notes_audit_unauthorized_insert();
