-- =====================================================================
-- F8A-B4: canonical address primitive, address usages,
-- deterministic common-address intelligence, projection + search.
-- =====================================================================

-- ---------- 1. Deterministic normalization -------------------------

CREATE OR REPLACE FUNCTION public.address_normalization_version()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 1 $$;

CREATE OR REPLACE FUNCTION public.address_norm_text(_in text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(btrim(regexp_replace(
    translate(upper(coalesce(_in, '')),
      'ÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÝÑÇ',
      'AAAAAAEEEEIIIIOOOOOUUUUYNC'),
    '[^A-Z0-9]+', ' ', 'g')), '')
$$;

CREATE OR REPLACE FUNCTION public.address_norm_street(_in text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE s text;
BEGIN
  s := public.address_norm_text(_in);
  IF s IS NULL THEN RETURN NULL; END IF;

  -- post office boxes
  s := regexp_replace(s, '\yP O BOX\y', 'POBOX', 'g');
  s := regexp_replace(s, '\yPO BOX\y', 'POBOX', 'g');
  s := regexp_replace(s, '\yPOB\y', 'POBOX', 'g');

  -- unit designators (applied first; 'STE' must not become 'STREET')
  s := regexp_replace(s, '\y(APARTMENT|APARTMENTS|APT|UNIT|SUITE|STE|FLAT|ROOM|RM|NUMBER|NUM|NO)\y', 'UNIT', 'g');

  -- unambiguous street-type abbreviations (safe anywhere)
  s := regexp_replace(s, '\y(STREET|STR)\y', 'STREET', 'g');
  s := regexp_replace(s, '\y(AVENUE|AVE)\y', 'AVENUE', 'g');
  s := regexp_replace(s, '\y(ROAD|RD)\y', 'ROAD', 'g');
  s := regexp_replace(s, '\y(BOULEVARD|BLVD|BLV)\y', 'BOULEVARD', 'g');
  s := regexp_replace(s, '\y(LANE|LN)\y', 'LANE', 'g');
  s := regexp_replace(s, '\y(HIGHWAY|HWY)\y', 'HIGHWAY', 'g');
  s := regexp_replace(s, '\y(SQUARE|SQ)\y', 'SQUARE', 'g');
  s := regexp_replace(s, '\y(CRESCENT|CRES)\y', 'CRESCENT', 'g');
  s := regexp_replace(s, '\y(BUILDING|BLDG)\y', 'BUILDING', 'g');
  s := regexp_replace(s, '\y(FLOOR|FLR)\y', 'FLOOR', 'g');
  s := regexp_replace(s, '\y(COURT|CRT)\y', 'COURT', 'g');
  s := regexp_replace(s, '\y(DRIVE|DRV)\y', 'DRIVE', 'g');

  -- ambiguous abbreviations: suffix position only.
  -- ('ST KITTS' must never become 'STREET KITTS'; 'DR SMITH' must not become 'DRIVE SMITH')
  s := regexp_replace(s, '\yST$', 'STREET');
  s := regexp_replace(s, '\yAV$', 'AVENUE');
  s := regexp_replace(s, '\yDR$', 'DRIVE');
  s := regexp_replace(s, '\yCT$', 'COURT');
  s := regexp_replace(s, '\yPL$', 'PLACE');
  s := regexp_replace(s, '\yFL$', 'FLOOR');

  RETURN nullif(btrim(regexp_replace(s, ' +', ' ', 'g')), '');
END $$;

CREATE OR REPLACE FUNCTION public.address_normalize_key(
  _country_code text, _admin_area text, _locality text,
  _postal_code text, _street_line1 text, _street_line2 text, _unit text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(coalesce(_country_code, ''))
      || '|' || coalesce(public.address_norm_text(_admin_area), '')
      || '|' || coalesce(public.address_norm_text(_locality), '')
      || '|' || coalesce(replace(public.address_norm_text(_postal_code), ' ', ''), '')
      || '|' || coalesce(public.address_norm_street(
                 concat_ws(' ', _street_line1, _street_line2, _unit)), '')
$$;

-- ---------- 2. Canonical address primitive -------------------------

CREATE TABLE public.addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  country_item_id uuid REFERENCES public.master_data_items(id),
  admin_area_item_id uuid REFERENCES public.master_data_items(id),
  locality_item_id uuid REFERENCES public.master_data_items(id),
  admin_area text,
  locality text,
  postal_code text,
  street_line1 text NOT NULL,
  street_line2 text,
  unit text,
  raw_text text,
  normalization_version integer NOT NULL DEFAULT 1 CHECK (normalization_version = 1),
  normalized_key text GENERATED ALWAYS AS (
    public.address_normalize_key(country_code, admin_area, locality,
                                 postal_code, street_line1, street_line2, unit)
  ) STORED,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT addresses_street_not_blank CHECK (btrim(street_line1) <> '')
);

CREATE UNIQUE INDEX addresses_canonical_key_uq
  ON public.addresses (normalized_key, normalization_version);
CREATE INDEX addresses_country_idx ON public.addresses (country_code);

COMMENT ON TABLE public.addresses IS
  'F8A-B4 canonical address primitive. normalized_key is generated and immutable; '
  'deduplication is deterministic on (normalized_key, normalization_version). No fuzzy matching.';

-- ---------- 3. Address usages --------------------------------------

CREATE TABLE public.address_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address_id uuid NOT NULL REFERENCES public.addresses(id) ON DELETE RESTRICT,
  subject_kind text NOT NULL CHECK (subject_kind IN ('ENTITY', 'PERSON', 'ESTABLISHMENT')),
  subject_id uuid NOT NULL,
  usage_type text NOT NULL CHECK (usage_type IN ('REGISTERED', 'PRINCIPAL', 'CORRESPONDENCE', 'OPERATING')),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  source_kind text NOT NULL CHECK (source_kind IN ('REGISTRATION', 'FP_DECLARATION', 'ESTABLISHMENT', 'MANUAL', 'PROJECTION')),
  source_id uuid,
  source_detail text,
  approval_status text NOT NULL DEFAULT 'PROPOSED' CHECK (approval_status IN ('PROPOSED', 'APPROVED', 'REJECTED')),
  approved_by uuid,
  approved_at timestamptz,
  verified_by uuid,
  verified_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT address_usages_effective_range CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT address_usages_approval_metadata CHECK (
    (approval_status = 'APPROVED') = (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX address_usages_natural_uq
  ON public.address_usages (address_id, subject_kind, subject_id, usage_type, effective_from);
CREATE INDEX address_usages_subject_idx ON public.address_usages (subject_kind, subject_id);
CREATE INDEX address_usages_address_idx ON public.address_usages (address_id);

COMMENT ON TABLE public.address_usages IS
  'F8A-B4 effective-dated link between a canonical address and an ENTITY / PERSON / ESTABLISHMENT subject.';

-- ---------- 4. Integrity guards ------------------------------------

CREATE OR REPLACE FUNCTION public.address_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER addresses_touch BEFORE UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.address_touch_updated_at();
CREATE TRIGGER address_usages_touch BEFORE UPDATE ON public.address_usages
  FOR EACH ROW EXECUTE FUNCTION public.address_touch_updated_at();

-- canonical-subject guard: the subject must exist in the canonical source of truth
CREATE OR REPLACE FUNCTION public.address_usage_subject_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.subject_kind = 'ENTITY' THEN
    IF NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = NEW.subject_id) THEN
      RAISE EXCEPTION 'ADDRESS_SUBJECT_NOT_FOUND: no licensee %', NEW.subject_id;
    END IF;
  ELSIF NEW.subject_kind = 'PERSON' THEN
    IF NOT EXISTS (SELECT 1 FROM public.parties WHERE id = NEW.subject_id AND party_kind = 'PERSON') THEN
      RAISE EXCEPTION 'ADDRESS_SUBJECT_NOT_FOUND: no canonical PERSON party %', NEW.subject_id;
    END IF;
  ELSIF NEW.subject_kind = 'ESTABLISHMENT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.regulated_establishments WHERE id = NEW.subject_id) THEN
      RAISE EXCEPTION 'ADDRESS_SUBJECT_NOT_FOUND: no establishment %', NEW.subject_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER address_usages_subject_guard
  BEFORE INSERT OR UPDATE OF subject_kind, subject_id ON public.address_usages
  FOR EACH ROW EXECUTE FUNCTION public.address_usage_subject_guard();

-- ---------- 5. Visibility helper -----------------------------------

CREATE OR REPLACE FUNCTION public.address_usage_visible(_user_id uuid, _kind text, _subject_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _entity uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_user_id) THEN RETURN true; END IF;
  IF NOT public.has_permission(_user_id, 'entity_structure', 'view') THEN RETURN false; END IF;

  IF _kind = 'ENTITY' THEN
    _entity := _subject_id;
  ELSIF _kind = 'ESTABLISHMENT' THEN
    SELECT entity_id INTO _entity FROM public.regulated_establishments WHERE id = _subject_id;
  ELSIF _kind = 'PERSON' THEN
    -- a person is visible only through an in-scope connected entity
    RETURN EXISTS (
      SELECT 1 FROM public.entity_appointments a
      WHERE a.person_party_id = _subject_id
        AND public.regulatory_scope_allows(_user_id, 'entity_structure', 'view',
              public.entity_reporting_regulator(a.entity_id), NULL, NULL, a.entity_id, NULL)
    ) OR EXISTS (
      SELECT 1 FROM public.ownership_interests o
      WHERE o.owner_party_id = _subject_id AND o.owned_entity_id IS NOT NULL
        AND public.regulatory_scope_allows(_user_id, 'entity_structure', 'view',
              public.entity_reporting_regulator(o.owned_entity_id), NULL, NULL, o.owned_entity_id, NULL)
    );
  ELSE
    RETURN false;
  END IF;

  IF _entity IS NULL THEN RETURN false; END IF;
  RETURN public.regulatory_scope_allows(_user_id, 'entity_structure', 'view',
           public.entity_reporting_regulator(_entity), NULL, NULL, _entity, NULL);
END $$;

-- ---------- 6. Grants + RLS ----------------------------------------

GRANT SELECT ON public.addresses TO authenticated;
GRANT SELECT ON public.address_usages TO authenticated;
GRANT ALL ON public.addresses TO service_role;
GRANT ALL ON public.address_usages TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.addresses FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.address_usages FROM authenticated, anon;
REVOKE ALL ON public.addresses FROM anon;
REVOKE ALL ON public.address_usages FROM anon;

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.address_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY addresses_read ON public.addresses FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'entity_structure', 'view'));

CREATE POLICY address_usages_read ON public.address_usages FOR SELECT TO authenticated
  USING (public.address_usage_visible(auth.uid(), subject_kind, subject_id));

-- ---------- 7. Authorization + audit helpers ------------------------

CREATE OR REPLACE FUNCTION public.address_require(_action text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'ADDRESS_AUTH_REQUIRED: authentication is required';
  END IF;
  IF NOT (public.is_super_admin(_uid) OR public.has_permission(_uid, 'entity_structure', _action)) THEN
    RAISE EXCEPTION 'ADDRESS_PERMISSION_DENIED: entity_structure.% is required', _action;
  END IF;
  RETURN _uid;
END $$;

CREATE OR REPLACE FUNCTION public.address_audit(
  _uid uuid, _action text, _entity_type text, _entity_id uuid,
  _old jsonb, _new jsonb, _meta jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (_uid, _action, _entity_type, _entity_id, _old, _new,
          coalesce(_meta, '{}'::jsonb) || jsonb_build_object('wave', 'F8A-B4'));
END $$;

-- ---------- 8. Governed mutations ----------------------------------

CREATE OR REPLACE FUNCTION public.address_upsert_canonical(
  _country_code text, _street_line1 text,
  _street_line2 text DEFAULT NULL, _unit text DEFAULT NULL,
  _locality text DEFAULT NULL, _admin_area text DEFAULT NULL,
  _postal_code text DEFAULT NULL, _raw_text text DEFAULT NULL,
  _country_item_id uuid DEFAULT NULL, _admin_area_item_id uuid DEFAULT NULL,
  _locality_item_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _key text; _id uuid;
BEGIN
  _uid := public.address_require('propose');

  IF _country_code IS NULL OR _country_code !~ '^[A-Za-z]{2}$' THEN
    RAISE EXCEPTION 'ADDRESS_INVALID_COUNTRY: a 2-letter ISO country code is required';
  END IF;
  IF coalesce(btrim(_street_line1), '') = '' THEN
    RAISE EXCEPTION 'ADDRESS_INVALID_STREET: street_line1 is required';
  END IF;

  _key := public.address_normalize_key(upper(_country_code), _admin_area, _locality,
                                       _postal_code, _street_line1, _street_line2, _unit);

  SELECT id INTO _id FROM public.addresses
   WHERE normalized_key = _key AND normalization_version = public.address_normalization_version();

  IF _id IS NOT NULL THEN
    RETURN _id;  -- deterministic dedupe; never a second canonical row
  END IF;

  INSERT INTO public.addresses (country_code, country_item_id, admin_area_item_id, locality_item_id,
                                admin_area, locality, postal_code, street_line1, street_line2, unit,
                                raw_text, created_by)
  VALUES (upper(_country_code), _country_item_id, _admin_area_item_id, _locality_item_id,
          _admin_area, _locality, _postal_code, _street_line1, _street_line2, _unit, _raw_text, _uid)
  RETURNING id INTO _id;

  PERFORM public.address_audit(_uid, 'address.created', 'address', _id, NULL,
    jsonb_build_object('normalized_key', _key, 'country_code', upper(_country_code)), NULL);
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.address_usage_propose(
  _address_id uuid, _subject_kind text, _subject_id uuid, _usage_type text,
  _effective_from date DEFAULT CURRENT_DATE, _source_kind text DEFAULT 'MANUAL',
  _source_id uuid DEFAULT NULL, _source_detail text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _id uuid;
BEGIN
  _uid := public.address_require('propose');

  SELECT id INTO _id FROM public.address_usages
   WHERE address_id = _address_id AND subject_kind = _subject_kind
     AND subject_id = _subject_id AND usage_type = _usage_type
     AND effective_from = _effective_from;
  IF _id IS NOT NULL THEN RETURN _id; END IF;  -- idempotent

  INSERT INTO public.address_usages (address_id, subject_kind, subject_id, usage_type,
                                     effective_from, source_kind, source_id, source_detail, created_by)
  VALUES (_address_id, _subject_kind, _subject_id, _usage_type,
          _effective_from, _source_kind, _source_id, _source_detail, _uid)
  RETURNING id INTO _id;

  PERFORM public.address_audit(_uid, 'address_usage.proposed', 'address_usage', _id, NULL,
    jsonb_build_object('address_id', _address_id, 'subject_kind', _subject_kind,
                       'subject_id', _subject_id, 'usage_type', _usage_type,
                       'effective_from', _effective_from, 'source_kind', _source_kind), NULL);
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.address_usage_approve(_usage_id uuid, _verify boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _old jsonb; _kind text; _subject uuid;
BEGIN
  _uid := public.address_require('approve');

  SELECT to_jsonb(u), u.subject_kind, u.subject_id INTO _old, _kind, _subject
    FROM public.address_usages u WHERE u.id = _usage_id;
  IF _old IS NULL THEN
    RAISE EXCEPTION 'ADDRESS_USAGE_NOT_FOUND: %', _usage_id;
  END IF;
  IF NOT public.address_usage_visible(_uid, _kind, _subject) THEN
    RAISE EXCEPTION 'ADDRESS_SCOPE_DENIED: subject is outside your regulatory scope';
  END IF;
  IF (_old ->> 'approval_status') = 'APPROVED' THEN
    RETURN _usage_id;  -- idempotent
  END IF;

  UPDATE public.address_usages
     SET approval_status = 'APPROVED', approved_by = _uid, approved_at = now(),
         verified_by = CASE WHEN _verify THEN _uid ELSE verified_by END,
         verified_at = CASE WHEN _verify THEN now() ELSE verified_at END
   WHERE id = _usage_id;

  PERFORM public.address_audit(_uid, 'address_usage.approved', 'address_usage', _usage_id,
    _old, jsonb_build_object('approval_status', 'APPROVED', 'verified', _verify), NULL);
  RETURN _usage_id;
END $$;

CREATE OR REPLACE FUNCTION public.address_usage_end(_usage_id uuid, _effective_to date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _old jsonb; _kind text; _subject uuid;
BEGIN
  _uid := public.address_require('approve');

  SELECT to_jsonb(u), u.subject_kind, u.subject_id INTO _old, _kind, _subject
    FROM public.address_usages u WHERE u.id = _usage_id;
  IF _old IS NULL THEN
    RAISE EXCEPTION 'ADDRESS_USAGE_NOT_FOUND: %', _usage_id;
  END IF;
  IF NOT public.address_usage_visible(_uid, _kind, _subject) THEN
    RAISE EXCEPTION 'ADDRESS_SCOPE_DENIED: subject is outside your regulatory scope';
  END IF;
  IF _effective_to IS NULL OR _effective_to < (_old ->> 'effective_from')::date THEN
    RAISE EXCEPTION 'ADDRESS_INVALID_END_DATE: effective_to must be on or after effective_from';
  END IF;

  UPDATE public.address_usages SET effective_to = _effective_to WHERE id = _usage_id;

  PERFORM public.address_audit(_uid, 'address_usage.ended', 'address_usage', _usage_id,
    _old, jsonb_build_object('effective_to', _effective_to), NULL);
  RETURN _usage_id;
END $$;

-- ---------- 9. Deterministic common-address intelligence ------------

CREATE OR REPLACE FUNCTION public.address_common_matches(
  _address_id uuid, _as_of date DEFAULT CURRENT_DATE, _limit integer DEFAULT 200)
RETURNS TABLE (
  match_class text, address_id uuid, subject_kind text, subject_id uuid,
  subject_name text, usage_type text, approval_status text,
  effective_from date, effective_to date, source_kind text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _key text; _raw text; _cap integer;
BEGIN
  _uid := public.address_require('view');
  _cap := least(greatest(coalesce(_limit, 200), 1), 500);

  SELECT a.normalized_key, coalesce(a.raw_text, '') INTO _key, _raw
    FROM public.addresses a WHERE a.id = _address_id;
  IF _key IS NULL THEN
    RAISE EXCEPTION 'ADDRESS_NOT_FOUND: %', _address_id;
  END IF;

  RETURN QUERY
  SELECT
    CASE WHEN u.address_id = _address_id THEN 'EXACT' ELSE 'NORMALIZED' END::text,
    u.address_id, u.subject_kind, u.subject_id,
    CASE u.subject_kind
      WHEN 'ENTITY' THEN (SELECT l.name FROM public.licensees l WHERE l.id = u.subject_id)
      WHEN 'PERSON' THEN (SELECT p.display_name FROM public.parties p WHERE p.id = u.subject_id)
      ELSE (SELECT e.name FROM public.regulated_establishments e WHERE e.id = u.subject_id)
    END,
    u.usage_type, u.approval_status, u.effective_from, u.effective_to, u.source_kind
  FROM public.address_usages u
  JOIN public.addresses a2 ON a2.id = u.address_id
  WHERE a2.normalized_key = _key
    AND a2.normalization_version = public.address_normalization_version()
    AND u.approval_status <> 'REJECTED'
    AND u.effective_from <= _as_of
    AND (u.effective_to IS NULL OR u.effective_to >= _as_of)
    AND public.address_usage_visible(_uid, u.subject_kind, u.subject_id)
  ORDER BY 1, u.subject_kind, u.effective_from DESC
  LIMIT _cap;
END $$;

COMMENT ON FUNCTION public.address_common_matches(uuid, date, integer) IS
  'F8A-B4 deterministic co-location. Match classes are limited to EXACT (same canonical row) and '
  'NORMALIZED (same normalized_key). No fuzzy, probabilistic or AI matching exists on this path.';

-- ---------- 10. Address 360 -----------------------------------------

CREATE OR REPLACE FUNCTION public.address_360_overview(_address_id uuid, _as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _a public.addresses; _result jsonb;
BEGIN
  _uid := public.address_require('view');

  SELECT * INTO _a FROM public.addresses WHERE id = _address_id;
  IF _a.id IS NULL THEN
    RAISE EXCEPTION 'ADDRESS_NOT_FOUND: %', _address_id;
  END IF;

  SELECT jsonb_build_object(
    'address', jsonb_build_object(
      'id', _a.id, 'country_code', _a.country_code, 'admin_area', _a.admin_area,
      'locality', _a.locality, 'postal_code', _a.postal_code,
      'street_line1', _a.street_line1, 'street_line2', _a.street_line2, 'unit', _a.unit,
      'normalized_key', _a.normalized_key, 'normalization_version', _a.normalization_version),
    'as_of', _as_of,
    'occupants', coalesce((
      SELECT jsonb_agg(to_jsonb(m) ORDER BY m.subject_kind, m.subject_name)
        FROM public.address_common_matches(_address_id, _as_of, 500) m), '[]'::jsonb),
    'occupant_count', (SELECT count(*) FROM public.address_common_matches(_address_id, _as_of, 500)),
    'scope_note', 'Only subjects inside your regulatory scope are listed.'
  ) INTO _result;

  RETURN _result;
END $$;

-- ---------- 11. Relationship intelligence search ---------------------

CREATE OR REPLACE FUNCTION public.relationship_intelligence_search(
  _query text, _kinds text[] DEFAULT ARRAY['ENTITY','PERSON','ADDRESS'], _limit integer DEFAULT 25)
RETURNS TABLE (result_kind text, result_id uuid, title text, subtitle text, detail text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _q text; _cap integer;
BEGIN
  _uid := public.address_require('view');
  _q := btrim(coalesce(_query, ''));
  IF length(_q) < 3 THEN
    RAISE EXCEPTION 'INTELLIGENCE_QUERY_TOO_SHORT: at least 3 characters are required';
  END IF;
  _cap := least(greatest(coalesce(_limit, 25), 1), 100);

  RETURN QUERY
  WITH ent AS (
    SELECT 'ENTITY'::text k, l.id, l.name::text t, 'Licensed entity'::text s, NULL::text d
      FROM public.licensees l
     WHERE 'ENTITY' = ANY(_kinds) AND l.name ILIKE '%' || _q || '%'
       AND (public.is_super_admin(_uid) OR public.regulatory_scope_allows(
              _uid, 'entity_structure', 'view',
              public.entity_reporting_regulator(l.id), NULL, NULL, l.id, NULL))
  ), per AS (
    SELECT 'PERSON'::text k, p.id, p.display_name::text t, 'Canonical person'::text s, NULL::text d
      FROM public.parties p
     WHERE 'PERSON' = ANY(_kinds) AND p.party_kind = 'PERSON'
       AND p.display_name ILIKE '%' || _q || '%'
       AND public.address_usage_visible(_uid, 'PERSON', p.id)
  ), addr AS (
    SELECT DISTINCT 'ADDRESS'::text k, a.id,
           concat_ws(', ', a.street_line1, a.locality, a.country_code)::text t,
           'Canonical address'::text s, a.normalized_key::text d
      FROM public.addresses a
      JOIN public.address_usages u ON u.address_id = a.id
     WHERE 'ADDRESS' = ANY(_kinds)
       AND (a.street_line1 ILIKE '%' || _q || '%' OR a.locality ILIKE '%' || _q || '%'
            OR a.postal_code ILIKE '%' || _q || '%'
            OR a.normalized_key LIKE '%' || coalesce(public.address_norm_street(_q), '~none~') || '%')
       AND public.address_usage_visible(_uid, u.subject_kind, u.subject_id)
  )
  SELECT * FROM (SELECT * FROM ent UNION ALL SELECT * FROM per UNION ALL SELECT * FROM addr) x
  ORDER BY x.k, x.t
  LIMIT _cap;
END $$;

COMMENT ON FUNCTION public.relationship_intelligence_search(text, text[], integer) IS
  'F8A-B4 bounded, regulator-scoped intelligence search. Returns no date of birth, national id or '
  'passport data. Governed by entity_structure.view.';

-- ---------- 12. Projection from existing structured sources ----------

CREATE OR REPLACE FUNCTION public.address_master_data_label(_item_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.name FROM public.master_data_items i WHERE i.id = _item_id
$$;

CREATE OR REPLACE FUNCTION public.address_master_data_iso2(_item_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT upper(substring(coalesce(nullif(i.metadata ->> 'iso2', ''),
                                  nullif(i.metadata ->> 'code', ''),
                                  nullif(i.code, ''), '') from 1 for 2))
    FROM public.master_data_items i WHERE i.id = _item_id
$$;

-- Unresolved-projection queue: source addresses that CANNOT be deterministically
-- attached to a canonical subject. Nothing is invented; these await manual action.
CREATE OR REPLACE FUNCTION public.address_projection_queue()
RETURNS TABLE (source_kind text, source_id uuid, subject_label text, reason text, address_preview text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  _uid := public.address_require('view');

  RETURN QUERY
  -- fit & proper declarations whose person is not yet linked to a canonical party (B3 queue)
  SELECT 'FP_DECLARATION'::text, f.id, f.full_name::text,
         'UNRESOLVED_PERSON_IDENTITY'::text, left(f.address, 120)::text
    FROM public.fp_individuals f
   WHERE coalesce(btrim(f.address), '') <> ''
     AND NOT EXISTS (SELECT 1 FROM public.fp_individual_party_links l WHERE l.fp_individual_id = f.id)
  UNION ALL
  -- registrations holding an address but not yet bound to an entity
  SELECT 'REGISTRATION'::text, r.id, coalesce(r.applicant_name, r.registration_reference)::text,
         'UNBOUND_REGISTRATION'::text, left(r.physical_address ->> 'street', 120)::text
    FROM public.registrations r
   WHERE jsonb_typeof(r.physical_address) = 'object'
     AND coalesce(btrim(r.physical_address ->> 'street'), '') <> ''
     AND NOT EXISTS (SELECT 1 FROM public.registration_entity_bindings b WHERE b.registration_id = r.id)
  ORDER BY 1, 3;
END $$;

COMMENT ON FUNCTION public.address_projection_queue() IS
  'F8A-B4: source addresses that cannot be deterministically attributed to a canonical subject. '
  'Projection deliberately refuses to create a party or entity to clear this queue.';

CREATE OR REPLACE FUNCTION public.address_project_sources()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid; _r record; _addr uuid; _cc text;
  _created integer := 0; _linked integer := 0; _skipped integer := 0;
BEGIN
  _uid := public.address_require('apply');

  -- (a) registrations deterministically bound to an entity
  FOR _r IN
    SELECT r.id AS reg_id, b.entity_id, r.physical_address AS pa
      FROM public.registrations r
      JOIN public.registration_entity_bindings b ON b.registration_id = r.id
     WHERE jsonb_typeof(r.physical_address) = 'object'
       AND coalesce(btrim(r.physical_address ->> 'street'), '') <> ''
  LOOP
    _cc := public.address_master_data_iso2((_r.pa ->> 'country')::uuid);
    IF _cc IS NULL OR _cc !~ '^[A-Z]{2}$' THEN
      _skipped := _skipped + 1; CONTINUE;
    END IF;

    _addr := public.address_upsert_canonical(
      _cc, _r.pa ->> 'street', NULL, NULL,
      public.address_master_data_label((_r.pa ->> 'city')::uuid),
      public.address_master_data_label((_r.pa ->> 'state')::uuid),
      _r.pa ->> 'postCode', _r.pa::text,
      (_r.pa ->> 'country')::uuid, (_r.pa ->> 'state')::uuid, (_r.pa ->> 'city')::uuid);
    _created := _created + 1;

    PERFORM public.address_usage_propose(_addr, 'ENTITY', _r.entity_id, 'REGISTERED',
      CURRENT_DATE, 'REGISTRATION', _r.reg_id, 'projected from registration physical address');
    _linked := _linked + 1;
  END LOOP;

  -- (b) establishments with a free-text operating address
  FOR _r IN
    SELECT e.id AS est_id, e.address_text, e.entity_id
      FROM public.regulated_establishments e
     WHERE coalesce(btrim(e.address_text), '') <> ''
  LOOP
    _addr := public.address_upsert_canonical('KN', _r.address_text, NULL, NULL,
                                             NULL, NULL, NULL, _r.address_text);
    _created := _created + 1;
    PERFORM public.address_usage_propose(_addr, 'ESTABLISHMENT', _r.est_id, 'OPERATING',
      CURRENT_DATE, 'ESTABLISHMENT', _r.est_id, 'projected from establishment address');
    _linked := _linked + 1;
  END LOOP;

  -- (c) fit & proper declarations: ONLY where B3 established a canonical party link.
  --     Unresolved identities are never invented; they stay in address_projection_queue().
  FOR _r IN
    SELECT f.id AS fp_id, f.address, l.person_party_id
      FROM public.fp_individuals f
      JOIN public.fp_individual_party_links l ON l.fp_individual_id = f.id
     WHERE coalesce(btrim(f.address), '') <> ''
  LOOP
    _addr := public.address_upsert_canonical('KN', _r.address, NULL, NULL,
                                             NULL, NULL, NULL, _r.address);
    _created := _created + 1;
    PERFORM public.address_usage_propose(_addr, 'PERSON', _r.person_party_id, 'CORRESPONDENCE',
      CURRENT_DATE, 'FP_DECLARATION', _r.fp_id, 'projected from fit & proper declaration');
    _linked := _linked + 1;
  END LOOP;

  SELECT _skipped + count(*) INTO _skipped FROM public.address_projection_queue();

  PERFORM public.address_audit(_uid, 'address.projection_sweep', 'address', NULL, NULL,
    jsonb_build_object('addresses_touched', _created, 'usages_touched', _linked,
                       'unresolved', _skipped), NULL);

  RETURN jsonb_build_object('addresses_touched', _created, 'usages_touched', _linked,
                            'unresolved', _skipped);
END $$;

-- ---------- 13. Person 360 integration -------------------------------

CREATE OR REPLACE FUNCTION public.person_address_intelligence(
  _party_id uuid, _as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _rows jsonb;
BEGIN
  _uid := public.address_require('view');
  IF NOT public.address_usage_visible(_uid, 'PERSON', _party_id) THEN
    RAISE EXCEPTION 'ADDRESS_SCOPE_DENIED: person is outside your regulatory scope';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'effective_from' DESC), '[]'::jsonb) INTO _rows
    FROM (
      SELECT jsonb_build_object(
               'usage_id', u.id, 'address_id', a.id,
               'address_line', concat_ws(', ', a.street_line1, a.locality, a.admin_area, a.country_code),
               'usage_type', u.usage_type, 'approval_status', u.approval_status,
               'effective_from', u.effective_from, 'effective_to', u.effective_to,
               'source_kind', u.source_kind,
               'co_occupants', (
                  SELECT count(*) FROM public.address_common_matches(a.id, _as_of, 500) m
                   WHERE NOT (m.subject_kind = 'PERSON' AND m.subject_id = _party_id))
             ) AS x
        FROM public.address_usages u
        JOIN public.addresses a ON a.id = u.address_id
       WHERE u.subject_kind = 'PERSON' AND u.subject_id = _party_id
         AND u.approval_status <> 'REJECTED'
         AND u.effective_from <= _as_of
         AND (u.effective_to IS NULL OR u.effective_to >= _as_of)
    ) s;

  RETURN jsonb_build_object('party_id', _party_id, 'as_of', _as_of, 'addresses', _rows);
END $$;

-- ---------- 14. Execute privileges (fail closed for anon) ------------

REVOKE EXECUTE ON FUNCTION public.address_upsert_canonical(text,text,text,text,text,text,text,text,uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.address_usage_propose(uuid,text,uuid,text,date,text,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.address_usage_approve(uuid,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.address_usage_end(uuid,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.address_common_matches(uuid,date,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.address_360_overview(uuid,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.relationship_intelligence_search(text,text[],integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.address_projection_queue() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.address_project_sources() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.person_address_intelligence(uuid,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.address_audit(uuid,text,text,uuid,jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.address_upsert_canonical(text,text,text,text,text,text,text,text,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.address_usage_propose(uuid,text,uuid,text,date,text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.address_usage_approve(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.address_usage_end(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.address_common_matches(uuid,date,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.address_360_overview(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.relationship_intelligence_search(text,text[],integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.address_projection_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.address_project_sources() TO authenticated;
GRANT EXECUTE ON FUNCTION public.person_address_intelligence(uuid,date) TO authenticated;