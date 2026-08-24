-- =========================================================
-- REGCLASS-001 : Governed regulatory classification model
-- =========================================================

CREATE TABLE IF NOT EXISTS public.regulatory_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_code text NOT NULL,
  jurisdiction_name text NOT NULL,
  regulator_id uuid REFERENCES public.regulators(id),
  regulator_name text NOT NULL,
  classification_pack text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  is_current boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS regulatory_profiles_pack_uniq
  ON public.regulatory_profiles (jurisdiction_code, classification_pack);
CREATE UNIQUE INDEX IF NOT EXISTS regulatory_profiles_one_current
  ON public.regulatory_profiles ((is_current)) WHERE is_current;
GRANT SELECT ON public.regulatory_profiles TO authenticated, anon;
GRANT ALL ON public.regulatory_profiles TO service_role;
ALTER TABLE public.regulatory_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS regulatory_profiles_read ON public.regulatory_profiles;
CREATE POLICY regulatory_profiles_read ON public.regulatory_profiles FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.common_sector_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','disabled','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS common_sector_families_code_uniq
  ON public.common_sector_families (upper(btrim(code)));
GRANT SELECT ON public.common_sector_families TO authenticated, anon;
GRANT ALL ON public.common_sector_families TO service_role;
ALTER TABLE public.common_sector_families ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS common_sector_families_read ON public.common_sector_families;
CREATE POLICY common_sector_families_read ON public.common_sector_families FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.regulated_activity_catalogue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text NOT NULL,
  description text,
  family_code text,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','disabled','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS regulated_activity_code_uniq
  ON public.regulated_activity_catalogue (upper(btrim(code)));
CREATE UNIQUE INDEX IF NOT EXISTS regulated_activity_name_uniq
  ON public.regulated_activity_catalogue (lower(regexp_replace(btrim(label), '\s+', ' ', 'g')));
GRANT SELECT ON public.regulated_activity_catalogue TO authenticated, anon;
GRANT ALL ON public.regulated_activity_catalogue TO service_role;
ALTER TABLE public.regulated_activity_catalogue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS regulated_activity_read ON public.regulated_activity_catalogue;
CREATE POLICY regulated_activity_read ON public.regulated_activity_catalogue FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.subject_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','disabled','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subject_forms_code_uniq
  ON public.subject_forms (upper(btrim(code)));
CREATE UNIQUE INDEX IF NOT EXISTS subject_forms_name_uniq
  ON public.subject_forms (lower(regexp_replace(btrim(label), '\s+', ' ', 'g')));
GRANT SELECT ON public.subject_forms TO authenticated, anon;
GRANT ALL ON public.subject_forms TO service_role;
ALTER TABLE public.subject_forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subject_forms_read ON public.subject_forms;
CREATE POLICY subject_forms_read ON public.subject_forms FOR SELECT USING (true);

-- local sector = public.sectors (history preserving); add classification columns
ALTER TABLE public.sectors ADD COLUMN IF NOT EXISTS family_code text;
ALTER TABLE public.sectors ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.regulatory_profiles(id);
ALTER TABLE public.sectors ADD COLUMN IF NOT EXISTS effective_from date;
ALTER TABLE public.sectors ADD COLUMN IF NOT EXISTS effective_to date;
ALTER TABLE public.sub_sectors ADD COLUMN IF NOT EXISTS status_note text;

CREATE TABLE IF NOT EXISTS public.classification_business_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.regulatory_profiles(id),
  sector_id uuid NOT NULL REFERENCES public.sectors(id),
  sub_sector_id uuid REFERENCES public.sub_sectors(id),
  code text NOT NULL,
  name text NOT NULL,
  local_legal_name text,
  subject_form_code text,
  market_scope text,
  legal_basis text,
  description text,
  effective_from date,
  effective_to date,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','disabled','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cbt_code_uniq
  ON public.classification_business_types (sector_id, upper(btrim(code)));
CREATE UNIQUE INDEX IF NOT EXISTS cbt_name_uniq
  ON public.classification_business_types (sector_id, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));
GRANT SELECT ON public.classification_business_types TO authenticated, anon;
GRANT ALL ON public.classification_business_types TO service_role;
ALTER TABLE public.classification_business_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cbt_read ON public.classification_business_types;
CREATE POLICY cbt_read ON public.classification_business_types FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.authorization_schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.regulatory_profiles(id),
  business_type_id uuid NOT NULL REFERENCES public.classification_business_types(id),
  code text NOT NULL,
  name text NOT NULL,
  local_legal_name text,
  authorization_method text NOT NULL DEFAULT 'LICENCE'
    CHECK (authorization_method IN ('LICENCE','REGISTRATION','RECOGNITION','APPROVAL','SUPERVISION_ONLY','REGISTRY_ONLY')),
  market_scope text NOT NULL DEFAULT 'DOMESTIC',
  legal_basis text,
  version text NOT NULL DEFAULT '1',
  effective_from date,
  effective_to date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','disabled','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_scheme_code_uniq
  ON public.authorization_schemes (coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(btrim(code)), btrim(version));
