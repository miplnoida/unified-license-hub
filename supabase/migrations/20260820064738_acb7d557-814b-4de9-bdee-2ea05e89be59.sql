
-- ==========================================================================
-- RDM-ENTITY-001 · PHASE 2A — Party / Organization / regulated entity /
-- multi-licence foundation. Additive + idempotent. No business behaviour
-- change; licensees.id remains the transitional regulated-entity UUID.
-- ==========================================================================

-- 1) STRUCTURAL PARTY MODEL ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_kind text NOT NULL CHECK (party_kind IN ('PERSON','ORGANIZATION')),
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.parties IS
  'Structural platform primitive. party_kind is an engine discriminator (PERSON | ORGANIZATION), never a regulator-configurable business classification.';

CREATE TABLE IF NOT EXISTS public.organizations (
  party_id uuid PRIMARY KEY REFERENCES public.parties(id) ON DELETE RESTRICT,
  legal_name text NOT NULL,
  display_name text,
  legal_name_authority text NOT NULL DEFAULT 'LOCAL_PROVISIONAL'
    CHECK (legal_name_authority IN ('LOCAL_PROVISIONAL','LOCAL_VERIFIED','EXTERNAL_REGISTRY_PROJECTION')),
  legal_name_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.organizations IS
  'Organization subtype of Party. legal_name is the latest LOCAL projection of legal identity; it is not the external registry and no external synchronisation exists yet (Phase 2B).';

CREATE TABLE IF NOT EXISTS public.persons (
  party_id uuid PRIMARY KEY REFERENCES public.parties(id) ON DELETE RESTRICT,
  full_name text NOT NULL,
  given_name text,
  family_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.persons IS
  'Person subtype of Party. Intentionally EMPTY in Phase 2A: canonical consolidation of fp_individuals / profiles is unresolved, so no person identities are fabricated or cloned.';

CREATE OR REPLACE FUNCTION public.party_subtype_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_kind text; v_expected text := CASE TG_TABLE_NAME WHEN 'organizations' THEN 'ORGANIZATION' ELSE 'PERSON' END;
BEGIN
  SELECT party_kind INTO v_kind FROM public.parties WHERE id = NEW.party_id;
  IF v_kind IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Party % is % and cannot be stored as %', NEW.party_id, COALESCE(v_kind,'unknown'), TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_organizations_kind ON public.organizations;
CREATE TRIGGER trg_organizations_kind BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.party_subtype_guard();
DROP TRIGGER IF EXISTS trg_persons_kind ON public.persons;
CREATE TRIGGER trg_persons_kind BEFORE INSERT OR UPDATE ON public.persons
  FOR EACH ROW EXECUTE FUNCTION public.party_subtype_guard();

DROP TRIGGER IF EXISTS trg_parties_touch ON public.parties;
CREATE TRIGGER trg_parties_touch BEFORE UPDATE ON public.parties
  FOR EACH ROW EXECUTE FUNCTION public.rdm_touch_updated_at();
DROP TRIGGER IF EXISTS trg_organizations_touch ON public.organizations;
CREATE TRIGGER trg_organizations_touch BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.rdm_touch_updated_at();
DROP TRIGGER IF EXISTS trg_persons_touch ON public.persons;
CREATE TRIGGER trg_persons_touch BEFORE UPDATE ON public.persons
  FOR EACH ROW EXECUTE FUNCTION public.rdm_touch_updated_at();

-- 2) TRANSITIONAL REGULATED ENTITY -> PARTY BINDING ------------------------
ALTER TABLE public.licensees
  ADD COLUMN IF NOT EXISTS party_id uuid REFERENCES public.organizations(party_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS lifecycle_stage_id uuid REFERENCES public.lifecycle_stages(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS identity_status_id uuid REFERENCES public.entity_identity_statuses(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_licensees_party_id ON public.licensees(party_id) WHERE party_id IS NOT NULL;
COMMENT ON COLUMN public.licensees.id IS
  'Transitional regulated-entity UUID (canonical). 43+ foreign keys depend on it; the physical rename to regulated_entities is NOT part of Phase 2A.';
COMMENT ON COLUMN public.licensees.party_id IS
  'Organization Party binding. The regulated-entity identity remains licensees.id, never party_id.';

CREATE OR REPLACE FUNCTION public.licensee_entity_domain_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_domain text;
BEGIN
  IF NEW.lifecycle_stage_id IS NOT NULL THEN
    SELECT domain INTO v_domain FROM public.lifecycle_stages WHERE id = NEW.lifecycle_stage_id;
    IF v_domain IS DISTINCT FROM 'entity' THEN
      RAISE EXCEPTION 'Entity lifecycle stage must belong to the entity domain (got %)', COALESCE(v_domain,'unknown')
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_licensees_entity_domain ON public.licensees;
CREATE TRIGGER trg_licensees_entity_domain BEFORE INSERT OR UPDATE ON public.licensees
  FOR EACH ROW EXECUTE FUNCTION public.licensee_entity_domain_guard();

-- truthful transitional identity status
INSERT INTO public.entity_identity_statuses (key, label, description, requires_verification, blocks_licensing, sort_order, is_system, is_active)
VALUES ('legacy_known', 'Legacy known',
        'Locally known record migrated from the pre-entity architecture. No external verification provenance is claimed.',
        false, false, 5, true, true)
ON CONFLICT (key) DO NOTHING;

-- 3) MULTI-LICENCE JOIN ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE RESTRICT,
  effective_from timestamptz,
  effective_to timestamptz,
  is_primary boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'MANUAL',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entity_licenses_period_valid CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  CONSTRAINT entity_licenses_unique_period UNIQUE (entity_id, license_id, effective_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_entity_licenses_current_license
  ON public.entity_licenses(license_id) WHERE effective_to IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_entity_licenses_primary
  ON public.entity_licenses(entity_id) WHERE is_primary AND effective_to IS NULL;
CREATE INDEX IF NOT EXISTS ix_entity_licenses_entity ON public.entity_licenses(entity_id);
COMMENT ON COLUMN public.entity_licenses.is_primary IS
  'UI/compatibility preference only. It never defines entity identity: one entity may hold many active or expired licences.';

DROP TRIGGER IF EXISTS trg_entity_licenses_touch ON public.entity_licenses;
CREATE TRIGGER trg_entity_licenses_touch BEFORE UPDATE ON public.entity_licenses
  FOR EACH ROW EXECUTE FUNCTION public.rdm_touch_updated_at();

-- 4) ENTITY IDENTIFIERS ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  identifier_type_id uuid NOT NULL REFERENCES public.entity_identifier_types(id) ON DELETE RESTRICT,
  identifier_value text NOT NULL,
  normalized_value text NOT NULL,
  uniqueness_scope text NOT NULL,
  jurisdiction_id uuid REFERENCES public.countries(id) ON DELETE RESTRICT,
  issuer_key text,
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_status IN ('UNVERIFIED','PROVISIONAL','VERIFIED','DISPUTED')),
  effective_from timestamptz,
  effective_to timestamptz,
  source_type text NOT NULL CHECK (source_type IN ('LEGACY_BACKFILL','MANUAL','APPLICATION','EXTERNAL_REGISTRY')),
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_entity_identifiers_entity ON public.entity_identifiers(entity_id);

-- canonical uniqueness contract, per scope, for currently effective rows
CREATE UNIQUE INDEX IF NOT EXISTS ux_entity_identifiers_global
  ON public.entity_identifiers(identifier_type_id, normalized_value)
  WHERE uniqueness_scope = 'GLOBAL' AND effective_to IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_entity_identifiers_jurisdiction
  ON public.entity_identifiers(identifier_type_id, jurisdiction_id, normalized_value)
  WHERE uniqueness_scope = 'JURISDICTION' AND effective_to IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_entity_identifiers_issuer
  ON public.entity_identifiers(identifier_type_id, issuer_key, normalized_value)
  WHERE uniqueness_scope = 'ISSUER' AND effective_to IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_entity_identifiers_regulator
  ON public.entity_identifiers(identifier_type_id, regulator_id, normalized_value)
  WHERE uniqueness_scope = 'REGULATOR' AND effective_to IS NULL;

CREATE OR REPLACE FUNCTION public.entity_identifier_normalize()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_scope text;
BEGIN
  SELECT uniqueness_scope INTO v_scope FROM public.entity_identifier_types WHERE id = NEW.identifier_type_id;
  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'Unknown identifier type %', NEW.identifier_type_id USING ERRCODE = '23503';
  END IF;
  NEW.uniqueness_scope := v_scope;
  NEW.normalized_value := upper(regexp_replace(COALESCE(NEW.identifier_value,''), '[^A-Za-z0-9]', '', 'g'));
  IF NEW.normalized_value = '' THEN
    RAISE EXCEPTION 'Identifier value must contain alphanumeric characters' USING ERRCODE = '22023';
  END IF;
  IF v_scope = 'JURISDICTION' AND NEW.jurisdiction_id IS NULL THEN
    RAISE EXCEPTION 'Identifier type requires a jurisdiction (uniqueness_scope = JURISDICTION)' USING ERRCODE = '23514';
  END IF;
  IF v_scope = 'ISSUER' AND NULLIF(btrim(COALESCE(NEW.issuer_key,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Identifier type requires an issuer (uniqueness_scope = ISSUER)' USING ERRCODE = '23514';
  END IF;
  IF v_scope = 'REGULATOR' AND NEW.regulator_id IS NULL THEN
    RAISE EXCEPTION 'Identifier type requires a regulator (uniqueness_scope = REGULATOR)' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_entity_identifiers_normalize ON public.entity_identifiers;
CREATE TRIGGER trg_entity_identifiers_normalize BEFORE INSERT OR UPDATE ON public.entity_identifiers
  FOR EACH ROW EXECUTE FUNCTION public.entity_identifier_normalize();
DROP TRIGGER IF EXISTS trg_entity_identifiers_touch ON public.entity_identifiers;
CREATE TRIGGER trg_entity_identifiers_touch BEFORE UPDATE ON public.entity_identifiers
  FOR EACH ROW EXECUTE FUNCTION public.rdm_touch_updated_at();

-- 5) APPLICATION READINESS (nullable, deterministic rows only) -------------
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.licensees(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.applications.entity_id IS
  'Phase 2A readiness column. Backfilled only where the mapping is deterministic (licenses.application_id -> licensees.license_id). Ambiguous historical rows stay NULL by design.';

-- 6) GRANTS + RLS ----------------------------------------------------------
GRANT SELECT ON public.parties TO authenticated;
GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT ON public.persons TO authenticated;
GRANT SELECT ON public.entity_licenses TO authenticated;
GRANT SELECT ON public.entity_identifiers TO authenticated;
GRANT ALL ON public.parties, public.organizations, public.persons,
             public.entity_licenses, public.entity_identifiers TO service_role;

ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_identifiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parties_read ON public.parties;
CREATE POLICY parties_read ON public.parties FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'licensee_management', 'view_all_entities')
  OR EXISTS (SELECT 1 FROM public.licensees e WHERE e.party_id = parties.id
             AND public.can_read_licensee(auth.uid(), e.id))
);

DROP POLICY IF EXISTS organizations_read ON public.organizations;
CREATE POLICY organizations_read ON public.organizations FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'licensee_management', 'view_all_entities')
  OR EXISTS (SELECT 1 FROM public.licensees e WHERE e.party_id = organizations.party_id
             AND public.can_read_licensee(auth.uid(), e.id))
);

