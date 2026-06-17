
CREATE TABLE IF NOT EXISTS public.external_portal_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  applies_to_roles text[] NOT NULL DEFAULT ARRAY[]::text[],
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_portal_roles TO authenticated;
GRANT ALL ON public.external_portal_roles TO service_role;
ALTER TABLE public.external_portal_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "epr read all auth" ON public.external_portal_roles;
CREATE POLICY "epr read all auth" ON public.external_portal_roles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "epr admin manage" ON public.external_portal_roles;
CREATE POLICY "epr admin manage" ON public.external_portal_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.external_portal_role_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_role_id uuid NOT NULL REFERENCES public.external_portal_roles(id) ON DELETE CASCADE,
  portal_area portal_area NOT NULL,
  can_submit boolean NOT NULL DEFAULT false,
  can_upload_documents boolean NOT NULL DEFAULT false,
  can_view_status boolean NOT NULL DEFAULT false,
  can_respond_rfi boolean NOT NULL DEFAULT false,
  can_submit_returns boolean NOT NULL DEFAULT false,
  can_submit_complaints boolean NOT NULL DEFAULT false,
  can_submit_fp_declarations boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(external_role_id, portal_area)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_portal_role_capabilities TO authenticated;
GRANT ALL ON public.external_portal_role_capabilities TO service_role;
ALTER TABLE public.external_portal_role_capabilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "eprc read all auth" ON public.external_portal_role_capabilities;
CREATE POLICY "eprc read all auth" ON public.external_portal_role_capabilities FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "eprc admin manage" ON public.external_portal_role_capabilities;
CREATE POLICY "eprc admin manage" ON public.external_portal_role_capabilities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.external_user_portal_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_id uuid REFERENCES public.licensees(id) ON DELETE CASCADE,
  external_role_id uuid NOT NULL REFERENCES public.external_portal_roles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS eupr_uniq_idx
  ON public.external_user_portal_roles (user_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), external_role_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_user_portal_roles TO authenticated;
GRANT ALL ON public.external_user_portal_roles TO service_role;
ALTER TABLE public.external_user_portal_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "eupr self read" ON public.external_user_portal_roles;
CREATE POLICY "eupr self read" ON public.external_user_portal_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "eupr admin manage" ON public.external_user_portal_roles;
CREATE POLICY "eupr admin manage" ON public.external_user_portal_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_epr_updated_at ON public.external_portal_roles;
CREATE TRIGGER trg_epr_updated_at BEFORE UPDATE ON public.external_portal_roles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_eprc_updated_at ON public.external_portal_role_capabilities;
CREATE TRIGGER trg_eprc_updated_at BEFORE UPDATE ON public.external_portal_role_capabilities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_eupr_updated_at ON public.external_user_portal_roles;
CREATE TRIGGER trg_eupr_updated_at BEFORE UPDATE ON public.external_user_portal_roles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.external_portal_roles (role_key, name, description, applies_to_roles, is_system, is_active)
VALUES (
  'applicant_regulated_entity_user',
  'Applicant / Regulated Entity User',
  'Default external portal role. Grants licensing, returns, complaints and F&P portal capabilities, scoped to the user''s own entity. Cannot access internal workflow, findings, audit logs, reports or admin settings.',
  ARRAY['applicant','pre_licensee','licensee_primary','licensee_secondary'],
  true, true
)
ON CONFLICT (role_key) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  applies_to_roles = EXCLUDED.applies_to_roles, is_system = true, is_active = true, updated_at = now();

WITH r AS (SELECT id FROM public.external_portal_roles WHERE role_key='applicant_regulated_entity_user')
INSERT INTO public.external_portal_role_capabilities
  (external_role_id, portal_area, can_submit, can_upload_documents, can_view_status, can_respond_rfi,
   can_submit_returns, can_submit_complaints, can_submit_fp_declarations)
SELECT r.id, area::portal_area,
       (area='licensing'), true, true,
       (area IN ('licensing','returns')),
       (area='returns'), (area='complaints'), (area='fp_declarations')
FROM r, (VALUES ('licensing'),('returns'),('complaints'),('fp_declarations')) AS t(area)
ON CONFLICT (external_role_id, portal_area) DO UPDATE SET
  can_submit = EXCLUDED.can_submit, can_upload_documents = EXCLUDED.can_upload_documents,
  can_view_status = EXCLUDED.can_view_status, can_respond_rfi = EXCLUDED.can_respond_rfi,
  can_submit_returns = EXCLUDED.can_submit_returns, can_submit_complaints = EXCLUDED.can_submit_complaints,
  can_submit_fp_declarations = EXCLUDED.can_submit_fp_declarations, updated_at = now();

