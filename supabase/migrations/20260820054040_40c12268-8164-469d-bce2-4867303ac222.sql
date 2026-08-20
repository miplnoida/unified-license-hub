-- RDM-ENTITY-001 PHASE 1.1 — architecture alignment & metadata hardening

UPDATE public.lifecycle_stages SET
  is_active = false, is_terminal = false,
  description = 'RETIRED as an ENTITY stage: withdrawal/refusal is an APPLICATION outcome, not a terminal entity state.'
WHERE key = 'withdrawn' AND domain = 'entity';

UPDATE public.lifecycle_stages SET
  is_active = false,
  description = 'RETIRED as an ENTITY stage: restriction is a LICENCE status; an entity may hold several licences with differing statuses.'
WHERE key = 'restricted' AND domain = 'entity';

UPDATE public.lifecycle_stages SET
  is_active = false,
  description = 'RETIRED as an ENTITY stage: suspension is a LICENCE status; an entity may hold several licences with differing statuses.'
WHERE key = 'suspended' AND domain = 'entity';

UPDATE public.lifecycle_stages SET
  description = 'Entity holds at least one licence in a non-terminal state. Per-licence restriction/suspension is licence status, not entity status.'
WHERE key = 'authorised' AND domain = 'entity';

UPDATE public.lifecycle_stages SET
  description = 'Entity exited the regulatory perimeter entirely (no live licence, no live application, no supervisory interest).',
  is_terminal = true
WHERE key = 'closed' AND domain = 'entity';

INSERT INTO public.lifecycle_stages (key,label,description,domain,is_terminal,sort_order,is_system) VALUES
 ('supervised_non_licensed','Supervised (Non-Licensed)','Within the regulatory perimeter without holding a licence (registered or notified organisation).','entity',false,35,true),
 ('former_licensee','Former Licensee','Held a licence in the past; no live authorisation but the record is retained for supervisory history.','entity',false,60,true),
 ('license_pending','Pending','Licence approved subject to conditions precedent; not yet effective.','license',false,10,true),
 ('license_active','Active','Licence in force.','license',false,20,true),
 ('license_restricted','Restricted','In force subject to restrictions or conditions.','license',false,30,true),
 ('license_suspended','Suspended','Temporarily suspended.','license',false,40,true),
 ('license_expired','Expired','Validity period ended without renewal.','license',true,50,true),
 ('license_surrendered','Surrendered','Voluntarily surrendered by the holder.','license',true,60,true),
 ('license_revoked','Revoked','Withdrawn by the regulator.','license',true,70,true),
 ('application_draft','Draft','Being prepared by the applicant.','application',false,10,true),
 ('application_submitted','Submitted','Received and awaiting completeness assessment.','application',false,20,true),
 ('application_under_review','Under Review','In substantive assessment.','application',false,30,true),
 ('application_info_requested','Information Requested','Awaiting applicant response to an information request.','application',false,40,true),
 ('application_approved','Approved','Decision taken to authorise.','application',true,50,true),
 ('application_rejected','Rejected','Refused by the regulator.','application',true,60,true),
 ('application_withdrawn','Withdrawn','Withdrawn by the applicant.','application',true,70,true)
ON CONFLICT (key) DO NOTHING;

UPDATE public.data_domains
SET default_authority = 'DEPLOYMENT_CONFIGURED',
    description = 'Legal name, registration number, incorporation details. Authority is chosen per deployment (LOCAL_AUTHORITATIVE / EXTERNAL_AUTHORITATIVE / HYBRID_AUTHORITY); no external registry is required.'
WHERE key = 'entity_identity';

ALTER TABLE public.entity_identifier_types
  ADD COLUMN IF NOT EXISTS uniqueness_scope text NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS scope_requires_jurisdiction boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scope_requires_issuer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS normalization_rule text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eit_uniqueness_scope_chk') THEN
    ALTER TABLE public.entity_identifier_types
      ADD CONSTRAINT eit_uniqueness_scope_chk
      CHECK (uniqueness_scope IN ('GLOBAL','JURISDICTION','ISSUER','REGULATOR','NONE'));
  END IF;
END $$;

UPDATE public.entity_identifier_types SET
  uniqueness_scope = 'JURISDICTION', scope_requires_jurisdiction = true, is_unique_global = false,
  normalization_rule = 'upper(trim(value)) with non-alphanumeric characters removed',
  description = 'Registry-issued number. Unique only within the issuing jurisdiction/registry — never assumed globally unique.'
WHERE key IN ('company_registration_number','taxpayer_registration_number');

UPDATE public.entity_identifier_types SET
  uniqueness_scope = 'GLOBAL', is_unique_global = true, normalization_rule = 'upper(trim(value))'
