
-- External Portal Access — capability layer for external users (additive)

-- 1) Enum
DO $$ BEGIN
  CREATE TYPE public.portal_area AS ENUM ('licensing','returns','complaints','fp_declarations');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2) Table
CREATE TABLE IF NOT EXISTS public.external_portal_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES public.licensees(id) ON DELETE CASCADE,
  portal_area public.portal_area NOT NULL,
  can_submit boolean NOT NULL DEFAULT false,
  can_upload_documents boolean NOT NULL DEFAULT false,
  can_view_status boolean NOT NULL DEFAULT false,
  can_respond_rfi boolean NOT NULL DEFAULT false,
  can_submit_returns boolean NOT NULL DEFAULT false,
  can_submit_complaints boolean NOT NULL DEFAULT false,
  can_submit_fp_declarations boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique (user, entity, area) — treat NULL entity as a sentinel so applicants without a licensee still get one row per area
CREATE UNIQUE INDEX IF NOT EXISTS uniq_epa_user_entity_area
  ON public.external_portal_access (user_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), portal_area);

CREATE INDEX IF NOT EXISTS idx_epa_user ON public.external_portal_access(user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_epa_entity ON public.external_portal_access(entity_id) WHERE status = 'active';

-- 3) Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_portal_access TO authenticated;
GRANT ALL ON public.external_portal_access TO service_role;

-- 4) Updated-at trigger
CREATE OR REPLACE FUNCTION public.touch_epa_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_epa_touch ON public.external_portal_access;
CREATE TRIGGER trg_epa_touch BEFORE UPDATE ON public.external_portal_access
FOR EACH ROW EXECUTE FUNCTION public.touch_epa_updated_at();

-- 5) Helper: is the user an external role?
CREATE OR REPLACE FUNCTION public.has_external_role(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('applicant'::app_role, 'pre_licensee'::app_role, 'licensee_primary'::app_role, 'licensee_secondary'::app_role)
  );
$$;

-- 6) Helper: capability check
CREATE OR REPLACE FUNCTION public.has_portal_capability(
  _user_id uuid,
  _entity_id uuid,
  _area public.portal_area,
  _capability text
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_row public.external_portal_access%ROWTYPE;
  v_val boolean;
BEGIN
  SELECT * INTO v_row FROM public.external_portal_access
  WHERE user_id = _user_id
    AND portal_area = _area
    AND status = 'active'
    AND (
      (_entity_id IS NULL AND entity_id IS NULL)
      OR entity_id = _entity_id
    )
  LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;

  CASE _capability
    WHEN 'can_submit' THEN v_val := v_row.can_submit;
    WHEN 'can_upload_documents' THEN v_val := v_row.can_upload_documents;
    WHEN 'can_view_status' THEN v_val := v_row.can_view_status;
    WHEN 'can_respond_rfi' THEN v_val := v_row.can_respond_rfi;
    WHEN 'can_submit_returns' THEN v_val := v_row.can_submit_returns;
    WHEN 'can_submit_complaints' THEN v_val := v_row.can_submit_complaints;
    WHEN 'can_submit_fp_declarations' THEN v_val := v_row.can_submit_fp_declarations;
    ELSE v_val := false;
  END CASE;
  RETURN COALESCE(v_val, false);
END $$;

-- 7) Helper: active entity ids for a user (union of entity_user_access + external_portal_access)
CREATE OR REPLACE FUNCTION public.external_user_entity_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT entity_id FROM public.entity_user_access
    WHERE user_id = _user_id AND is_active = true AND entity_id IS NOT NULL
  UNION
  SELECT entity_id FROM public.external_portal_access
    WHERE user_id = _user_id AND status = 'active' AND entity_id IS NOT NULL;
$$;

-- 8) RLS
ALTER TABLE public.external_portal_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "epa_select_self_or_admin" ON public.external_portal_access;
CREATE POLICY "epa_select_self_or_admin" ON public.external_portal_access FOR SELECT
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'super_admin'::app_role)
);

DROP POLICY IF EXISTS "epa_admin_write" ON public.external_portal_access;
CREATE POLICY "epa_admin_write" ON public.external_portal_access FOR ALL
USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'super_admin'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'super_admin'::app_role)
);