CREATE UNIQUE INDEX IF NOT EXISTS auth_scheme_name_uniq
  ON public.authorization_schemes (business_type_id, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')), btrim(version));
GRANT SELECT ON public.authorization_schemes TO authenticated, anon;
GRANT ALL ON public.authorization_schemes TO service_role;
ALTER TABLE public.authorization_schemes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_scheme_read ON public.authorization_schemes;
CREATE POLICY auth_scheme_read ON public.authorization_schemes FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.authorization_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.authorization_schemes(id),
  local_class_code text NOT NULL,
  name text NOT NULL,
  description text,
  subject_form_code text,
  customer_restriction text,
  market_scope text,
  effective_from date,
  effective_to date,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','disabled','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_class_code_uniq
  ON public.authorization_classes (scheme_id, upper(btrim(local_class_code)));
CREATE UNIQUE INDEX IF NOT EXISTS auth_class_name_uniq
  ON public.authorization_classes (scheme_id, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));
GRANT SELECT ON public.authorization_classes TO authenticated, anon;
GRANT ALL ON public.authorization_classes TO service_role;
ALTER TABLE public.authorization_classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_class_read ON public.authorization_classes;
CREATE POLICY auth_class_read ON public.authorization_classes FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.authorization_class_activities (
  class_id uuid NOT NULL REFERENCES public.authorization_classes(id) ON DELETE CASCADE,
  activity_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, activity_code)
);
GRANT SELECT ON public.authorization_class_activities TO authenticated, anon;
GRANT ALL ON public.authorization_class_activities TO service_role;
ALTER TABLE public.authorization_class_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_class_act_read ON public.authorization_class_activities;
CREATE POLICY auth_class_act_read ON public.authorization_class_activities FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.classification_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  entity_label text,
  action text NOT NULL,
  from_status text,
  to_status text,
  reason text,
  impact jsonb,
  payload jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.classification_change_log TO authenticated;
GRANT ALL ON public.classification_change_log TO service_role;
ALTER TABLE public.classification_change_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS classification_change_log_read ON public.classification_change_log;
CREATE POLICY classification_change_log_read ON public.classification_change_log
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.classification_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  alias_name text,
  alias_code text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS classification_aliases_entity_idx
  ON public.classification_aliases (entity_type, entity_id);
GRANT SELECT ON public.classification_aliases TO authenticated;
GRANT ALL ON public.classification_aliases TO service_role;
ALTER TABLE public.classification_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS classification_aliases_read ON public.classification_aliases;
CREATE POLICY classification_aliases_read ON public.classification_aliases
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------
-- No direct browser DML on canonical classification tables
-- ---------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON
  public.regulatory_profiles, public.common_sector_families, public.regulated_activity_catalogue,
  public.subject_forms, public.classification_business_types, public.authorization_schemes,
  public.authorization_classes, public.authorization_class_activities,
  public.classification_change_log, public.classification_aliases,
  public.sectors, public.sub_sectors
FROM authenticated, anon;

