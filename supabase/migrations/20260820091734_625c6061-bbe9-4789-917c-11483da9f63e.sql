CREATE TABLE IF NOT EXISTS public.registry_publication_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  publish_entity boolean NOT NULL DEFAULT true,
  requires_authorised_licence boolean NOT NULL DEFAULT true,
  publish_licences boolean NOT NULL DEFAULT true,
  publish_status boolean NOT NULL DEFAULT true,
  publish_enforcement boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.registry_publication_policies TO authenticated;
GRANT SELECT ON public.registry_publication_policies TO anon;
GRANT ALL ON public.registry_publication_policies TO service_role;
ALTER TABLE public.registry_publication_policies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='registry_publication_policies' AND policyname='rpp_read') THEN
    CREATE POLICY rpp_read ON public.registry_publication_policies FOR SELECT USING (true);
  END IF;
END $$;

INSERT INTO public.registry_publication_policies
  (key, label, description, publish_entity, requires_authorised_licence, publish_licences, publish_status, publish_enforcement, is_default, is_system, sort_order)
VALUES
  ('PUBLIC_AFTER_AUTHORISATION','Public after authorisation','Entity appears in the public register only once it holds at least one authorised licence.',true,true,true,true,false,true,true,10),
  ('PUBLIC','Public','Entity is publishable regardless of licence state (registered, non-licensed entities).',true,false,true,true,false,false,true,20),
  ('PUBLIC_LIMITED','Public (limited)','Entity name and sector only — licence detail withheld.',true,true,false,true,false,false,true,30),
  ('NOT_PUBLISHED','Not published','Entity is never published in the public register.',false,true,false,false,false,false,true,40)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.licensees
  ADD COLUMN IF NOT EXISTS publication_policy_id uuid REFERENCES public.registry_publication_policies(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS public_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS licensees_public_slug_key ON public.licensees(public_slug) WHERE public_slug IS NOT NULL;

CREATE OR REPLACE FUNCTION public.entity_public_slug_assign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base text; candidate text; n int := 0;
BEGIN
  IF NEW.publication_policy_id IS NULL THEN
    SELECT id INTO NEW.publication_policy_id FROM public.registry_publication_policies WHERE is_default AND is_active LIMIT 1;
  END IF;
  IF NEW.public_slug IS NULL THEN
    base := trim(both '-' from COALESCE(NULLIF(regexp_replace(lower(COALESCE(NEW.name,'entity')), '[^a-z0-9]+', '-', 'g'),''),'entity'));
    candidate := left(base, 60);
    WHILE EXISTS (SELECT 1 FROM public.licensees WHERE public_slug = candidate) LOOP
      n := n + 1;
      candidate := left(base, 55) || '-' || n::text;
    END LOOP;
    NEW.public_slug := candidate;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_entity_public_slug ON public.licensees;
CREATE TRIGGER trg_entity_public_slug BEFORE INSERT OR UPDATE OF name ON public.licensees
FOR EACH ROW EXECUTE FUNCTION public.entity_public_slug_assign();

DO $$
DECLARE r record; base text; candidate text; n int;
BEGIN
  FOR r IN SELECT id, name FROM public.licensees WHERE public_slug IS NULL LOOP
    base := trim(both '-' from COALESCE(NULLIF(regexp_replace(lower(COALESCE(r.name,'entity')), '[^a-z0-9]+', '-', 'g'),''),'entity'));
    candidate := left(base, 60); n := 0;
    WHILE EXISTS (SELECT 1 FROM public.licensees WHERE public_slug = candidate) LOOP
      n := n + 1; candidate := left(base,55) || '-' || n::text;
    END LOOP;
    UPDATE public.licensees SET public_slug = candidate WHERE id = r.id;
  END LOOP;
  UPDATE public.licensees l SET publication_policy_id = (SELECT id FROM public.registry_publication_policies WHERE is_default AND is_active LIMIT 1)
   WHERE l.publication_policy_id IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public.public_entity_register_search(_criteria jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q text := btrim(COALESCE(_criteria->>'query',''));
  v_sector uuid := NULLIF(_criteria->>'sector_id','')::uuid;
  lim int := LEAST(COALESCE((_criteria->>'limit')::int, 50), 200);
  off int := GREATEST(COALESCE((_criteria->>'offset')::int, 0), 0);
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY x->>'legal_name')
    FROM (
      SELECT jsonb_build_object(
        'slug', l.public_slug,
        'legal_name', COALESCE(o.legal_name, l.name),
        'trading_name', o.display_name,
        'sector', s.name,
        'entity_status', CASE WHEN p.publish_status THEN l.status ELSE NULL END,
        'licence_count', (
          SELECT count(*) FROM public.entity_licenses el WHERE el.entity_id = l.id
            AND (el.effective_to IS NULL OR el.effective_to > now())),
        'licences', CASE WHEN p.publish_licences THEN COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'license_number', lic.license_number,
                   'license_type', lic.license_type,
                   'status', lic.status,
                   'valid_from', lic.valid_from,
                   'valid_until', lic.valid_until,
                   'is_primary', el.is_primary)
                 ORDER BY el.is_primary DESC, lic.license_number)
            FROM public.entity_licenses el
            JOIN public.licenses lic ON lic.id = el.license_id
           WHERE el.entity_id = l.id
             AND (el.effective_to IS NULL OR el.effective_to > now())
             AND lower(COALESCE(lic.status,'')) IN ('active','approved','issued','renewed')
        ), '[]'::jsonb) ELSE '[]'::jsonb END,
        'publication_policy', p.key
      ) AS x
      FROM public.licensees l
      JOIN public.registry_publication_policies p ON p.id = l.publication_policy_id
      LEFT JOIN public.organizations o ON o.party_id = l.party_id
      LEFT JOIN public.sectors s ON s.id = l.sector_id
      WHERE l.merged_into_entity_id IS NULL
        AND p.is_active AND p.publish_entity
        AND (NOT p.requires_authorised_licence OR EXISTS (
              SELECT 1 FROM public.entity_licenses el
              JOIN public.licenses lic ON lic.id = el.license_id
              WHERE el.entity_id = l.id
                AND (el.effective_to IS NULL OR el.effective_to > now())
                AND lower(COALESCE(lic.status,'')) IN ('active','approved','issued','renewed')))
        AND (v_sector IS NULL OR l.sector_id = v_sector)
        AND (q = '' OR COALESCE(o.legal_name, l.name) ILIKE '%'||q||'%' OR COALESCE(o.display_name,'') ILIKE '%'||q||'%')
      ORDER BY COALESCE(o.legal_name, l.name)
      LIMIT lim OFFSET off
    ) t
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.public_entity_register_detail(_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_out jsonb;
BEGIN
  SELECT jsonb_build_object(
    'found', true,
    'slug', l.public_slug,
    'legal_name', COALESCE(o.legal_name, l.name),
    'trading_name', o.display_name,
    'sector', s.name,
    'entity_status', CASE WHEN p.publish_status THEN l.status ELSE NULL END,
    'publication_policy', p.key,
    'publication_policy_label', p.label,
    'licences', CASE WHEN p.publish_licences THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'license_number', lic.license_number,
                 'license_type', lic.license_type,
                 'status', lic.status,
                 'valid_from', lic.valid_from,
                 'valid_until', lic.valid_until,
                 'is_primary', el.is_primary,
                 'conditions', lic.conditions)
               ORDER BY el.is_primary DESC, lic.license_number)
          FROM public.entity_licenses el
          JOIN public.licenses lic ON lic.id = el.license_id
         WHERE el.entity_id = l.id
           AND (el.effective_to IS NULL OR el.effective_to > now())
           AND lower(COALESCE(lic.status,'')) IN ('active','approved','issued','renewed')
      ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'former_names', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('name', sn.snapshot_data->>'legal_name', 'recorded_at', sn.captured_at)
                         ORDER BY sn.captured_at DESC)
          FROM public.entity_identity_snapshots sn
         WHERE sn.entity_id = l.id
           AND COALESCE(sn.snapshot_data->>'legal_name','') <> ''
           AND sn.snapshot_data->>'legal_name' IS DISTINCT FROM COALESCE(o.legal_name, l.name)
      ), '[]'::jsonb),
    'enforcement', CASE WHEN p.publish_enforcement THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object('enforcement_type', ea.enforcement_type, 'status', ea.status, 'date_opened', ea.date_opened)
                         ORDER BY ea.date_opened DESC)
          FROM public.enforcement_actions ea WHERE ea.entity_id = l.id
      ), '[]'::jsonb) ELSE '[]'::jsonb END
  ) INTO v_out
  FROM public.licensees l
  JOIN public.registry_publication_policies p ON p.id = l.publication_policy_id
  LEFT JOIN public.organizations o ON o.party_id = l.party_id
  LEFT JOIN public.sectors s ON s.id = l.sector_id
  WHERE l.public_slug = _slug
    AND l.merged_into_entity_id IS NULL
    AND p.is_active AND p.publish_entity
    AND (NOT p.requires_authorised_licence OR EXISTS (
          SELECT 1 FROM public.entity_licenses el
          JOIN public.licenses lic ON lic.id = el.license_id
          WHERE el.entity_id = l.id
            AND (el.effective_to IS NULL OR el.effective_to > now())
            AND lower(COALESCE(lic.status,'')) IN ('active','approved','issued','renewed')));

  RETURN COALESCE(v_out, jsonb_build_object('found', false));