WHERE key = 'legal_entity_identifier';

UPDATE public.entity_identifier_types SET
  uniqueness_scope = 'REGULATOR', is_unique_global = false, normalization_rule = 'upper(trim(value))'
WHERE key IN ('regulatory_entity_number','license_number');

COMMENT ON COLUMN public.entity_identifier_types.uniqueness_scope IS
  'Scope in which an identifier value must be unique. Future entity_identifiers uniqueness indexes derive from (identifier_type_id, normalized_value) plus scope dimensions: JURISDICTION adds jurisdiction, ISSUER adds issuer, REGULATOR adds regulator, GLOBAL adds nothing, NONE creates no uniqueness index.';
COMMENT ON COLUMN public.entity_identifier_types.is_unique_global IS
  'Compatibility flag only — derived from uniqueness_scope = GLOBAL. uniqueness_scope is authoritative.';

ALTER TABLE public.relationship_types
  ADD COLUMN IF NOT EXISTS inverse_relationship_type_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relationship_types_inverse_fk') THEN
    ALTER TABLE public.relationship_types
      ADD CONSTRAINT relationship_types_inverse_fk
      FOREIGN KEY (inverse_relationship_type_id)
      REFERENCES public.relationship_types(id) ON DELETE RESTRICT;
  END IF;
END $$;

UPDATE public.relationship_types t
SET inverse_relationship_type_id = i.id
FROM public.relationship_types i
WHERE t.inverse_key IS NOT NULL AND i.key = t.inverse_key
  AND t.inverse_relationship_type_id IS DISTINCT FROM i.id;

COMMENT ON COLUMN public.relationship_types.inverse_key IS
  'COMPATIBILITY ONLY. inverse_relationship_type_id is authoritative; inverse_key must resolve to an existing relationship type.';

CREATE OR REPLACE FUNCTION public.rdm_relationship_inverse_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_key text;
BEGIN
  IF NEW.inverse_relationship_type_id IS NOT NULL THEN
    SELECT key INTO v_key FROM public.relationship_types WHERE id = NEW.inverse_relationship_type_id;
    IF v_key IS NULL THEN
      RAISE EXCEPTION 'Inverse relationship type % does not exist', NEW.inverse_relationship_type_id;
    END IF;
    NEW.inverse_key := v_key;
  ELSIF NEW.inverse_key IS NOT NULL THEN
    SELECT id INTO v_id FROM public.relationship_types WHERE key = NEW.inverse_key;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Inverse relationship key "%" does not resolve to a relationship type', NEW.inverse_key;
    END IF;
    NEW.inverse_relationship_type_id := v_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS relationship_types_inverse_guard ON public.relationship_types;
CREATE TRIGGER relationship_types_inverse_guard
BEFORE INSERT OR UPDATE ON public.relationship_types
FOR EACH ROW EXECUTE FUNCTION public.rdm_relationship_inverse_guard();

UPDATE public.relationship_types SET
  description = COALESCE(NULLIF(description,'') || ' ', '') ||
    'NOT an ownership ledger: shareholding percentages, voting rights, beneficial ownership and control history become authoritative in the future ownership model; this type is a typed relationship only.'
WHERE is_ownership = true
  AND COALESCE(description,'') NOT LIKE '%NOT an ownership ledger%';

CREATE UNIQUE INDEX IF NOT EXISTS ux_erp_single_active_default
  ON public.entity_resolution_policies (is_default) WHERE is_default AND is_active;

CREATE UNIQUE INDEX IF NOT EXISTS ux_erfp_single_active_default
  ON public.entity_registry_failure_policies (is_default) WHERE is_default AND is_active;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'erp_provisional_consistency_chk') THEN
    ALTER TABLE public.entity_resolution_policies
      ADD CONSTRAINT erp_provisional_consistency_chk
      CHECK (on_no_match <> 'ALLOW_PROVISIONAL' OR allow_provisional_entity = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'erp_local_authority_chk') THEN
    ALTER TABLE public.entity_resolution_policies
      ADD CONSTRAINT erp_local_authority_chk
      CHECK (registry_authority_mode <> 'LOCAL_AUTHORITATIVE' OR on_no_match <> 'CREATE_VIA_EXTERNAL_API');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'erfp_last_verified_consistency_chk') THEN
    ALTER TABLE public.entity_registry_failure_policies
      ADD CONSTRAINT erfp_last_verified_consistency_chk
      CHECK (on_provider_unavailable <> 'ALLOW_LAST_VERIFIED'
             OR (allow_last_verified_projection = true AND COALESCE(max_staleness_hours,0) > 0));
  END IF;
END $$;

