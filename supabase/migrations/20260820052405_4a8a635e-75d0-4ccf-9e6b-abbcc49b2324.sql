
-- ============================================================
-- RDM-ENTITY-001 PHASE 1: metadata & configuration foundation
-- Additive only. No existing table is altered or renamed.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rdm_can_read()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.sec_has_permission(auth.uid(), 'settings', 'view')
$$;

CREATE OR REPLACE FUNCTION public.rdm_can_write()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.sec_has_permission(auth.uid(), 'settings', 'edit')
$$;

CREATE OR REPLACE FUNCTION public.rdm_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.rdm_audit_metadata_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id text;
BEGIN
  v_id := COALESCE((to_jsonb(COALESCE(NEW, OLD)) ->> 'id'), '');
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (
    auth.uid(),
    lower(TG_OP) || '_regulatory_metadata',
    TG_TABLE_NAME,
    v_id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    jsonb_build_object('program', 'RDM-ENTITY-001', 'phase', 1)
  );
  RETURN COALESCE(NEW, OLD);
END $$;

-- ---------- tables ----------

CREATE TABLE public.classification_schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  applies_to text NOT NULL DEFAULT 'entity',
  is_hierarchical boolean NOT NULL DEFAULT false,
  allow_multiple boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.classification_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.classification_schemes(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.classification_values(id) ON DELETE CASCADE,
  key text NOT NULL,
  code text,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  effective_from date,
  effective_to date,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scheme_id, key)
);

CREATE TABLE public.lifecycle_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  domain text NOT NULL DEFAULT 'entity',
  is_terminal boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.entity_identity_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  requires_verification boolean NOT NULL DEFAULT false,
  blocks_licensing boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.relationship_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'group',
  is_ownership boolean NOT NULL DEFAULT false,
  is_group boolean NOT NULL DEFAULT false,
  inverse_key text,
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.role_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'governance',
  is_governance boolean NOT NULL DEFAULT true,
  requires_fit_and_proper boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.form_purposes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  domain text,
  legacy_form_type text,
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.form_trigger_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.data_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  default_authority text NOT NULL DEFAULT 'SUPTECH',
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT data_domains_authority_chk CHECK (default_authority IN ('SUPTECH','EXTERNAL_REGISTRY','DEPLOYMENT_CONFIGURED'))
);

CREATE TABLE public.entity_identifier_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  issuer text,
  is_unique_global boolean NOT NULL DEFAULT false,
  validation_regex text,
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.entity_resolution_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  registry_authority_mode text NOT NULL DEFAULT 'LOCAL_AUTHORITATIVE',
  on_exact_match text NOT NULL DEFAULT 'REUSE_LOCAL_ENTITY',
  on_possible_match text NOT NULL DEFAULT 'CREATE_RESOLUTION_CASE',
  on_no_match text NOT NULL DEFAULT 'CREATE_LOCAL_ENTITY',
  allow_provisional_entity boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_mode_chk CHECK (registry_authority_mode IN ('LOCAL_AUTHORITATIVE','EXTERNAL_AUTHORITATIVE','HYBRID_AUTHORITY')),
  CONSTRAINT erp_no_match_chk CHECK (on_no_match IN ('CREATE_LOCAL_ENTITY','CREATE_VIA_EXTERNAL_API','BLOCK','ALLOW_PROVISIONAL','MANUAL_REVIEW')),
  CONSTRAINT erp_possible_chk CHECK (on_possible_match IN ('CREATE_RESOLUTION_CASE','BLOCK','MANUAL_REVIEW'))
);

CREATE TABLE public.entity_registry_failure_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  on_provider_unavailable text NOT NULL DEFAULT 'ALLOW_LAST_VERIFIED',
  allow_last_verified_projection boolean NOT NULL DEFAULT true,
  max_staleness_hours integer NOT NULL DEFAULT 720,
  is_default boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erfp_action_chk CHECK (on_provider_unavailable IN ('ALLOW_LAST_VERIFIED','BLOCK','ALLOW_PROVISIONAL','MANUAL_REVIEW'))
);