-- ---------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.classification_norm(_v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(btrim(coalesce(_v,'')), '\s+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.current_regulatory_profile()
RETURNS public.regulatory_profiles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.regulatory_profiles WHERE is_current AND status = 'active' LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.current_regulatory_profile() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.classification_log(
  _entity_type text, _entity_id uuid, _entity_label text, _action text,
  _from text, _to text, _reason text, _impact jsonb, _payload jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.classification_change_log
    (entity_type, entity_id, entity_label, action, from_status, to_status, reason, impact, payload, actor_id)
  VALUES (_entity_type, _entity_id, _entity_label, _action, _from, _to, _reason, _impact, _payload, auth.uid())
$$;

-- Effective availability (hierarchical)
CREATE OR REPLACE VIEW public.v_available_business_types AS
  SELECT bt.*, s.name AS sector_name, s.code AS sector_code
    FROM public.classification_business_types bt
    JOIN public.sectors s ON s.id = bt.sector_id
   WHERE bt.status = 'active' AND s.status = 'active'
     AND (s.family_code IS NULL OR EXISTS (
       SELECT 1 FROM public.common_sector_families f
        WHERE upper(f.code) = upper(s.family_code) AND f.status = 'active'));

CREATE OR REPLACE VIEW public.v_available_authorization_classes AS
  SELECT c.*, sc.name AS scheme_name, sc.code AS scheme_code, sc.authorization_method,
         sc.market_scope AS scheme_market_scope, bt.name AS business_type_name, bt.sector_id
    FROM public.authorization_classes c
    JOIN public.authorization_schemes sc ON sc.id = c.scheme_id
    JOIN public.v_available_business_types bt ON bt.id = sc.business_type_id
   WHERE c.status = 'active' AND sc.status = 'active';

GRANT SELECT ON public.v_available_business_types, public.v_available_authorization_classes
  TO authenticated, anon;

-- ---------------------------------------------------------
-- Impact preview
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.classification_dependency_impact(_entity_type text, _entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  v_pair record;
  v_cnt bigint;
  v_col text;
BEGIN
  v_col := CASE _entity_type
    WHEN 'sector' THEN 'sector_id'
    WHEN 'sub_sector' THEN 'sub_sector_id'
    WHEN 'business_type' THEN 'business_type_id'
    WHEN 'scheme' THEN 'authorization_scheme_id'
    WHEN 'class' THEN 'authorization_class_id'
    ELSE NULL END;
  IF v_col IS NULL THEN RETURN jsonb_build_object('supported', false); END IF;

  FOR v_pair IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
     WHERE c.table_schema = 'public' AND c.column_name = v_col
       AND c.table_name IN (
         'licensees','applications','licenses','entity_licenses','form_templates','return_configurations',
         'return_configs','fee_configurations','entity_supervision_assignments','team_scopes',
         'supervision_team_scopes','complaints','return_filings','sub_sectors','classification_business_types',
         'authorization_schemes')
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', v_pair.table_name, v_pair.column_name)
      INTO v_cnt USING _entity_id;
    IF v_cnt > 0 THEN
      v_out := v_out || jsonb_build_object(v_pair.table_name, v_cnt);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'supported', true,
    'entity_type', _entity_type,
    'entity_id', _entity_id,
    'references', v_out,
    'total_references', (SELECT coalesce(sum(value::bigint),0) FROM jsonb_each_text(v_out))
  );
END $$;
GRANT EXECUTE ON FUNCTION public.classification_dependency_impact(text, uuid) TO authenticated;

-- ---------------------------------------------------------
-- Governed writes
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.classification_sector_upsert(
  _id uuid, _code text, _name text, _family_code text, _display_group text,
  _scope_note text, _status text DEFAULT 'active', _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := public.rdm_require('settings','edit');
        v_profile public.regulatory_profiles; v_id uuid; v_old text;
BEGIN
  IF public.classification_norm(_name) = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF public.classification_norm(_code) = '' THEN RAISE EXCEPTION 'Code is required'; END IF;
  SELECT * INTO v_profile FROM public.current_regulatory_profile();

  IF _id IS NULL THEN
    INSERT INTO public.sectors (name, code, status, family_code, display_group, scope_note,
                                regulator_id, profile_id)
    VALUES (btrim(_name), upper(btrim(_code)), coalesce(_status,'draft'), nullif(_family_code,''),
            nullif(_display_group,''), nullif(_scope_note,''), v_profile.regulator_id, v_profile.id)
    RETURNING id INTO v_id;
    PERFORM public.classification_log('sector', v_id, btrim(_name), 'created', NULL, coalesce(_status,'draft'), _reason, NULL, NULL);
  ELSE
    SELECT name INTO v_old FROM public.sectors WHERE id = _id;
    IF v_old IS NULL THEN RAISE EXCEPTION 'Sector not found'; END IF;
    UPDATE public.sectors SET name = btrim(_name), code = upper(btrim(_code)),
           family_code = nullif(_family_code,''), display_group = nullif(_display_group,''),
           scope_note = nullif(_scope_note,'')
     WHERE id = _id;
    v_id := _id;
    IF public.classification_norm(v_old) <> public.classification_norm(_name) THEN
      INSERT INTO public.classification_aliases (entity_type, entity_id, alias_name, source)
      VALUES ('sector', v_id, v_old, 'rename');
    END IF;
    PERFORM public.classification_log('sector', v_id, btrim(_name), 'updated', NULL, NULL, _reason, NULL, NULL);
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.classification_sector_set_status(_id uuid, _status text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := public.rdm_require('settings','edit'); v_old text; v_name text;
BEGIN
  IF _status NOT IN ('draft','active','disabled','retired') THEN RAISE EXCEPTION 'Invalid status %', _status; END IF;
  IF public.classification_norm(_reason) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT status, name INTO v_old, v_name FROM public.sectors WHERE id = _id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Sector not found'; END IF;
  UPDATE public.sectors SET status = _status WHERE id = _id;
  PERFORM public.classification_log('sector', _id, v_name, 'status_change', v_old, _status, _reason,
    public.classification_dependency_impact('sector', _id), NULL);
END $$;

CREATE OR REPLACE FUNCTION public.business_type_upsert(
  _id uuid, _sector_id uuid, _code text, _name text, _local_legal_name text,
  _subject_form_code text, _market_scope text, _legal_basis text, _description text,
  _effective_from date, _effective_to date, _status text DEFAULT 'active', _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := public.rdm_require('settings','edit');
        v_profile public.regulatory_profiles; v_id uuid; v_old text;
BEGIN
  IF public.classification_norm(_name) = '' OR public.classification_norm(_code) = '' THEN
    RAISE EXCEPTION 'Code and name are required'; END IF;
  SELECT * INTO v_profile FROM public.current_regulatory_profile();
  IF _id IS NULL THEN
    INSERT INTO public.classification_business_types
      (profile_id, sector_id, code, name, local_legal_name, subject_form_code, market_scope,
       legal_basis, description, effective_from, effective_to, status)
    VALUES (v_profile.id, _sector_id, upper(btrim(_code)), btrim(_name), nullif(_local_legal_name,''),
            nullif(_subject_form_code,''), nullif(_market_scope,''), nullif(_legal_basis,''),
            nullif(_description,''), _effective_from, _effective_to, coalesce(_status,'draft'))
    RETURNING id INTO v_id;
    PERFORM public.classification_log('business_type', v_id, btrim(_name), 'created', NULL, coalesce(_status,'draft'), _reason, NULL, NULL);
  ELSE
    SELECT name INTO v_old FROM public.classification_business_types WHERE id = _id;
    IF v_old IS NULL THEN RAISE EXCEPTION 'Business type not found'; END IF;
    UPDATE public.classification_business_types SET
      sector_id = _sector_id, code = upper(btrim(_code)), name = btrim(_name),
      local_legal_name = nullif(_local_legal_name,''), subject_form_code = nullif(_subject_form_code,''),
      market_scope = nullif(_market_scope,''), legal_basis = nullif(_legal_basis,''),
      description = nullif(_description,''), effective_from = _effective_from, effective_to = _effective_to,
      updated_at = now()
     WHERE id = _id;
    v_id := _id;
    IF public.classification_norm(v_old) <> public.classification_norm(_name) THEN
      INSERT INTO public.classification_aliases (entity_type, entity_id, alias_name, source)
      VALUES ('business_type', v_id, v_old, 'rename');
    END IF;
    PERFORM public.classification_log('business_type', v_id, btrim(_name), 'updated', NULL, NULL, _reason, NULL, NULL);
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.business_type_set_status(_id uuid, _status text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := public.rdm_require('settings','edit'); v_old text; v_name text;
BEGIN
  IF _status NOT IN ('draft','active','disabled','retired') THEN RAISE EXCEPTION 'Invalid status %', _status; END IF;
  IF public.classification_norm(_reason) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT status, name INTO v_old, v_name FROM public.classification_business_types WHERE id = _id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Business type not found'; END IF;
  UPDATE public.classification_business_types SET status = _status, updated_at = now() WHERE id = _id;
  PERFORM public.classification_log('business_type', _id, v_name, 'status_change', v_old, _status, _reason,
    public.classification_dependency_impact('business_type', _id), NULL);
END $$;

CREATE OR REPLACE FUNCTION public.authorization_scheme_upsert(
  _id uuid, _business_type_id uuid, _code text, _name text, _local_legal_name text,
  _authorization_method text, _market_scope text, _legal_basis text, _version text,
  _effective_from date, _effective_to date, _status text DEFAULT 'active', _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := public.rdm_require('settings','edit');
        v_profile public.regulatory_profiles; v_id uuid; v_old text;
BEGIN
  IF public.classification_norm(_name) = '' OR public.classification_norm(_code) = '' THEN
    RAISE EXCEPTION 'Code and name are required'; END IF;
  SELECT * INTO v_profile FROM public.current_regulatory_profile();
  IF _id IS NULL THEN
    INSERT INTO public.authorization_schemes
      (profile_id, business_type_id, code, name, local_legal_name, authorization_method,
       market_scope, legal_basis, version, effective_from, effective_to, status)
    VALUES (v_profile.id, _business_type_id, upper(btrim(_code)), btrim(_name), nullif(_local_legal_name,''),
            coalesce(nullif(_authorization_method,''),'LICENCE'), coalesce(nullif(_market_scope,''),'DOMESTIC'),
            nullif(_legal_basis,''), coalesce(nullif(_version,''),'1'), _effective_from, _effective_to,
            coalesce(_status,'draft'))
    RETURNING id INTO v_id;
    PERFORM public.classification_log('scheme', v_id, btrim(_name), 'created', NULL, coalesce(_status,'draft'), _reason, NULL, NULL);
  ELSE
    SELECT name INTO v_old FROM public.authorization_schemes WHERE id = _id;
    IF v_old IS NULL THEN RAISE EXCEPTION 'Scheme not found'; END IF;
    UPDATE public.authorization_schemes SET
      business_type_id = _business_type_id, code = upper(btrim(_code)), name = btrim(_name),
      local_legal_name = nullif(_local_legal_name,''),
      authorization_method = coalesce(nullif(_authorization_method,''),'LICENCE'),
      market_scope = coalesce(nullif(_market_scope,''),'DOMESTIC'), legal_basis = nullif(_legal_basis,''),
      version = coalesce(nullif(_version,''),'1'), effective_from = _effective_from,
      effective_to = _effective_to, updated_at = now()
     WHERE id = _id;
    v_id := _id;
    IF public.classification_norm(v_old) <> public.classification_norm(_name) THEN
      INSERT INTO public.classification_aliases (entity_type, entity_id, alias_name, source)
      VALUES ('scheme', v_id, v_old, 'rename');
    END IF;
    PERFORM public.classification_log('scheme', v_id, btrim(_name), 'updated', NULL, NULL, _reason, NULL, NULL);
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.authorization_scheme_set_status(_id uuid, _status text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := public.rdm_require('settings','edit'); v_old text; v_name text;
BEGIN
  IF _status NOT IN ('draft','active','disabled','retired') THEN RAISE EXCEPTION 'Invalid status %', _status; END IF;
  IF public.classification_norm(_reason) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT status, name INTO v_old, v_name FROM public.authorization_schemes WHERE id = _id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Scheme not found'; END IF;
  UPDATE public.authorization_schemes SET status = _status, updated_at = now() WHERE id = _id;
  PERFORM public.classification_log('scheme', _id, v_name, 'status_change', v_old, _status, _reason,
    public.classification_dependency_impact('scheme', _id), NULL);
END $$;

CREATE OR REPLACE FUNCTION public.authorization_class_upsert(
  _id uuid, _scheme_id uuid, _local_class_code text, _name text, _description text,
  _subject_form_code text, _customer_restriction text, _market_scope text,
  _effective_from date, _effective_to date, _activity_codes text[] DEFAULT NULL,
  _status text DEFAULT 'active', _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := public.rdm_require('settings','edit'); v_id uuid; v_old text; v_code text;
BEGIN
  IF public.classification_norm(_name) = '' OR public.classification_norm(_local_class_code) = '' THEN
    RAISE EXCEPTION 'Class code and name are required'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.authorization_classes
      (scheme_id, local_class_code, name, description, subject_form_code, customer_restriction,
       market_scope, effective_from, effective_to, status)
    VALUES (_scheme_id, upper(btrim(_local_class_code)), btrim(_name), nullif(_description,''),
            nullif(_subject_form_code,''), nullif(_customer_restriction,''), nullif(_market_scope,''),
            _effective_from, _effective_to, coalesce(_status,'draft'))
    RETURNING id INTO v_id;
    PERFORM public.classification_log('class', v_id, btrim(_name), 'created', NULL, coalesce(_status,'draft'), _reason, NULL, NULL);
  ELSE
    SELECT name INTO v_old FROM public.authorization_classes WHERE id = _id;
    IF v_old IS NULL THEN RAISE EXCEPTION 'Class not found'; END IF;
    UPDATE public.authorization_classes SET
      scheme_id = _scheme_id, local_class_code = upper(btrim(_local_class_code)), name = btrim(_name),
      description = nullif(_description,''), subject_form_code = nullif(_subject_form_code,''),
      customer_restriction = nullif(_customer_restriction,''), market_scope = nullif(_market_scope,''),
      effective_from = _effective_from, effective_to = _effective_to, updated_at = now()
     WHERE id = _id;
    v_id := _id;
    IF public.classification_norm(v_old) <> public.classification_norm(_name) THEN
      INSERT INTO public.classification_aliases (entity_type, entity_id, alias_name, source)
      VALUES ('class', v_id, v_old, 'rename');
    END IF;
    PERFORM public.classification_log('class', v_id, btrim(_name), 'updated', NULL, NULL, _reason, NULL, NULL);
  END IF;

  IF _activity_codes IS NOT NULL THEN
    DELETE FROM public.authorization_class_activities WHERE class_id = v_id;
    FOREACH v_code IN ARRAY _activity_codes LOOP
      IF public.classification_norm(v_code) <> '' THEN
        IF NOT EXISTS (SELECT 1 FROM public.regulated_activity_catalogue
                        WHERE upper(btrim(code)) = upper(btrim(v_code))) THEN
          RAISE EXCEPTION 'Unknown activity code %', v_code;
        END IF;
        INSERT INTO public.authorization_class_activities (class_id, activity_code)
        VALUES (v_id, upper(btrim(v_code))) ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.authorization_class_set_status(_id uuid, _status text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := public.rdm_require('settings','edit'); v_old text; v_name text;
BEGIN
  IF _status NOT IN ('draft','active','disabled','retired') THEN RAISE EXCEPTION 'Invalid status %', _status; END IF;
  IF public.classification_norm(_reason) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT status, name INTO v_old, v_name FROM public.authorization_classes WHERE id = _id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Class not found'; END IF;
  UPDATE public.authorization_classes SET status = _status, updated_at = now() WHERE id = _id;
  PERFORM public.classification_log('class', _id, v_name, 'status_change', v_old, _status, _reason,
    public.classification_dependency_impact('class', _id), NULL);
END $$;

CREATE OR REPLACE FUNCTION public.regulated_activity_upsert(
  _id uuid, _code text, _label text, _description text, _family_code text,
  _status text DEFAULT 'active', _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := public.rdm_require('settings','edit'); v_id uuid;
BEGIN
  IF public.classification_norm(_code) = '' OR public.classification_norm(_label) = '' THEN
    RAISE EXCEPTION 'Code and label are required'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.regulated_activity_catalogue (code, label, description, family_code, status)
    VALUES (upper(btrim(_code)), btrim(_label), nullif(_description,''), nullif(_family_code,''), coalesce(_status,'draft'))
    RETURNING id INTO v_id;
    PERFORM public.classification_log('activity', v_id, btrim(_label), 'created', NULL, coalesce(_status,'draft'), _reason, NULL, NULL);
  ELSE
    UPDATE public.regulated_activity_catalogue SET code = upper(btrim(_code)), label = btrim(_label),
      description = nullif(_description,''), family_code = nullif(_family_code,''), updated_at = now()
     WHERE id = _id;
    v_id := _id;
    PERFORM public.classification_log('activity', v_id, btrim(_label), 'updated', NULL, NULL, _reason, NULL, NULL);
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.regulated_activity_set_status(_id uuid, _status text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := public.rdm_require('settings','edit'); v_old text; v_name text;
BEGIN
  IF _status NOT IN ('draft','active','disabled','retired') THEN RAISE EXCEPTION 'Invalid status %', _status; END IF;
  IF public.classification_norm(_reason) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT status, label INTO v_old, v_name FROM public.regulated_activity_catalogue WHERE id = _id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Activity not found'; END IF;
  UPDATE public.regulated_activity_catalogue SET status = _status, updated_at = now() WHERE id = _id;
  PERFORM public.classification_log('activity', _id, v_name, 'status_change', v_old, _status, _reason, NULL, NULL);
END $$;

CREATE OR REPLACE FUNCTION public.subject_form_upsert(
  _id uuid, _code text, _label text, _description text,
  _status text DEFAULT 'active', _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := public.rdm_require('settings','edit'); v_id uuid;
BEGIN
  IF public.classification_norm(_code) = '' OR public.classification_norm(_label) = '' THEN
    RAISE EXCEPTION 'Code and label are required'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.subject_forms (code, label, description, status)
    VALUES (upper(btrim(_code)), btrim(_label), nullif(_description,''), coalesce(_status,'draft'))
    RETURNING id INTO v_id;
    PERFORM public.classification_log('subject_form', v_id, btrim(_label), 'created', NULL, coalesce(_status,'draft'), _reason, NULL, NULL);
  ELSE
    UPDATE public.subject_forms SET code = upper(btrim(_code)), label = btrim(_label),
      description = nullif(_description,''), updated_at = now() WHERE id = _id;
    v_id := _id;
    PERFORM public.classification_log('subject_form', v_id, btrim(_label), 'updated', NULL, NULL, _reason, NULL, NULL);
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.subject_form_set_status(_id uuid, _status text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := public.rdm_require('settings','edit'); v_old text; v_name text;
BEGIN
  IF _status NOT IN ('draft','active','disabled','retired') THEN RAISE EXCEPTION 'Invalid status %', _status; END IF;
  IF public.classification_norm(_reason) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT status, label INTO v_old, v_name FROM public.subject_forms WHERE id = _id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Subject form not found'; END IF;
  UPDATE public.subject_forms SET status = _status, updated_at = now() WHERE id = _id;
  PERFORM public.classification_log('subject_form', _id, v_name, 'status_change', v_old, _status, _reason, NULL, NULL);
END $$;

-- Hard delete only for unused drafts
CREATE OR REPLACE FUNCTION public.classification_delete_draft(_entity_type text, _id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := public.rdm_require('settings','edit'); v_status text; v_name text; v_impact jsonb;
BEGIN
  CASE _entity_type
    WHEN 'sector' THEN SELECT status, name INTO v_status, v_name FROM public.sectors WHERE id = _id;
    WHEN 'business_type' THEN SELECT status, name INTO v_status, v_name FROM public.classification_business_types WHERE id = _id;
    WHEN 'scheme' THEN SELECT status, name INTO v_status, v_name FROM public.authorization_schemes WHERE id = _id;
    WHEN 'class' THEN SELECT status, name INTO v_status, v_name FROM public.authorization_classes WHERE id = _id;
    WHEN 'activity' THEN SELECT status, label INTO v_status, v_name FROM public.regulated_activity_catalogue WHERE id = _id;
    WHEN 'subject_form' THEN SELECT status, label INTO v_status, v_name FROM public.subject_forms WHERE id = _id;
    ELSE RAISE EXCEPTION 'Unsupported classification type %', _entity_type;
  END CASE;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only DRAFT classifications may be deleted. Disable or retire % instead.', v_name
      USING ERRCODE = '42501';
  END IF;
  v_impact := public.classification_dependency_impact(_entity_type, _id);
  IF coalesce((v_impact->>'total_references')::bigint, 0) > 0 THEN
    RAISE EXCEPTION 'Referenced classification % cannot be deleted. Disable or retire it instead.', v_name
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.classification_change_log
              WHERE entity_id = _id AND action NOT IN ('created')) THEN
    RAISE EXCEPTION 'Classification % has history and cannot be deleted.', v_name USING ERRCODE = '42501';
  END IF;
  CASE _entity_type
    WHEN 'sector' THEN DELETE FROM public.sectors WHERE id = _id;
    WHEN 'business_type' THEN DELETE FROM public.classification_business_types WHERE id = _id;
    WHEN 'scheme' THEN DELETE FROM public.authorization_schemes WHERE id = _id;
    WHEN 'class' THEN DELETE FROM public.authorization_classes WHERE id = _id;
    WHEN 'activity' THEN DELETE FROM public.regulated_activity_catalogue WHERE id = _id;
    WHEN 'subject_form' THEN DELETE FROM public.subject_forms WHERE id = _id;
  END CASE;
  PERFORM public.classification_log(_entity_type, _id, v_name, 'deleted_draft', v_status, NULL, _reason, v_impact, NULL);
END $$;

-- Duplicate scan
CREATE OR REPLACE FUNCTION public.classification_duplicate_scan()
RETURNS TABLE (finding text, entity_type text, detail text, occurrences bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'DUPLICATE_CODE', 'sector', upper(btrim(code)), count(*)
    FROM public.sectors WHERE code IS NOT NULL GROUP BY 3 HAVING count(*) > 1
  UNION ALL
  SELECT 'NORMALIZED_NAME_DUPLICATE', 'sector', public.classification_norm(name), count(*)
    FROM public.sectors GROUP BY 3 HAVING count(*) > 1
  UNION ALL
  SELECT 'NORMALIZED_NAME_DUPLICATE', 'business_type',
         sector_id::text || ' / ' || public.classification_norm(name), count(*)
    FROM public.classification_business_types GROUP BY 3 HAVING count(*) > 1
  UNION ALL
  SELECT 'DUPLICATE_CODE', 'activity', upper(btrim(code)), count(*)
    FROM public.regulated_activity_catalogue GROUP BY 3 HAVING count(*) > 1
  UNION ALL
  SELECT 'DUPLICATE_CODE', 'subject_form', upper(btrim(code)), count(*)
    FROM public.subject_forms GROUP BY 3 HAVING count(*) > 1
  UNION ALL
  SELECT 'ORPHAN_MAPPING', 'class_activity', a.activity_code, count(*)
    FROM public.authorization_class_activities a
   WHERE NOT EXISTS (SELECT 1 FROM public.regulated_activity_catalogue c
                      WHERE upper(btrim(c.code)) = upper(btrim(a.activity_code)))
   GROUP BY 3
  UNION ALL
  SELECT 'ORPHAN_CLASSIFICATION', 'business_type', bt.name, 1::bigint
    FROM public.classification_business_types bt
   WHERE NOT EXISTS (SELECT 1 FROM public.sectors s WHERE s.id = bt.sector_id)
  UNION ALL
  SELECT 'POSSIBLE_SEMANTIC_DUPLICATE', 'business_type',
         b1.name || ' ~ ' || b2.name, 2::bigint
    FROM public.classification_business_types b1
    JOIN public.classification_business_types b2
      ON b1.id < b2.id AND b1.sector_id = b2.sector_id
     AND replace(public.classification_norm(b1.name), ' ', '')
       = replace(public.classification_norm(b2.name), ' ', '')
$$;
GRANT EXECUTE ON FUNCTION public.classification_duplicate_scan() TO authenticated;

-- Import dry run (no writes)
CREATE OR REPLACE FUNCTION public.classification_import_dry_run(_kind text, _rows jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; v_new int := 0; v_upd int := 0; v_dup int := 0; v_bad int := 0;
        v_issues jsonb := '[]'::jsonb; v_i int := 0;
BEGIN
  PERFORM public.rdm_require('settings','edit');
  IF _kind NOT IN ('sector','business_type') THEN
    RETURN jsonb_build_object('supported', false, 'kind', _kind);
  END IF;
  FOR r IN SELECT jsonb_array_elements(coalesce(_rows, '[]'::jsonb)) LOOP
    v_i := v_i + 1;
    IF public.classification_norm(r->>'code') = '' OR public.classification_norm(r->>'name') = '' THEN
      v_bad := v_bad + 1;
      v_issues := v_issues || jsonb_build_object('row', v_i, 'issue', 'MISSING_CODE_OR_NAME');
      CONTINUE;
    END IF;
    IF _kind = 'sector' THEN
      IF EXISTS (SELECT 1 FROM public.sectors WHERE upper(btrim(code)) = upper(btrim(r->>'code'))) THEN
        v_upd := v_upd + 1;
      ELSIF EXISTS (SELECT 1 FROM public.sectors
                     WHERE public.classification_norm(name) = public.classification_norm(r->>'name')) THEN
        v_dup := v_dup + 1;
        v_issues := v_issues || jsonb_build_object('row', v_i, 'issue', 'NORMALIZED_NAME_DUPLICATE');
      ELSE v_new := v_new + 1; END IF;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM public.sectors WHERE upper(btrim(code)) = upper(btrim(r->>'sector_code'))) THEN
        v_bad := v_bad + 1;
        v_issues := v_issues || jsonb_build_object('row', v_i, 'issue', 'INVALID_PARENT_SECTOR');
        CONTINUE;
      END IF;
      IF EXISTS (SELECT 1 FROM public.classification_business_types bt
                   JOIN public.sectors s ON s.id = bt.sector_id
                  WHERE upper(btrim(s.code)) = upper(btrim(r->>'sector_code'))
                    AND upper(btrim(bt.code)) = upper(btrim(r->>'code'))) THEN
        v_upd := v_upd + 1;
      ELSIF EXISTS (SELECT 1 FROM public.classification_business_types bt
                      JOIN public.sectors s ON s.id = bt.sector_id
                     WHERE upper(btrim(s.code)) = upper(btrim(r->>'sector_code'))
                       AND public.classification_norm(bt.name) = public.classification_norm(r->>'name')) THEN
        v_dup := v_dup + 1;
        v_issues := v_issues || jsonb_build_object('row', v_i, 'issue', 'NORMALIZED_NAME_DUPLICATE');
      ELSE v_new := v_new + 1; END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('supported', true, 'kind', _kind, 'rows', v_i,
    'new', v_new, 'updates', v_upd, 'duplicates', v_dup, 'invalid', v_bad,
    'clean', (v_dup = 0 AND v_bad = 0), 'issues', v_issues);
END $$;
GRANT EXECUTE ON FUNCTION public.classification_import_dry_run(text, jsonb) TO authenticated;

-- Break-glass demo profile switch (non-production only)
CREATE OR REPLACE FUNCTION public.regulatory_profile_set_current(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := public.rdm_require('settings','edit'); v_name text;
BEGIN
  PERFORM public.assert_nonproduction('regulatory_profile_switch');
  IF public.classification_norm(_reason) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT jurisdiction_name INTO v_name FROM public.regulatory_profiles WHERE id = _id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;
  UPDATE public.regulatory_profiles SET is_current = false, updated_at = now() WHERE is_current;
  UPDATE public.regulatory_profiles SET is_current = true, status = 'active', updated_at = now() WHERE id = _id;
  PERFORM public.classification_log('regulatory_profile', _id, v_name, 'set_current', NULL, 'current', _reason, NULL, NULL);
END $$;

GRANT EXECUTE ON FUNCTION
  public.classification_sector_upsert(uuid, text, text, text, text, text, text, text),
  public.classification_sector_set_status(uuid, text, text),
  public.business_type_upsert(uuid, uuid, text, text, text, text, text, text, text, date, date, text, text),
  public.business_type_set_status(uuid, text, text),
  public.authorization_scheme_upsert(uuid, uuid, text, text, text, text, text, text, text, date, date, text, text),
  public.authorization_scheme_set_status(uuid, text, text),
  public.authorization_class_upsert(uuid, uuid, text, text, text, text, text, text, date, date, text[], text, text),
  public.authorization_class_set_status(uuid, text, text),
  public.regulated_activity_upsert(uuid, text, text, text, text, text, text),
  public.regulated_activity_set_status(uuid, text, text),
  public.subject_form_upsert(uuid, text, text, text, text, text),
  public.subject_form_set_status(uuid, text, text),
  public.classification_delete_draft(text, uuid, text),
  public.regulatory_profile_set_current(uuid, text)
TO authenticated;