ALTER TABLE public.classification_values
  DROP CONSTRAINT IF EXISTS classification_values_scheme_id_fkey,
  DROP CONSTRAINT IF EXISTS classification_values_parent_id_fkey;

ALTER TABLE public.classification_values
  ADD CONSTRAINT classification_values_scheme_id_fkey
    FOREIGN KEY (scheme_id) REFERENCES public.classification_schemes(id) ON DELETE RESTRICT,
  ADD CONSTRAINT classification_values_parent_id_fkey
    FOREIGN KEY (parent_id) REFERENCES public.classification_values(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.rdm_guard_metadata_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.key IS DISTINCT FROM OLD.key THEN
      RAISE EXCEPTION 'Metadata key "%" is immutable (table %). Retire the row (is_active = false) and create a new key instead.',
        OLD.key, TG_TABLE_NAME USING ERRCODE = '42501';
    END IF;
    IF NEW.is_system IS DISTINCT FROM OLD.is_system THEN
      RAISE EXCEPTION 'is_system cannot be changed on regulatory metadata (table %)', TG_TABLE_NAME USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.is_system THEN
    RAISE EXCEPTION 'System regulatory metadata "%" cannot be deleted (table %). Retire it with is_active = false.',
      OLD.key, TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'classification_schemes','classification_values','lifecycle_stages',
    'entity_identity_statuses','relationship_types','role_types',
    'form_purposes','form_trigger_types','data_domains',
    'entity_identifier_types','entity_resolution_policies',
    'entity_registry_failure_policies'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t||'_guard', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.rdm_guard_metadata_row()', t||'_guard', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.rdm_audit_metadata_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id text; v_action text; v_old jsonb; v_new jsonb;
BEGIN
  v_old := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_id := COALESCE((to_jsonb(COALESCE(NEW, OLD)) ->> 'id'), '');
  v_action := CASE
    WHEN TG_OP = 'INSERT' THEN 'regulatory_data.metadata.created'
    WHEN TG_OP = 'DELETE' THEN 'regulatory_data.metadata.deleted'
    WHEN COALESCE((v_old ->> 'is_active')::boolean, true) AND NOT COALESCE((v_new ->> 'is_active')::boolean, true)
      THEN 'regulatory_data.metadata.retired'
    WHEN NOT COALESCE((v_old ->> 'is_active')::boolean, true) AND COALESCE((v_new ->> 'is_active')::boolean, true)
      THEN 'regulatory_data.metadata.reinstated'
    ELSE 'regulatory_data.metadata.updated'
  END;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (auth.uid(), v_action, TG_TABLE_NAME, v_id, v_old, v_new,
    jsonb_build_object('program','RDM-ENTITY-001','phase','1.1','table',TG_TABLE_NAME));
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION public.rdm_metadata_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ARRAY[
    'classification_schemes','classification_values','lifecycle_stages',
    'entity_identity_statuses','relationship_types','role_types',
    'form_purposes','form_trigger_types','data_domains',
    'entity_identifier_types','entity_resolution_policies',
    'entity_registry_failure_policies'
  ]
$$;

CREATE OR REPLACE FUNCTION public.rdm_save_metadata(_table text, _values jsonb, _id uuid DEFAULT NULL)
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

CREATE OR REPLACE FUNCTION public.rdm_retire_metadata(_table text, _id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.rdm_can_write() THEN
    RAISE EXCEPTION 'Not authorised to change regulatory data model configuration' USING ERRCODE = '42501';
  END IF;
  IF NOT (_table = ANY (public.rdm_metadata_tables())) THEN
    RAISE EXCEPTION 'Unknown regulatory metadata table: %', _table USING ERRCODE = '22023';
  END IF;
  IF _table IN ('entity_resolution_policies','entity_registry_failure_policies') THEN
    EXECUTE format('UPDATE public.%I SET is_active = false, is_default = false WHERE id = $1', _table) USING _id;
  ELSE
    EXECUTE format('UPDATE public.%I SET is_active = false WHERE id = $1', _table) USING _id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.rdm_delete_metadata(_table text, _id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_is_system boolean; v_refs integer := 0;
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
  EXECUTE format('DELETE FROM public.%I WHERE id = $1', _table) USING _id;
END $$;

REVOKE ALL ON FUNCTION public.rdm_save_metadata(text, jsonb, uuid) FROM public;
REVOKE ALL ON FUNCTION public.rdm_retire_metadata(text, uuid) FROM public;
REVOKE ALL ON FUNCTION public.rdm_delete_metadata(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rdm_save_metadata(text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rdm_retire_metadata(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rdm_delete_metadata(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rdm_metadata_tables() TO authenticated;