-- ---------- grants, RLS, triggers ----------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'classification_schemes','classification_values','lifecycle_stages','entity_identity_statuses',
    'relationship_types','role_types','form_purposes','form_trigger_types','data_domains',
    'entity_identifier_types','entity_resolution_policies','entity_registry_failure_policies'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.rdm_can_read())', t||'_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.rdm_can_write()) WITH CHECK (public.rdm_can_write())', t||'_write', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.rdm_touch_updated_at()', t||'_touch', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.rdm_audit_metadata_change()', t||'_audit', t);
  END LOOP;
END $$;

-- ---------- seeds ----------

INSERT INTO public.classification_schemes (key,label,description,applies_to,is_hierarchical,allow_multiple,sort_order,is_system) VALUES
 ('entity_sector','Sector','Top-level regulated sector taxonomy (mirrors existing sectors master data).','entity',true,false,10,true),
 ('entity_type','Entity Type','Legal/organisational form of the entity.','entity',false,false,20,true),
 ('regulated_activity','Regulated Activity','Activities an entity is authorised to conduct.','license',false,true,30,true),
 ('systemic_importance','Systemic Importance','Supervisory significance classification.','entity',false,false,40,true),
 ('jurisdiction','Jurisdiction','Jurisdiction of incorporation or operation.','entity',false,true,50,true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.classification_values (scheme_id,key,label,sort_order,is_system)
SELECT s.id, v.key, v.label, v.ord, true
FROM public.classification_schemes s
JOIN (VALUES
 ('entity_type','company_limited_by_shares','Company Limited by Shares',10),
 ('entity_type','cooperative_society','Co-operative Society',20),
 ('entity_type','partnership','Partnership',30),
 ('entity_type','branch_of_foreign_entity','Branch of Foreign Entity',40),
 ('entity_type','statutory_body','Statutory Body',50),
 ('systemic_importance','domestic_systemically_important','Domestic Systemically Important',10),
 ('systemic_importance','significant','Significant',20),
 ('systemic_importance','standard','Standard',30)
) AS v(scheme,key,label,ord) ON v.scheme = s.key
ON CONFLICT (scheme_id,key) DO NOTHING;

INSERT INTO public.lifecycle_stages (key,label,description,domain,is_terminal,sort_order,is_system) VALUES
 ('prospect','Prospect','Known organisation with no regulatory case yet.','entity',false,10,true),
 ('applicant','Applicant','Entity with an in-flight licence application and no licence.','entity',false,20,true),
 ('authorised','Authorised','Entity holding one or more active licences.','entity',false,30,true),
 ('restricted','Restricted','Authorised but subject to restrictions or conditions.','entity',false,40,true),
 ('suspended','Suspended','Authorisation temporarily suspended.','entity',false,50,true),
 ('withdrawn','Withdrawn','Application withdrawn or refused; no authorisation.','entity',true,60,true),
 ('closed','Closed','Entity exited the regulatory perimeter.','entity',true,70,true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.entity_identity_statuses (key,label,description,requires_verification,blocks_licensing,sort_order,is_system) VALUES
 ('unverified','Unverified','Identity asserted by the applicant only.',true,false,10,true),
 ('pending_verification','Pending Verification','Verification in progress.',true,false,20,true),
 ('verified','Verified','Identity verified against an authoritative source.',false,false,30,true),
 ('provisional','Provisional','Temporarily accepted identity pending registry confirmation.',true,false,40,true),
 ('disputed','Disputed','Conflicting identity evidence; licensing actions blocked.',true,true,50,true),
 ('merged','Merged','Superseded by a surviving entity record.',false,true,60,true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.relationship_types (key,label,category,is_ownership,is_group,inverse_key,sort_order,is_system) VALUES
 ('parent_of','Parent Of','group',false,true,'subsidiary_of',10,true),
 ('subsidiary_of','Subsidiary Of','group',false,true,'parent_of',20,true),
 ('shareholder_of','Shareholder Of','ownership',true,false,'shares_held_by',30,true),
 ('shares_held_by','Shares Held By','ownership',true,false,'shareholder_of',40,true),
 ('controller_of','Controller Of','control',true,false,NULL,50,true),
 ('ultimate_beneficial_owner_of','Ultimate Beneficial Owner Of','control',true,false,NULL,60,true),
 ('affiliate_of','Affiliate Of','group',false,true,'affiliate_of',70,true),
 ('branch_of','Branch Of','structure',false,true,NULL,80,true),
 ('service_provider_to','Service Provider To','commercial',false,false,NULL,90,true),
 ('external_auditor_of','External Auditor Of','commercial',false,false,NULL,100,true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_types (key,label,category,is_governance,requires_fit_and_proper,sort_order,is_system) VALUES
 ('director','Director','board',true,true,10,true),
 ('independent_director','Independent Director','board',true,true,20,true),
 ('chairperson','Chairperson','board',true,true,30,true),
 ('chief_executive_officer','Chief Executive Officer','executive',true,true,40,true),
 ('chief_financial_officer','Chief Financial Officer','executive',true,true,50,true),
 ('chief_risk_officer','Chief Risk Officer','key_function',true,true,60,true),
 ('compliance_officer','Compliance Officer','key_function',true,true,70,true),
 ('money_laundering_reporting_officer','Money Laundering Reporting Officer','key_function',true,true,80,true),
 ('internal_auditor','Internal Auditor','key_function',true,true,90,true),
 ('company_secretary','Company Secretary','governance',true,false,100,true),
 ('authorised_contact','Authorised Contact','administrative',false,false,110,true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.form_purposes (key,label,description,domain,legacy_form_type,sort_order,is_system) VALUES
 ('entity_registration','Entity Registration','Initial onboarding of an organisation and its primary contact.','registration','registration',10,true),
 ('license_application','Licence Application','Initial authorisation application.','licensing','pre_license',20,true),
 ('post_license_request','Post-Licence Request','Change, notification or variation after authorisation.','licensing','post_license',30,true),
 ('periodic_return','Periodic Return','Period-based regulatory reporting.','returns','returns',40,true),
 ('fit_and_proper','Fit & Proper','Assessment of individuals holding regulated roles.','fit_and_proper','fit_and_proper',50,true),
 ('internal_assessment','Internal Assessment','Regulator-completed assessment instrument.','supervision','internal',60,true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.form_trigger_types (key,label,description,sort_order,is_system) VALUES
 ('applicant_initiated','Applicant Initiated','Submitted by the entity on demand.',10,true),
 ('periodic_schedule','Periodic Schedule','Driven by a reporting calendar.',20,true),
 ('event_driven','Event Driven','Triggered by a regulatory event or notification obligation.',30,true),
 ('regulator_requested','Regulator Requested','Requested ad hoc by the regulator.',40,true),
 ('supervisory_process','Supervisory Process','Completed inside a supervisory process.',50,true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.data_domains (key,label,description,default_authority,sort_order,is_system) VALUES
 ('entity_identity','Entity Identity','Legal name, registration number, incorporation details.','EXTERNAL_REGISTRY',10,true),
 ('entity_regulatory_status','Entity Regulatory Status','Lifecycle stage, licences, conditions.','SUPTECH',20,true),
 ('ownership','Ownership & Control','Shareholding, controllers, beneficial ownership.','DEPLOYMENT_CONFIGURED',30,true),
 ('governance','Governance','Board, executives and key function holders.','DEPLOYMENT_CONFIGURED',40,true),
 ('prudential','Prudential','Capital, liquidity, risk metrics.','SUPTECH',50,true),
 ('conduct','Market Conduct','Complaints, conduct risk and outcomes.','SUPTECH',60,true),
 ('aml_cft','AML / CFT','Financial crime supervision data.','SUPTECH',70,true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.entity_identifier_types (key,label,issuer,is_unique_global,sort_order,is_system) VALUES
 ('company_registration_number','Company Registration Number','Corporate Registry',true,10,true),
 ('taxpayer_registration_number','Taxpayer Registration Number','Tax Authority',true,20,true),
 ('legal_entity_identifier','Legal Entity Identifier (LEI)','GLEIF',true,30,true),
 ('regulatory_entity_number','Regulatory Entity Number','Unified License Hub',true,40,true),
 ('license_number','Licence Number','Unified License Hub',false,50,true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.entity_resolution_policies (key,label,description,registry_authority_mode,on_exact_match,on_possible_match,on_no_match,allow_provisional_entity,is_default,is_system) VALUES
 ('local_authoritative_default','Local Authoritative (default)','The platform owns legal identity; no external registry configured.','LOCAL_AUTHORITATIVE','REUSE_LOCAL_ENTITY','CREATE_RESOLUTION_CASE','CREATE_LOCAL_ENTITY',false,true,true),
 ('external_authoritative_strict','External Authoritative (strict)','External registry owns legal identity; unmatched organisations are blocked.','EXTERNAL_AUTHORITATIVE','REUSE_LOCAL_ENTITY','CREATE_RESOLUTION_CASE','BLOCK',false,false,true),
 ('hybrid_provisional','Hybrid with Provisional Entities','External registry preferred; provisional local entity allowed pending confirmation.','HYBRID_AUTHORITY','REUSE_LOCAL_ENTITY','CREATE_RESOLUTION_CASE','ALLOW_PROVISIONAL',true,false,true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.entity_registry_failure_policies (key,label,description,on_provider_unavailable,allow_last_verified_projection,max_staleness_hours,is_default,is_system) VALUES
 ('graceful_last_verified','Graceful — use last verified','Continue with the last verified identity projection and warn the user.','ALLOW_LAST_VERIFIED',true,720,true,true),
 ('block_identity_actions','Block identity actions','Block irreversible identity and licensing actions while the provider is down.','BLOCK',false,0,false,true),
 ('manual_review','Route to manual review','Create a manual review task when the provider is unavailable.','MANUAL_REVIEW',true,168,false,true)
ON CONFLICT (key) DO NOTHING;

-- ---------- PHASE 0: read-only integrity diagnostics ----------

CREATE OR REPLACE FUNCTION public.rdm_integrity_report()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.rdm_can_read() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'generated_at', now(),
    'entities_total', (SELECT count(*) FROM public.licensees),
    'licenses_total', (SELECT count(*) FROM public.licenses),
    'entities_without_license', (SELECT count(*) FROM public.licensees WHERE license_id IS NULL),
    'licenses_without_entity', (SELECT count(*) FROM public.licenses l WHERE NOT EXISTS (SELECT 1 FROM public.licensees e WHERE e.license_id = l.id)),
    'entities_sharing_license_id', (SELECT count(*) FROM (SELECT license_id FROM public.licensees WHERE license_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x),
    'entities_multi_license_capable', false,
    'duplicate_entity_names', (SELECT count(*) FROM (SELECT lower(trim(name)) FROM public.licensees GROUP BY 1 HAVING count(*) > 1) y),
    'applications_total', (SELECT count(*) FROM public.applications),
    'applications_without_pinned_form_version', (SELECT count(*) FROM public.applications WHERE form_version_id IS NULL),
    'applications_without_resolvable_entity', (SELECT count(*) FROM public.applications a WHERE NOT EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = a.applicant_id AND p.licensee_id IS NOT NULL)),
    'registrations_total', (SELECT count(*) FROM public.registrations),
    'registrations_without_user', (SELECT count(*) FROM public.registrations WHERE user_id IS NULL),
    'duplicate_registration_numbers', (SELECT count(*) FROM (SELECT registration_number FROM public.registrations WHERE registration_number IS NOT NULL GROUP BY 1 HAVING count(*) > 1) z),
    'relationship_rows', (SELECT count(*) FROM public.entity_relationships),
    'distinct_relationship_type_values', (SELECT count(DISTINCT relationship_type) FROM public.entity_relationships),
    'form_templates_total', (SELECT count(*) FROM public.form_templates),
    'distinct_form_type_values', (SELECT count(DISTINCT form_type) FROM public.form_templates),
    'form_templates_without_published_version', (SELECT count(*) FROM public.form_templates t WHERE NOT EXISTS (
        SELECT 1 FROM public.form_versions v WHERE v.template_id = t.id)),
    'foreign_keys_referencing_licensees', (SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.licensees'::regclass),
    'configured_metadata', jsonb_build_object(
      'classification_schemes', (SELECT count(*) FROM public.classification_schemes),
      'classification_values', (SELECT count(*) FROM public.classification_values),
      'lifecycle_stages', (SELECT count(*) FROM public.lifecycle_stages),
      'entity_identity_statuses', (SELECT count(*) FROM public.entity_identity_statuses),
      'relationship_types', (SELECT count(*) FROM public.relationship_types),
      'role_types', (SELECT count(*) FROM public.role_types),
      'form_purposes', (SELECT count(*) FROM public.form_purposes),
      'form_trigger_types', (SELECT count(*) FROM public.form_trigger_types),
      'data_domains', (SELECT count(*) FROM public.data_domains),
      'entity_identifier_types', (SELECT count(*) FROM public.entity_identifier_types),
      'entity_resolution_policies', (SELECT count(*) FROM public.entity_resolution_policies),
      'entity_registry_failure_policies', (SELECT count(*) FROM public.entity_registry_failure_policies)
    )
  ) INTO r;
  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.rdm_integrity_report() FROM public;
GRANT EXECUTE ON FUNCTION public.rdm_integrity_report() TO authenticated;

CREATE OR REPLACE FUNCTION public.rdm_diag_duplicate_entities()
RETURNS TABLE (normalised_name text, entity_count bigint, entity_ids uuid[], entity_names text[], statuses text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.rdm_can_read() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT lower(trim(l.name)),
         count(*),
         array_agg(l.id ORDER BY l.created_at),
         array_agg(l.name ORDER BY l.created_at),
         array_agg(l.status ORDER BY l.created_at)
  FROM public.licensees l
  GROUP BY 1
  HAVING count(*) > 1
  ORDER BY 2 DESC, 1;
END $$;

REVOKE ALL ON FUNCTION public.rdm_diag_duplicate_entities() FROM public;
GRANT EXECUTE ON FUNCTION public.rdm_diag_duplicate_entities() TO authenticated;

-- ---------- navigation + route ----------

INSERT INTO public.sec_routes (key, path_pattern, match_type, required_permission_id, audience, is_protected, is_system, is_active, priority)
SELECT 'route_admin_regulatory_data_model', '/admin/regulatory-data-model', 'prefix',
       (SELECT p.id FROM public.sec_permissions p JOIN public.sec_modules m ON m.id = p.module_id WHERE m.key = 'settings' AND p.key = 'view'),
       'internal', true, true, true, 100
WHERE NOT EXISTS (SELECT 1 FROM public.sec_routes WHERE key = 'route_admin_regulatory_data_model');

INSERT INTO public.sec_navigation_items (key, parent_id, label, description, item_type, href_override, icon_key, sort_order, audience, is_active, show_in_sidebar, show_in_search, keywords, is_system, admin_only, required_permission_id)
SELECT 'admin_config_regulatory_data_model',
       (SELECT parent_id FROM public.sec_navigation_items WHERE key = 'nav_adm_cfg_forms_data'),
       'Regulatory Data Model',
       'Configurable classifications, identity policy, relationship and role types, form semantics and data-integrity diagnostics.',
       'link', '/admin/regulatory-data-model', 'Database', 45, 'internal', true, true, true,
       ARRAY['regulatory data model','classifications','entity identity','relationship types','role types','metrics','data integrity'],
       true, false,
       (SELECT p.id FROM public.sec_permissions p JOIN public.sec_modules m ON m.id = p.module_id WHERE m.key = 'settings' AND p.key = 'view')
WHERE NOT EXISTS (SELECT 1 FROM public.sec_navigation_items WHERE key = 'admin_config_regulatory_data_model');
