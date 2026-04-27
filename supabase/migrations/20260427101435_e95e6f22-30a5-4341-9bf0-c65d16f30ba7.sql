
-- 1. Acknowledgment metadata on applications
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS ack_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ack_at timestamptz,
  ADD COLUMN IF NOT EXISTS ack_text text;

-- 2. Ack metadata + on_behalf_of on compliance_returns
ALTER TABLE public.compliance_returns
  ADD COLUMN IF NOT EXISTS ack_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ack_at timestamptz,
  ADD COLUMN IF NOT EXISTS ack_text text,
  ADD COLUMN IF NOT EXISTS on_behalf_of_licensee_id uuid REFERENCES public.licenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_compliance_returns_on_behalf_of
  ON public.compliance_returns(on_behalf_of_licensee_id);

-- 3. delegated_from on approval_actions (mirror of delegated_to)
ALTER TABLE public.approval_actions
  ADD COLUMN IF NOT EXISTS delegated_from uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. Server-side duplicate-application guard
CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sector_id uuid;
  v_existing_id uuid;
  v_allow_reapply boolean;
BEGIN
  -- Only enforce on submission transition (insert into non-draft, or update to submitted/in-progress states)
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('draft','cancelled','rejected','withdrawn') THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only check when transitioning into an active/submitted state
    IF NEW.status = OLD.status THEN RETURN NEW; END IF;
    IF NEW.status IN ('draft','cancelled','rejected','withdrawn') THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Admins/super_admins bypass
  IF public.has_role(auth.uid(), 'super_admin'::app_role)
     OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Honor global allow-reapplication setting if set true
  SELECT (value::text)::boolean INTO v_allow_reapply
  FROM public.site_settings
  WHERE key = 'allow_reapplication'
  LIMIT 1;

  IF COALESCE(v_allow_reapply, false) THEN
    RETURN NEW;
  END IF;

  -- Extract sector from JSONB data
  v_sector_id := NULLIF(NEW.data->>'sector_id','')::uuid;
  IF v_sector_id IS NULL THEN
    RETURN NEW; -- nothing to compare against
  END IF;

  -- Find any other active application by same applicant for same sector
  SELECT id INTO v_existing_id
  FROM public.applications
  WHERE applicant_id = NEW.applicant_id
    AND id <> NEW.id
    AND COALESCE((data->>'sector_id'),'') = v_sector_id::text
    AND status NOT IN ('draft','cancelled','rejected','withdrawn')
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_SECTOR_APPLICATION: An active application already exists for this sector (id=%). Re-apply is allowed only after cancellation, rejection, or withdrawal.', v_existing_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_active_application ON public.applications;
CREATE TRIGGER trg_prevent_duplicate_active_application
BEFORE INSERT OR UPDATE OF status, data ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_active_application();

-- 5. Delegation auto-expiry helper (callable from cron / edge fn / manually)
CREATE OR REPLACE FUNCTION public.expire_delegation_rules()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.delegation_rules
  SET is_active = false
  WHERE is_active = true
    AND effective_until IS NOT NULL
    AND effective_until < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_delegation_rules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_delegation_rules() TO authenticated, service_role;