END $$;

REVOKE ALL ON FUNCTION public.public_entity_register_search(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_entity_register_detail(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_entity_register_search(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_entity_register_detail(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.entity_set_publication_policy(_entity_id uuid, _policy_key text, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_policy uuid; v_old uuid;
BEGIN
  IF NOT public.sec_has_permission(auth.uid(), 'licensee_management', 'edit') THEN
    RAISE EXCEPTION 'licensee_management.edit required' USING ERRCODE='42501';
  END IF;
  SELECT id INTO v_policy FROM public.registry_publication_policies WHERE key = _policy_key AND is_active;
  IF v_policy IS NULL THEN RAISE EXCEPTION 'Unknown publication policy %', _policy_key USING ERRCODE='22023'; END IF;
  SELECT publication_policy_id INTO v_old FROM public.licensees WHERE id = _entity_id;
  UPDATE public.licensees SET publication_policy_id = v_policy, updated_at = now() WHERE id = _entity_id;
  PERFORM public.create_audit_log(auth.uid(), 'entity.publication_policy.changed', 'licensee', _entity_id::text,
    jsonb_build_object('policy_id', v_old), jsonb_build_object('policy_key', _policy_key, 'reason', _reason), '{}'::jsonb);
  RETURN jsonb_build_object('entity_id', _entity_id, 'publication_policy', _policy_key);
END $$;

REVOKE ALL ON FUNCTION public.entity_set_publication_policy(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.entity_set_publication_policy(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.wb_onboarding_provision_entity(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  v_name text := btrim(COALESCE(_payload->>'legal_name',''));
  v_entity uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'legal_name is required' USING ERRCODE='22023'; END IF;

  v_entity := public.entity_create_local(
    v_name,
    COALESCE(_payload->'identifiers','[]'::jsonb),
    NULLIF(_payload->>'sector_id','')::uuid,
    COALESCE(NULLIF(_payload->>'lifecycle_key',''), 'pre_authorisation'),
    COALESCE(NULLIF(_payload->>'identity_status_key',''), 'provisional'),
    NULLIF(_payload->>'case_id','')::uuid
  );

  PERFORM public.create_audit_log(uid, 'entity.onboarding.provisioned', 'licensee', v_entity::text,
    NULL, jsonb_build_object('legal_name', v_name, 'origin','public_onboarding'), '{}'::jsonb);

  RETURN jsonb_build_object('entity_id', v_entity, 'outcome', 'PROVISIONED');
END $$;

REVOKE ALL ON FUNCTION public.wb_onboarding_provision_entity(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wb_onboarding_provision_entity(jsonb) TO authenticated;