CREATE OR REPLACE FUNCTION public.has_portal_capability(_user_id uuid, _entity_id uuid, _area portal_area, _capability text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id AND NOT public.is_internal_staff_user(auth.uid()) THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.external_user_portal_roles a
    JOIN public.external_portal_roles r ON r.id = a.external_role_id AND r.is_active = true
    JOIN public.external_portal_role_capabilities c ON c.external_role_id = r.id AND c.portal_area = _area
    WHERE a.user_id = _user_id AND a.status = 'active'
      AND (_entity_id IS NULL OR a.entity_id IS NULL OR a.entity_id = _entity_id)
      AND CASE _capability
        WHEN 'can_submit' THEN c.can_submit
        WHEN 'can_upload_documents' THEN c.can_upload_documents
        WHEN 'can_view_status' THEN c.can_view_status
        WHEN 'can_respond_rfi' THEN c.can_respond_rfi
        WHEN 'can_submit_returns' THEN c.can_submit_returns
        WHEN 'can_submit_complaints' THEN c.can_submit_complaints
        WHEN 'can_submit_fp_declarations' THEN c.can_submit_fp_declarations
        ELSE false END
  ) THEN RETURN true; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.external_portal_access epa
    WHERE epa.user_id = _user_id AND epa.portal_area = _area AND epa.status = 'active'
      AND (_entity_id IS NULL OR epa.entity_id = _entity_id)
      AND CASE _capability
        WHEN 'can_submit' THEN epa.can_submit
        WHEN 'can_upload_documents' THEN epa.can_upload_documents
        WHEN 'can_view_status' THEN epa.can_view_status
        WHEN 'can_respond_rfi' THEN epa.can_respond_rfi
        WHEN 'can_submit_returns' THEN epa.can_submit_returns
        WHEN 'can_submit_complaints' THEN epa.can_submit_complaints
        WHEN 'can_submit_fp_declarations' THEN epa.can_submit_fp_declarations
        ELSE false END
  );
END; $function$;

CREATE OR REPLACE FUNCTION public.seed_external_portal_defaults(_user_id uuid, _entity_id uuid, _role app_role, _actor uuid DEFAULT NULL::uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_template_id uuid;
BEGIN
  IF _role IN ('applicant'::app_role, 'pre_licensee'::app_role) THEN
    INSERT INTO public.external_portal_access (user_id, entity_id, portal_area, can_submit, can_upload_documents, can_view_status, can_respond_rfi, created_by)
    VALUES (_user_id, _entity_id, 'licensing', true, true, true, true, _actor)
    ON CONFLICT (user_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), portal_area) DO UPDATE
      SET can_submit=true, can_upload_documents=true, can_view_status=true, can_respond_rfi=true, status='active', updated_at=now();
  ELSIF _role = 'licensee_primary'::app_role THEN
    INSERT INTO public.external_portal_access (user_id, entity_id, portal_area, can_submit, can_upload_documents, can_view_status, can_respond_rfi, created_by)
    VALUES (_user_id, _entity_id, 'licensing', true, true, true, true, _actor)
    ON CONFLICT (user_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), portal_area) DO UPDATE
      SET can_submit=true, can_upload_documents=true, can_view_status=true, can_respond_rfi=true, status='active', updated_at=now();
    INSERT INTO public.external_portal_access (user_id, entity_id, portal_area, can_submit_returns, can_upload_documents, can_view_status, can_respond_rfi, created_by)
    VALUES (_user_id, _entity_id, 'returns', true, true, true, true, _actor)
    ON CONFLICT (user_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), portal_area) DO UPDATE
      SET can_submit_returns=true, can_upload_documents=true, can_view_status=true, can_respond_rfi=true, status='active', updated_at=now();
    INSERT INTO public.external_portal_access (user_id, entity_id, portal_area, can_submit_complaints, can_upload_documents, can_view_status, created_by)
    VALUES (_user_id, _entity_id, 'complaints', true, true, true, _actor)
    ON CONFLICT (user_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), portal_area) DO UPDATE
      SET can_submit_complaints=true, can_upload_documents=true, can_view_status=true, status='active', updated_at=now();
    INSERT INTO public.external_portal_access (user_id, entity_id, portal_area, can_submit_fp_declarations, can_upload_documents, can_view_status, created_by)
    VALUES (_user_id, _entity_id, 'fp_declarations', true, true, true, _actor)
    ON CONFLICT (user_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), portal_area) DO UPDATE
      SET can_submit_fp_declarations=true, can_upload_documents=true, can_view_status=true, status='active', updated_at=now();
  END IF;

  IF _role IN ('applicant'::app_role, 'pre_licensee'::app_role, 'licensee_primary'::app_role, 'licensee_secondary'::app_role) THEN
    SELECT id INTO v_template_id FROM public.external_portal_roles WHERE role_key = 'applicant_regulated_entity_user' LIMIT 1;
    IF v_template_id IS NOT NULL THEN
      IF _entity_id IS NOT NULL THEN
        UPDATE public.external_user_portal_roles
          SET entity_id = _entity_id, status='active', updated_at=now()
          WHERE user_id = _user_id AND external_role_id = v_template_id AND entity_id IS NULL;
      END IF;
      INSERT INTO public.external_user_portal_roles (user_id, entity_id, external_role_id, status, assigned_by)
      VALUES (_user_id, _entity_id, v_template_id, 'active', _actor)
      ON CONFLICT (user_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), external_role_id)
      DO UPDATE SET status='active', updated_at=now();
    END IF;
  END IF;
END; $function$;

DO $$
DECLARE v_template_id uuid;
BEGIN
  SELECT id INTO v_template_id FROM public.external_portal_roles WHERE role_key = 'applicant_regulated_entity_user' LIMIT 1;
  IF v_template_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.external_user_portal_roles (user_id, entity_id, external_role_id, status, assigned_by, assigned_at)
  SELECT DISTINCT epa.user_id, epa.entity_id, v_template_id, 'active', epa.created_by, COALESCE(epa.created_at, now())
  FROM public.external_portal_access epa WHERE epa.status = 'active'
  ON CONFLICT (user_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), external_role_id) DO NOTHING;
END $$;
