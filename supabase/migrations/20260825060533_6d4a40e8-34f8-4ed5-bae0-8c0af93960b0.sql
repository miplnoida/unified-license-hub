-- 1. Grace period resolution (mirrors the UI rule in useLicenseStatusGate)
CREATE OR REPLACE FUNCTION public.license_grace_days(
  _sector_id uuid DEFAULT NULL,
  _sub_sector_id uuid DEFAULT NULL,
  _category_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH cfg AS (
    SELECT value FROM public.site_settings WHERE key = 'license_expiry' LIMIT 1
  ),
  rules AS (
    SELECT jsonb_array_elements(
             CASE WHEN jsonb_typeof(COALESCE((SELECT value->'rules' FROM cfg), '[]'::jsonb)) = 'array'
                  THEN (SELECT value->'rules' FROM cfg) ELSE '[]'::jsonb END
           ) AS r
  ),
  matched AS (
    SELECT COALESCE(NULLIF(r->>'grace_period_days','')::int, 0) AS g,
           (CASE WHEN NULLIF(r->>'category_id','')   IS NOT NULL THEN 4 ELSE 0 END)
         + (CASE WHEN NULLIF(r->>'sub_sector_id','') IS NOT NULL THEN 2 ELSE 0 END)
         + (CASE WHEN NULLIF(r->>'sector_id','')     IS NOT NULL THEN 1 ELSE 0 END) AS score
      FROM rules
     WHERE (NULLIF(r->>'sector_id','')     IS NULL OR (r->>'sector_id')::uuid     = _sector_id)
       AND (NULLIF(r->>'sub_sector_id','') IS NULL OR (r->>'sub_sector_id')::uuid = _sub_sector_id)
       AND (NULLIF(r->>'category_id','')   IS NULL OR (r->>'category_id')::uuid   = _category_id)
  )
  SELECT COALESCE(
    (SELECT g FROM matched ORDER BY score DESC LIMIT 1),
    (SELECT COALESCE(NULLIF(value->'default'->>'grace_period_days','')::int, 0) FROM cfg),
    0
  );
$$;

-- 2. Canonical entitlement resolver
CREATE OR REPLACE FUNCTION public.entity_license_entitlements(target_licensee_id uuid DEFAULT NULL)
RETURNS TABLE (
  license_id uuid,
  licensee_id uuid,
  licensee_name text,
  license_number text,
  license_type text,
  status text,
  effective_status text,
  regulator_id uuid,
  sector_id uuid,
  sector_name text,
  sub_sector_id uuid,
  sub_sector_name text,
  category_id uuid,
  category_name text,
  issued_at timestamptz,
  valid_until timestamptz,
  grace_period_days integer,
  grace_ends_on date,
  in_grace_period boolean,
  is_eligible_for_new_activity boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF target_licensee_id IS NOT NULL
     AND NOT public.can_current_user_access_licensee(target_licensee_id, NULL)
     AND NOT public.is_super_admin(v_uid)
     AND NOT public.has_permission(v_uid, 'license_management', 'view') THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH scoped_entities AS (
    SELECT target_licensee_id AS id WHERE target_licensee_id IS NOT NULL
    UNION
    SELECT p.licensee_id FROM public.profiles p
     WHERE target_licensee_id IS NULL AND p.id = v_uid AND p.licensee_id IS NOT NULL
    UNION
    SELECT m.entity_id FROM public.entity_user_memberships m
     WHERE target_licensee_id IS NULL AND m.user_id = v_uid AND m.status = 'APPROVED'
    UNION
    SELECT l.id FROM public.licensees l
     WHERE target_licensee_id IS NULL AND l.applicant_id = v_uid
  ),
  candidate AS (
    -- licences linked to one of the caller's entities
    SELECT lic.*, e.id AS ent_id
      FROM public.licenses lic
      JOIN scoped_entities e ON e.id = lic.holder_id
    UNION
    SELECT lic.*, lse.id AS ent_id
      FROM public.licenses lic
      JOIN public.licensees lse ON lse.license_id = lic.id
      JOIN scoped_entities e ON e.id = lse.id
    UNION
    SELECT lic.*, el.entity_id AS ent_id
      FROM public.licenses lic
      JOIN public.entity_licenses el ON el.license_id = lic.id
      JOIN scoped_entities e ON e.id = el.entity_id
    UNION
    -- licences held personally by the caller (applicant that later got licensed)
    SELECT lic.*, NULL::uuid AS ent_id
      FROM public.licenses lic
     WHERE target_licensee_id IS NULL AND lic.holder_id = v_uid
    UNION
    SELECT lic.*, NULL::uuid AS ent_id
      FROM public.licenses lic
      JOIN public.applications a ON a.id = lic.application_id
     WHERE target_licensee_id IS NULL AND a.applicant_id = v_uid
  ),
  dedup AS (
    SELECT DISTINCT ON (c.id) c.*
      FROM candidate c
     ORDER BY c.id, c.ent_id NULLS LAST
  ),
  computed AS (
    SELECT d.*,
           lower(trim(COALESCE(d.status, ''))) AS norm_status,
           public.license_grace_days(d.sector_id, d.sub_sector_id, d.category_id) AS gdays
      FROM dedup d
  )
  SELECT
    c.id,
    c.ent_id,
    lse.name,
    c.license_number,
    c.license_type,
    c.status,
    CASE
      WHEN c.norm_status IN ('suspended','revoked','cancelled','canceled','inactive','expired') THEN c.norm_status
      WHEN c.valid_until IS NOT NULL
           AND CURRENT_DATE > (c.valid_until::date + c.gdays) THEN 'expired'
      WHEN c.valid_until IS NOT NULL AND CURRENT_DATE > c.valid_until::date THEN 'active_grace'
      WHEN c.norm_status IN ('active','approved','issued','valid','in_good_standing') THEN 'active'
      ELSE COALESCE(NULLIF(c.norm_status,''), 'pending')
    END::text,
    c.regulator_id,
    c.sector_id, s.name,
    c.sub_sector_id, ss.name,
    c.category_id, cat.name,
    c.issued_at,
    c.valid_until,
    c.gdays,
    CASE WHEN c.valid_until IS NOT NULL THEN (c.valid_until::date + c.gdays) ELSE NULL END,
    (c.valid_until IS NOT NULL
      AND CURRENT_DATE > c.valid_until::date
      AND CURRENT_DATE <= (c.valid_until::date + c.gdays)),
    (
      c.norm_status IN ('active','approved','issued','valid','in_good_standing')
      AND (c.valid_until IS NULL OR CURRENT_DATE <= (c.valid_until::date + c.gdays))
    )
    FROM computed c
    LEFT JOIN public.licensees lse ON lse.id = c.ent_id
    LEFT JOIN public.sectors s ON s.id = c.sector_id
    LEFT JOIN public.sub_sectors ss ON ss.id = c.sub_sector_id
    LEFT JOIN public.categories cat ON cat.id = c.category_id
   ORDER BY 20 DESC, c.issued_at DESC NULLS LAST;
END $$;

GRANT EXECUTE ON FUNCTION public.license_grace_days(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_license_entitlements(uuid) TO authenticated;

-- 3. Single write-path predicate
CREATE OR REPLACE FUNCTION public.can_act_on_license(
  _licensee_id uuid,
  _sector_id uuid,
  _sub_sector_id uuid DEFAULT NULL,
  _category_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.entity_license_entitlements(_licensee_id) e
     WHERE e.is_eligible_for_new_activity
       AND (_sector_id IS NULL OR e.sector_id = _sector_id)
       AND (_sub_sector_id IS NULL OR e.sub_sector_id IS NULL OR e.sub_sector_id = _sub_sector_id)
       AND (_category_id IS NULL OR e.category_id IS NULL OR e.category_id = _category_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_act_on_license(uuid, uuid, uuid, uuid) TO authenticated;

-- 4. Enforce entitlement when creating POST-LICENCE drafts
CREATE OR REPLACE FUNCTION public.create_application_draft(_license_type text, _data jsonb DEFAULT '{}'::jsonb, _regulator_id uuid DEFAULT NULL::uuid)
 RETURNS applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_application public.applications;
  v_entity_id uuid;
  v_is_post boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: You must be signed in to create an application draft.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR public.has_permission(v_uid, 'application_management', 'create')
    OR public.has_role(v_uid, 'applicant'::public.app_role)
    OR public.has_role(v_uid, 'pre_licensee'::public.app_role)
    OR public.has_role(v_uid, 'licensee_primary'::public.app_role)
    OR public.has_role(v_uid, 'licensee_secondary'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'APPLICATION_CREATE_FORBIDDEN: You do not have permission to create an application draft.'
      USING ERRCODE = '42501';
  END IF;

  SELECT m.entity_id INTO v_entity_id
    FROM public.entity_user_memberships m
    JOIN public.licensees l ON l.id = m.entity_id
   WHERE m.user_id = v_uid AND m.status = 'APPROVED' AND l.merged_into_entity_id IS NULL
   ORDER BY m.approved_at DESC NULLS LAST
   LIMIT 1;

  IF v_entity_id IS NULL THEN
    SELECT p.licensee_id INTO v_entity_id
      FROM public.profiles p JOIN public.licensees l ON l.id = p.licensee_id
     WHERE p.id = v_uid AND l.merged_into_entity_id IS NULL;
  END IF;

  IF v_entity_id IS NULL THEN
    SELECT l.id INTO v_entity_id
      FROM public.licensees l
     WHERE l.applicant_id = v_uid AND l.merged_into_entity_id IS NULL
     ORDER BY l.created_at
     LIMIT 1;
  END IF;

  -- Post-licence services are entitlements of an existing, eligible licence.
  v_is_post := (NULLIF(_data->>'service_id','') IS NOT NULL)
               OR lower(COALESCE(_data->>'type','')) = 'post_license';

  IF v_is_post AND NOT public.is_super_admin(v_uid)
     AND NOT public.has_permission(v_uid, 'application_management', 'create') THEN
    IF NOT public.can_act_on_license(
         COALESCE(NULLIF(_data->>'licensee_id','')::uuid, v_entity_id),
         NULLIF(_data->>'sector_id','')::uuid,
         NULLIF(_data->>'sub_sector_id','')::uuid,
         NULLIF(_data->>'category_id','')::uuid
       ) THEN
      RAISE EXCEPTION 'LICENSE_ENTITLEMENT_REQUIRED: Post-licence services are only available for a licence that is approved, issued and in good standing for this sector.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.applications (
    applicant_id, license_type, status, data, regulator_id, entity_id
  )
  VALUES (
    v_uid,
    COALESCE(NULLIF(trim(_license_type), ''), 'Application'),
    'draft',
    COALESCE(_data, '{}'::jsonb),
    _regulator_id,
    v_entity_id
  )
  RETURNING * INTO v_application;

  RETURN v_application;
END $function$;