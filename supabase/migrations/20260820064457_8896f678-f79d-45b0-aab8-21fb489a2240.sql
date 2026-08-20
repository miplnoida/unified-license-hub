
-- ==========================================================================
-- RDM-ENTITY-001 · PHASE 1.2 — final metadata governance hardening
-- ==========================================================================

-- 1) RPC-ONLY WRITE BOUNDARY -----------------------------------------------
DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY public.rdm_metadata_tables() LOOP
    -- drop authenticated write policies (reads stay)
    FOR p IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename=t AND cmd IN ('ALL','INSERT','UPDATE','DELETE')
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- 2) EXACTLY ONE ACTIVE DEFAULT POLICY ------------------------------------
CREATE OR REPLACE FUNCTION public.rdm_assert_single_active_default()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  EXECUTE format('SELECT count(*) FROM public.%I WHERE is_default AND is_active', TG_TABLE_NAME) INTO v_count;
  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'Table % must have exactly one active default policy (found %). Promote another active policy in the same transaction.',
      TG_TABLE_NAME, v_count USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_erp_single_default ON public.entity_resolution_policies;
CREATE CONSTRAINT TRIGGER trg_erp_single_default
  AFTER INSERT OR UPDATE OR DELETE ON public.entity_resolution_policies
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.rdm_assert_single_active_default();

DROP TRIGGER IF EXISTS trg_erfp_single_default ON public.entity_registry_failure_policies;
CREATE CONSTRAINT TRIGGER trg_erfp_single_default
  AFTER INSERT OR UPDATE OR DELETE ON public.entity_registry_failure_policies
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.rdm_assert_single_active_default();

-- 3) IDENTIFIER SCOPE CONSISTENCY (derived, not hand-maintained) ----------
ALTER TABLE public.entity_identifier_types
  DROP COLUMN IF EXISTS scope_requires_jurisdiction,
  DROP COLUMN IF EXISTS scope_requires_issuer;

ALTER TABLE public.entity_identifier_types
  ADD COLUMN scope_requires_jurisdiction boolean
    GENERATED ALWAYS AS (uniqueness_scope = 'JURISDICTION') STORED,
  ADD COLUMN scope_requires_issuer boolean
    GENERATED ALWAYS AS (uniqueness_scope = 'ISSUER') STORED,
  ADD COLUMN scope_requires_regulator boolean
    GENERATED ALWAYS AS (uniqueness_scope = 'REGULATOR') STORED;

ALTER TABLE public.entity_identifier_types DROP COLUMN IF EXISTS is_unique_global;
ALTER TABLE public.entity_identifier_types
  ADD COLUMN is_unique_global boolean
    GENERATED ALWAYS AS (uniqueness_scope = 'GLOBAL') STORED;

COMMENT ON COLUMN public.entity_identifier_types.uniqueness_scope IS
  'Canonical uniqueness contract. GLOBAL: (identifier_type_id, normalized_value). '
  'JURISDICTION: (identifier_type_id, jurisdiction_id, normalized_value). '
  'ISSUER: (identifier_type_id, issuer_key, normalized_value). '
  'REGULATOR: (identifier_type_id, regulator_id, normalized_value). NONE: no uniqueness constraint.';
COMMENT ON COLUMN public.entity_identifier_types.is_unique_global IS
  'Legacy derived flag — true only when uniqueness_scope = GLOBAL.';

