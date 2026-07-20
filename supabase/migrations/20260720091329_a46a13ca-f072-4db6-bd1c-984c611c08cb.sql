
ALTER TABLE public.licensees
  ADD COLUMN IF NOT EXISTS lead_regulator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS regulator_officer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS alternate_regulator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.licensees DROP CONSTRAINT IF EXISTS licensees_regulator_assignments_distinct;
ALTER TABLE public.licensees ADD CONSTRAINT licensees_regulator_assignments_distinct CHECK (
  (lead_regulator_id IS NULL OR regulator_officer_id IS NULL OR lead_regulator_id <> regulator_officer_id)
  AND (lead_regulator_id IS NULL OR alternate_regulator_id IS NULL OR lead_regulator_id <> alternate_regulator_id)
  AND (regulator_officer_id IS NULL OR alternate_regulator_id IS NULL OR regulator_officer_id <> alternate_regulator_id)
);

CREATE INDEX IF NOT EXISTS idx_licensees_lead_regulator_id ON public.licensees(lead_regulator_id);
CREATE INDEX IF NOT EXISTS idx_licensees_regulator_officer_id ON public.licensees(regulator_officer_id);
CREATE INDEX IF NOT EXISTS idx_licensees_alternate_regulator_id ON public.licensees(alternate_regulator_id);

INSERT INTO public.permission_actions (module_id, key, label, description, sort_order, is_system, audience)
SELECT pm.id, 'view_all_entities', 'View All Entity Returns',
       'Bypass entity regulator assignment and view submitted returns for all entities.',
       200, false, 'internal'
FROM public.permission_modules pm
WHERE pm.key = 'returns_management'
ON CONFLICT (module_id, key) DO NOTHING;

INSERT INTO public.permissions (module, name, description, action_id)
SELECT 'returns_management', 'view_all_entities',
       'Bypass entity regulator assignment and view submitted returns for all entities.',
       pa.id
FROM public.permission_actions pa
JOIN public.permission_modules pm ON pm.id = pa.module_id
WHERE pm.key = 'returns_management' AND pa.key = 'view_all_entities'
ON CONFLICT (module, name) DO UPDATE
  SET action_id = EXCLUDED.action_id,
      description = EXCLUDED.description;

CREATE OR REPLACE FUNCTION public.can_view_entity_returns(_user_id uuid, _licensee_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned boolean;
BEGIN
  IF _user_id IS NULL OR _licensee_id IS NULL THEN
    RETURN false;
  END IF;
  IF public.has_role(_user_id, 'super_admin'::app_role) THEN
    RETURN true;
  END IF;
  IF public.user_has_permission(_user_id, 'returns_management', 'view_all_entities') THEN
    RETURN true;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.licensees l
    WHERE l.id = _licensee_id
      AND (l.lead_regulator_id = _user_id
        OR l.regulator_officer_id = _user_id
        OR l.alternate_regulator_id = _user_id)
  ) INTO v_assigned;
  RETURN v_assigned;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_entity_returns(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Internal staff view returns for assigned entities" ON public.returns_filed;
CREATE POLICY "Internal staff view returns for assigned entities"
  ON public.returns_filed FOR SELECT TO authenticated
  USING (public.can_view_entity_returns(auth.uid(), entity_id));

DROP POLICY IF EXISTS "Internal staff view return_form_data for assigned entities" ON public.return_form_data;
CREATE POLICY "Internal staff view return_form_data for assigned entities"
  ON public.return_form_data FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.returns_filed r
      WHERE r.id = return_form_data.return_id
        AND public.can_view_entity_returns(auth.uid(), r.entity_id)
    )
  );

DROP POLICY IF EXISTS "Internal staff view return_documents for assigned entities" ON public.return_documents;
CREATE POLICY "Internal staff view return_documents for assigned entities"
  ON public.return_documents FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.returns_filed r
      WHERE r.id = return_documents.return_id
        AND public.can_view_entity_returns(auth.uid(), r.entity_id)
    )
  );

DROP POLICY IF EXISTS "Internal staff view return_upload_attempts for assigned" ON public.return_upload_attempts;
CREATE POLICY "Internal staff view return_upload_attempts for assigned"
  ON public.return_upload_attempts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.returns_filed r
      WHERE r.id = return_upload_attempts.return_id
        AND public.can_view_entity_returns(auth.uid(), r.entity_id)
    )
  );

DROP POLICY IF EXISTS "Internal staff view return_consolidated_analysis for assigned" ON public.return_consolidated_analysis;
CREATE POLICY "Internal staff view return_consolidated_analysis for assigned"
  ON public.return_consolidated_analysis FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.returns_filed r
      WHERE r.id = return_consolidated_analysis.return_id
        AND public.can_view_entity_returns(auth.uid(), r.entity_id)
    )
  );

CREATE OR REPLACE FUNCTION public.audit_licensee_regulator_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed boolean := false;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF COALESCE(OLD.lead_regulator_id::text, '') IS DISTINCT FROM COALESCE(NEW.lead_regulator_id::text, '')
     OR COALESCE(OLD.regulator_officer_id::text, '') IS DISTINCT FROM COALESCE(NEW.regulator_officer_id::text, '')
     OR COALESCE(OLD.alternate_regulator_id::text, '') IS DISTINCT FROM COALESCE(NEW.alternate_regulator_id::text, '')
  THEN
    v_changed := true;
  END IF;

  IF v_changed THEN
    v_old := jsonb_build_object(
      'lead_regulator_id', OLD.lead_regulator_id,
      'regulator_officer_id', OLD.regulator_officer_id,
      'alternate_regulator_id', OLD.alternate_regulator_id
    );
    v_new := jsonb_build_object(
      'lead_regulator_id', NEW.lead_regulator_id,
      'regulator_officer_id', NEW.regulator_officer_id,
      'alternate_regulator_id', NEW.alternate_regulator_id
    );
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
    VALUES (auth.uid(), 'licensee.regulator_assignment.changed', 'licensee', NEW.id::text, v_old, v_new,
            jsonb_build_object('source', 'trigger', 'logged_at', now()));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_licensee_regulator_assignments ON public.licensees;
CREATE TRIGGER trg_audit_licensee_regulator_assignments
  AFTER UPDATE ON public.licensees
  FOR EACH ROW EXECUTE FUNCTION public.audit_licensee_regulator_assignments();