-- 9) Audit trigger — logs into existing audit_logs table
CREATE OR REPLACE FUNCTION public.log_external_portal_access_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_action text;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'EXTERNAL_PORTAL_ACCESS_GRANTED';
    v_before := NULL;
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'inactive' AND OLD.status = 'active' THEN
      v_action := 'EXTERNAL_PORTAL_ACCESS_REVOKED';
    ELSE
      v_action := 'EXTERNAL_PORTAL_ACCESS_UPDATED';
    END IF;
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'EXTERNAL_PORTAL_ACCESS_REVOKED';
    v_before := to_jsonb(OLD);
    v_after := NULL;
  END IF;

  BEGIN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (
      auth.uid(),
      v_action,
      'external_portal_access',
      COALESCE(NEW.id, OLD.id),
      v_before,
      v_after
    );
  EXCEPTION WHEN OTHERS THEN
    -- never block the write if audit insert fails
    NULL;
  END;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_epa_audit ON public.external_portal_access;
CREATE TRIGGER trg_epa_audit
AFTER INSERT OR UPDATE OR DELETE ON public.external_portal_access
FOR EACH ROW EXECUTE FUNCTION public.log_external_portal_access_change();

-- 10) Convenience RPC to seed default capabilities for an external user upon registration approval
CREATE OR REPLACE FUNCTION public.seed_external_portal_defaults(
  _user_id uuid,
  _entity_id uuid,
  _role app_role,
  _actor uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _role IN ('applicant'::app_role, 'pre_licensee'::app_role) THEN
    INSERT INTO public.external_portal_access
      (user_id, entity_id, portal_area, can_submit, can_upload_documents, can_view_status, can_respond_rfi, created_by)
    VALUES (_user_id, _entity_id, 'licensing', true, true, true, true, _actor)
    ON CONFLICT (user_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), portal_area) DO UPDATE
      SET can_submit = true, can_upload_documents = true, can_view_status = true, can_respond_rfi = true, status = 'active';
  ELSIF _role = 'licensee_primary'::app_role THEN
    INSERT INTO public.external_portal_access
      (user_id, entity_id, portal_area, can_submit, can_upload_documents, can_view_status, can_respond_rfi, created_by)
    VALUES (_user_id, _entity_id, 'licensing', true, true, true, true, _actor)
    ON CONFLICT (user_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), portal_area) DO UPDATE
      SET can_submit = true, can_upload_documents = true, can_view_status = true, can_respond_rfi = true, status = 'active';

    INSERT INTO public.external_portal_access
      (user_id, entity_id, portal_area, can_submit_returns, can_upload_documents, can_view_status, can_respond_rfi, created_by)
    VALUES (_user_id, _entity_id, 'returns', true, true, true, true, _actor)
    ON CONFLICT (user_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), portal_area) DO UPDATE
      SET can_submit_returns = true, can_upload_documents = true, can_view_status = true, can_respond_rfi = true, status = 'active';

    INSERT INTO public.external_portal_access
      (user_id, entity_id, portal_area, can_submit_complaints, can_upload_documents, can_view_status, created_by)
    VALUES (_user_id, _entity_id, 'complaints', true, true, true, _actor)
    ON CONFLICT (user_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), portal_area) DO UPDATE
      SET can_submit_complaints = true, can_upload_documents = true, can_view_status = true, status = 'active';

    INSERT INTO public.external_portal_access
      (user_id, entity_id, portal_area, can_submit_fp_declarations, can_upload_documents, can_view_status, created_by)
    VALUES (_user_id, _entity_id, 'fp_declarations', true, true, true, _actor)
    ON CONFLICT (user_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), portal_area) DO UPDATE
      SET can_submit_fp_declarations = true, can_upload_documents = true, can_view_status = true, status = 'active';
  END IF;
  -- licensee_secondary: no defaults; admin/primary assigns explicitly
END $$;

GRANT EXECUTE ON FUNCTION public.has_external_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_portal_capability(uuid, uuid, public.portal_area, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_user_entity_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_external_portal_defaults(uuid, uuid, app_role, uuid) TO service_role;