DROP POLICY IF EXISTS persons_read ON public.persons;
CREATE POLICY persons_read ON public.persons FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'licensee_management', 'view_all_entities')
);

DROP POLICY IF EXISTS entity_licenses_read ON public.entity_licenses;
CREATE POLICY entity_licenses_read ON public.entity_licenses FOR SELECT TO authenticated
USING (public.can_read_licensee(auth.uid(), entity_id));

DROP POLICY IF EXISTS entity_identifiers_read ON public.entity_identifiers;
CREATE POLICY entity_identifiers_read ON public.entity_identifiers FOR SELECT TO authenticated
USING (public.can_read_licensee(auth.uid(), entity_id));

-- 7) DETERMINISTIC, IDEMPOTENT BACKFILL ------------------------------------
-- 7a) exactly one Organization Party per existing regulated entity.
-- Row-by-row so duplicate legal names never share a party (they are reported
-- as Phase 3 entity-resolution candidates instead of being merged).
DO $$
DECLARE r record; v_party uuid;
BEGIN
  FOR r IN SELECT id, name FROM public.licensees WHERE party_id IS NULL ORDER BY id LOOP
    INSERT INTO public.parties (party_kind, display_name)
    VALUES ('ORGANIZATION', r.name) RETURNING id INTO v_party;
    INSERT INTO public.organizations (party_id, legal_name, display_name, legal_name_authority)
    VALUES (v_party, r.name, r.name, 'LOCAL_PROVISIONAL');
    UPDATE public.licensees SET party_id = v_party WHERE id = r.id;
  END LOOP;