-- 4) GOVERNED WRITE RPCs --------------------------------------------------
CREATE OR REPLACE FUNCTION public.rdm_save_metadata(_table text, _values jsonb, _id uuid DEFAULT NULL::uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid := _id;
  v_cols text[];
  v_assign text := '';
  v_insert_cols text := '';
  v_insert_vals text := '';
  v_key text; v_col text; v_type text; v_existing_key text; v_is_default boolean;
BEGIN
  IF NOT public.rdm_can_write() THEN
    RAISE EXCEPTION 'Not authorised to change regulatory data model configuration' USING ERRCODE = '42501';
  END IF;
  IF NOT (_table = ANY (public.rdm_metadata_tables())) THEN
    RAISE EXCEPTION 'Unknown regulatory metadata table: %', _table USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(column_name::text) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = _table
    AND is_generated <> 'ALWAYS'
    AND column_name NOT IN ('id','created_at','updated_at','is_system');

  v_key := NULLIF(btrim(COALESCE(_values ->> 'key','')), '');

  IF v_id IS NULL THEN
    IF v_key IS NULL THEN
      RAISE EXCEPTION 'A machine key is required when creating regulatory metadata' USING ERRCODE = '22023';
    END IF;
    IF v_key !~ '^[a-z0-9_]+$' THEN
      RAISE EXCEPTION 'Machine key must be lower_snake_case: %', v_key USING ERRCODE = '22023';
    END IF;
  ELSE
    EXECUTE format('SELECT key FROM public.%I WHERE id = $1', _table) INTO v_existing_key USING v_id;
    IF v_existing_key IS NULL THEN
      RAISE EXCEPTION 'Regulatory metadata row % not found in %', v_id, _table USING ERRCODE = 'P0002';
    END IF;
    _values := _values - 'key';
  END IF;

  IF _table IN ('entity_resolution_policies','entity_registry_failure_policies') THEN
    v_is_default := COALESCE((_values ->> 'is_default')::boolean, false)
                    AND COALESCE((_values ->> 'is_active')::boolean, true);
    IF v_is_default THEN
      EXECUTE format('UPDATE public.%I SET is_default = false WHERE is_default AND is_active AND ($1 IS NULL OR id <> $1)', _table) USING v_id;
    END IF;
  END IF;

  FOREACH v_col IN ARRAY v_cols LOOP
    IF _values ? v_col THEN
      SELECT format_type(a.atttypid, a.atttypmod) INTO v_type
      FROM pg_attribute a
      WHERE a.attrelid = format('public.%I', _table)::regclass AND a.attname = v_col;
      v_assign := v_assign || format('%I = ($1 ->> %L)::%s, ', v_col, v_col, v_type);
      v_insert_cols := v_insert_cols || format('%I, ', v_col);
      v_insert_vals := v_insert_vals || format('($1 ->> %L)::%s, ', v_col, v_type);
    END IF;
  END LOOP;

  IF v_assign = '' THEN
    RAISE EXCEPTION 'No recognised columns supplied for %', _table USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    EXECUTE format('INSERT INTO public.%I (%s) VALUES (%s) RETURNING id',
      _table, left(v_insert_cols, length(v_insert_cols) - 2), left(v_insert_vals, length(v_insert_vals) - 2))
      INTO v_id USING _values;
  ELSE
    EXECUTE format('UPDATE public.%I SET %s WHERE id = $2', _table, left(v_assign, length(v_assign) - 2))
      USING _values, v_id;
  END IF;

  RETURN v_id;
END $$;

-- explicit, audited default promotion
CREATE OR REPLACE FUNCTION public.rdm_promote_default_policy(_table text, _id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_active boolean;
BEGIN
  IF NOT public.rdm_can_write() THEN
    RAISE EXCEPTION 'Not authorised to change regulatory data model configuration' USING ERRCODE = '42501';
  END IF;
  IF _table NOT IN ('entity_resolution_policies','entity_registry_failure_policies') THEN
    RAISE EXCEPTION 'Table % has no default-policy semantics', _table USING ERRCODE = '22023';
  END IF;
  EXECUTE format('SELECT is_active FROM public.%I WHERE id = $1', _table) INTO v_active USING _id;
  IF v_active IS NULL THEN
    RAISE EXCEPTION 'Policy % not found in %', _id, _table USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'A retired policy cannot become the active default' USING ERRCODE = '23514';
  END IF;
  EXECUTE format('UPDATE public.%I SET is_default = false WHERE is_default AND id <> $1', _table) USING _id;
  EXECUTE format('UPDATE public.%I SET is_default = true WHERE id = $1', _table) USING _id;
END $$;

DROP FUNCTION IF EXISTS public.rdm_retire_metadata(text, uuid);
CREATE OR REPLACE FUNCTION public.rdm_retire_metadata(_table text, _id uuid, _promote_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_was_default boolean;
BEGIN
  IF NOT public.rdm_can_write() THEN
    RAISE EXCEPTION 'Not authorised to change regulatory data model configuration' USING ERRCODE = '42501';
  END IF;
  IF NOT (_table = ANY (public.rdm_metadata_tables())) THEN
    RAISE EXCEPTION 'Unknown regulatory metadata table: %', _table USING ERRCODE = '22023';
  END IF;

  IF _table IN ('entity_resolution_policies','entity_registry_failure_policies') THEN
    EXECUTE format('SELECT is_default AND is_active FROM public.%I WHERE id = $1', _table) INTO v_was_default USING _id;
    EXECUTE format('UPDATE public.%I SET is_active = false, is_default = false WHERE id = $1', _table) USING _id;
    IF COALESCE(v_was_default, false) THEN
      IF _promote_id IS NULL THEN
        RAISE EXCEPTION
          'This is the active default policy in %. Select another active policy to promote before retiring it.', _table
          USING ERRCODE = '23514';
      END IF;
      PERFORM public.rdm_promote_default_policy(_table, _promote_id);
    END IF;
  ELSE
    EXECUTE format('UPDATE public.%I SET is_active = false WHERE id = $1', _table) USING _id;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.rdm_delete_metadata(text, uuid);
CREATE OR REPLACE FUNCTION public.rdm_delete_metadata(_table text, _id uuid, _promote_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_is_system boolean; v_refs integer := 0; v_was_default boolean;
BEGIN
  IF NOT public.rdm_can_write() THEN
    RAISE EXCEPTION 'Not authorised to change regulatory data model configuration' USING ERRCODE = '42501';
  END IF;
  IF NOT (_table = ANY (public.rdm_metadata_tables())) THEN
    RAISE EXCEPTION 'Unknown regulatory metadata table: %', _table USING ERRCODE = '22023';
  END IF;
  EXECUTE format('SELECT is_system FROM public.%I WHERE id = $1', _table) INTO v_is_system USING _id;
  IF v_is_system IS NULL THEN
    RAISE EXCEPTION 'Regulatory metadata row % not found', _id USING ERRCODE = 'P0002';
  END IF;
  IF v_is_system THEN
    RAISE EXCEPTION 'System regulatory metadata cannot be deleted. Retire it instead.' USING ERRCODE = '42501';
  END IF;
  IF _table = 'classification_schemes' THEN
    SELECT count(*) INTO v_refs FROM public.classification_values WHERE scheme_id = _id;
  ELSIF _table = 'classification_values' THEN
    SELECT count(*) INTO v_refs FROM public.classification_values WHERE parent_id = _id;
  ELSIF _table = 'relationship_types' THEN
    SELECT count(*) INTO v_refs FROM public.relationship_types WHERE inverse_relationship_type_id = _id;
  END IF;
  IF v_refs > 0 THEN
    RAISE EXCEPTION 'Referenced regulatory metadata cannot be deleted (% dependent rows). Retire it instead.', v_refs USING ERRCODE = '42501';
  END IF;

  IF _table IN ('entity_resolution_policies','entity_registry_failure_policies') THEN
    EXECUTE format('SELECT is_default AND is_active FROM public.%I WHERE id = $1', _table) INTO v_was_default USING _id;
    IF COALESCE(v_was_default, false) AND _promote_id IS NULL THEN
      RAISE EXCEPTION
        'This is the active default policy in %. Select another active policy to promote before deleting it.', _table
        USING ERRCODE = '23514';
    END IF;
  END IF;

  EXECUTE format('DELETE FROM public.%I WHERE id = $1', _table) USING _id;

  IF COALESCE(v_was_default, false) THEN
    PERFORM public.rdm_promote_default_policy(_table, _promote_id);
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.rdm_save_metadata(text, jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rdm_retire_metadata(text, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rdm_delete_metadata(text, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rdm_promote_default_policy(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rdm_save_metadata(text, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rdm_retire_metadata(text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rdm_delete_metadata(text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rdm_promote_default_policy(text, uuid) TO authenticated, service_role;
