
-- 1. Enum for access type
DO $$ BEGIN
  CREATE TYPE public.entity_access_type AS ENUM ('primary_user','employee','secondary_contact');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Table
CREATE TABLE IF NOT EXISTS public.entity_user_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  access_type public.entity_access_type NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eua_user ON public.entity_user_access(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_eua_entity ON public.entity_user_access(entity_id) WHERE is_active = true;

-- One active primary per entity
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_primary_per_entity
  ON public.entity_user_access(entity_id)
  WHERE access_type = 'primary_user' AND is_active = true;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_eua_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_eua_touch ON public.entity_user_access;
CREATE TRIGGER trg_eua_touch BEFORE UPDATE ON public.entity_user_access
FOR EACH ROW EXECUTE FUNCTION public.touch_eua_updated_at();

-- 3. RLS
ALTER TABLE public.entity_user_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eua_select" ON public.entity_user_access;
CREATE POLICY "eua_select" ON public.entity_user_access FOR SELECT
USING (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'supervisor'::app_role)
  OR public.has_role(auth.uid(),'licensing_officer'::app_role)
  OR public.has_role(auth.uid(),'analyst'::app_role)
  OR user_id = auth.uid()
  OR entity_id IN (SELECT licensee_id FROM public.profiles WHERE id = auth.uid() AND licensee_id IS NOT NULL)
);

DROP POLICY IF EXISTS "eua_admin_write" ON public.entity_user_access;
CREATE POLICY "eua_admin_write" ON public.entity_user_access FOR ALL
USING (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
);

-- 4. Helper function
CREATE OR REPLACE FUNCTION public.is_primary_user_of(_entity_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entity_user_access
    WHERE entity_id = _entity_id AND user_id = _user_id
      AND access_type = 'primary_user' AND is_active = true
  );
$$;

-- 5. Atomic primary-user reassignment RPC
CREATE OR REPLACE FUNCTION public.assign_primary_user(_entity_id uuid, _user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_existing record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;
  IF NOT (public.has_role(v_uid,'super_admin'::app_role) OR public.has_role(v_uid,'admin'::app_role)) THEN
    RETURN jsonb_build_object('error','Admin only','code','FORBIDDEN','http',403);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = _entity_id) THEN
    RETURN jsonb_build_object('error','Entity not found','code','ENTITY_NOT_FOUND','http',404);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN
    RETURN jsonb_build_object('error','User not found','code','USER_NOT_FOUND','http',404);
  END IF;

  -- Already primary?
  SELECT * INTO v_existing FROM public.entity_user_access
   WHERE entity_id = _entity_id AND access_type='primary_user' AND is_active=true
   FOR UPDATE;

  IF FOUND AND v_existing.user_id = _user_id THEN
    RETURN jsonb_build_object('error','This user is already the active Primary User for this entity.',
      'code','ALREADY_PRIMARY','http',409);
  END IF;

  -- Deactivate previous
  IF FOUND THEN
    UPDATE public.entity_user_access
       SET is_active = false, end_date = v_now
     WHERE id = v_existing.id;
  END IF;

  -- Activate new (re-activate or insert)
  INSERT INTO public.entity_user_access (user_id, entity_id, access_type, is_active, start_date, created_by)
  VALUES (_user_id, _entity_id, 'primary_user', true, v_now, v_uid);

  PERFORM public.create_audit_log(
    v_uid, 'entity_primary_user_assigned', 'licensee', _entity_id::text, NULL,
    jsonb_build_object('new_primary_user_id', _user_id,
                       'previous_primary_user_id', v_existing.user_id),
    NULL
  );

  RETURN jsonb_build_object('success', true, 'http', 200,
    'entity_id', _entity_id, 'user_id', _user_id,
    'previous_user_id', v_existing.user_id);
END;
$$;

-- 6. Backfill from existing profiles.licensee_id + user_type
INSERT INTO public.entity_user_access (user_id, entity_id, access_type, is_active, start_date)
SELECT p.id, p.licensee_id,
       CASE WHEN p.user_type = 'primary' THEN 'primary_user'::public.entity_access_type
            ELSE 'secondary_contact'::public.entity_access_type END,
       (p.status = 'active'),
       COALESCE(p.created_at, now())
  FROM public.profiles p
 WHERE p.licensee_id IS NOT NULL
   AND p.user_type IN ('primary','secondary')
   AND NOT EXISTS (
     SELECT 1 FROM public.entity_user_access e
      WHERE e.user_id = p.id AND e.entity_id = p.licensee_id
   )
ON CONFLICT DO NOTHING;

-- If multiple "primary" rows exist for same entity, keep only one active (the earliest).
WITH ranked AS (
  SELECT id, entity_id,
         row_number() OVER (PARTITION BY entity_id ORDER BY start_date ASC, id ASC) AS rn
    FROM public.entity_user_access
   WHERE access_type = 'primary_user' AND is_active = true
)
UPDATE public.entity_user_access e
   SET is_active = false, end_date = now()
  FROM ranked r
 WHERE e.id = r.id AND r.rn > 1;