END $$;

-- 7b) lifecycle stage — only deterministic derivations
UPDATE public.licensees e
SET lifecycle_stage_id = (SELECT id FROM public.lifecycle_stages WHERE key = 'authorised' AND domain = 'entity')
WHERE e.lifecycle_stage_id IS NULL AND e.status = 'active'
  AND EXISTS (SELECT 1 FROM public.licenses l WHERE l.id = e.license_id AND l.status = 'active');

UPDATE public.licensees e
SET lifecycle_stage_id = (SELECT id FROM public.lifecycle_stages WHERE key = 'former_licensee' AND domain = 'entity')
WHERE e.lifecycle_stage_id IS NULL AND e.status = 'revoked'
  AND EXISTS (SELECT 1 FROM public.licenses l WHERE l.id = e.license_id AND l.status = 'revoked');

-- 7c) identity status — truthful transitional value
UPDATE public.licensees
SET identity_status_id = (SELECT id FROM public.entity_identity_statuses WHERE key = 'legacy_known')
WHERE identity_status_id IS NULL;

-- 7d) legacy licensees.license_id -> entity_licenses
INSERT INTO public.entity_licenses (entity_id, license_id, effective_from, is_primary, source)
SELECT e.id, l.id, COALESCE(l.valid_from, l.issued_at, l.created_at), true, 'LEGACY_LICENSE_ID'
FROM public.licensees e
JOIN public.licenses l ON l.id = e.license_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.entity_licenses el WHERE el.entity_id = e.id AND el.license_id = l.id
);

-- 7e) licence numbers as regulator-scoped identifiers (deterministic only)
INSERT INTO public.entity_identifiers
  (entity_id, identifier_type_id, identifier_value, normalized_value, uniqueness_scope,
   regulator_id, is_primary, verification_status, effective_from, source_type, source_reference)
SELECT el.entity_id,
       t.id,
       l.license_number,
       '', 'REGULATOR',
       l.regulator_id,
       el.is_primary,
       'VERIFIED',
       COALESCE(l.issued_at, l.created_at),
       'LEGACY_BACKFILL',
       'licenses.license_number:' || l.id::text
FROM public.entity_licenses el
JOIN public.licenses l ON l.id = el.license_id
CROSS JOIN (SELECT id FROM public.entity_identifier_types WHERE key = 'license_number') t
WHERE l.license_number IS NOT NULL
  AND l.regulator_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.entity_identifiers ei
    WHERE ei.entity_id = el.entity_id AND ei.identifier_type_id = t.id
      AND ei.source_reference = 'licenses.license_number:' || l.id::text
  );

-- 7f) applications -> entity, deterministic path only
UPDATE public.applications a
SET entity_id = e.id
FROM public.licenses l
JOIN public.licensees e ON e.license_id = l.id
WHERE l.application_id = a.id AND a.entity_id IS NULL;
