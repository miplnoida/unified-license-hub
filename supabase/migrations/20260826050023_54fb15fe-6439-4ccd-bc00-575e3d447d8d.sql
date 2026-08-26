-- ============================================================
-- MC-01: canonical complaint intake data model
-- ============================================================

-- ---------- 1. public intake configuration ----------
CREATE TABLE public.complaint_public_intake_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE,
  allow_anonymous boolean NOT NULL DEFAULT false,
  allow_confidential boolean NOT NULL DEFAULT true,
  support_categories jsonb NOT NULL DEFAULT '[
    {"code":"accessibility","label":"Disability or accessibility support"},
    {"code":"language","label":"Language assistance"},
    {"code":"illness","label":"Serious illness"},
    {"code":"bereavement","label":"Bereavement"},
    {"code":"financial_hardship","label":"Financial hardship"},
    {"code":"elderly","label":"Older consumer"},
    {"code":"understanding","label":"Difficulty understanding financial information"},
    {"code":"urgent_funds","label":"Urgent need to access funds"},
    {"code":"carer_contact","label":"Please contact my representative or carer"},
    {"code":"other","label":"Something else"}
  ]'::jsonb,
  desired_outcome_options jsonb NOT NULL DEFAULT '[
    {"code":"explanation","label":"An explanation of what happened"},
    {"code":"correction","label":"Correction of an error"},
    {"code":"refund","label":"A refund"},
    {"code":"compensation","label":"Compensation"},
    {"code":"interest","label":"Interest"},
    {"code":"fee_reversal","label":"Reversal of fees or charges"},
    {"code":"transaction_correction","label":"Correction of a transaction"},
    {"code":"account_restoration","label":"Restoration of my account"},
    {"code":"credit_record","label":"Correction of my credit record"},
    {"code":"policy_reinstatement","label":"Reinstatement of my policy"},
    {"code":"service_restoration","label":"Restoration of a service"},
    {"code":"apology","label":"An apology"},
    {"code":"other","label":"Something else"}
  ]'::jsonb,
  channel_options jsonb NOT NULL DEFAULT '[
    {"code":"branch","label":"Branch or office"},
    {"code":"website","label":"Website"},
    {"code":"mobile_app","label":"Mobile app"},
    {"code":"telephone","label":"Telephone"},
    {"code":"email","label":"Email"},
    {"code":"atm","label":"ATM"},
    {"code":"broker","label":"Broker"},
    {"code":"agent","label":"Agent or representative"},
    {"code":"social_media","label":"Social media"},
    {"code":"post","label":"Post"},
    {"code":"other","label":"Other"}
  ]'::jsonb,
  privacy_notice_version text NOT NULL DEFAULT 'v1.0',
  privacy_notice_text text,
  declaration_text text,
  require_respondent_contact_permission boolean NOT NULL DEFAULT true,
  default_intake_regulator_id uuid REFERENCES public.regulators(id) ON DELETE SET NULL,
  max_attachments integer NOT NULL DEFAULT 5,
  max_attachment_bytes bigint NOT NULL DEFAULT 5242880,
  tracking_code_ttl_days integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX complaint_public_intake_config_global_uq
  ON public.complaint_public_intake_config ((regulator_id IS NULL)) WHERE regulator_id IS NULL;
CREATE UNIQUE INDEX complaint_public_intake_config_reg_uq
  ON public.complaint_public_intake_config (regulator_id) WHERE regulator_id IS NOT NULL;

GRANT SELECT ON public.complaint_public_intake_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_public_intake_config TO authenticated;
GRANT ALL ON public.complaint_public_intake_config TO service_role;
ALTER TABLE public.complaint_public_intake_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY cpic_public_read ON public.complaint_public_intake_config
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY cpic_admin_write ON public.complaint_public_intake_config
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'complaint_management','edit'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'complaint_management','edit'));

-- ---------- 2. complaint parties ----------
CREATE TABLE public.complaint_parties (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  party_role text NOT NULL CHECK (party_role IN (
    'affected_consumer','complainant','representative','business_representative',
    'guardian_or_carer','attorney_or_authorised_agent','other_authorised_representative')),
  party_type text NOT NULL DEFAULT 'individual' CHECK (party_type IN ('individual','business')),
  is_primary_contact boolean NOT NULL DEFAULT false,
  full_name text,
  business_name text,
  position_or_title text,
  relationship_to_consumer text,
  authority_basis text,
  authority_confirmed boolean NOT NULL DEFAULT false,
  authority_evidence_file_id uuid,
  email text,
  phone text,
  confidentiality text NOT NULL DEFAULT 'standard'
    CHECK (confidentiality IN ('standard','confidential','anonymous')),
  information_source text NOT NULL DEFAULT 'consumer_declared'
    CHECK (information_source IN ('consumer_declared','staff_entered','legacy_migration')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX complaint_parties_complaint_idx ON public.complaint_parties (complaint_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_parties TO authenticated;
GRANT ALL ON public.complaint_parties TO service_role;
ALTER TABLE public.complaint_parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY cparties_staff_all ON public.complaint_parties
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'view'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'edit'));
CREATE POLICY cparties_own_read ON public.complaint_parties
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.complaints c
                  WHERE c.id = complaint_parties.complaint_id AND c.complainant_id = auth.uid()));

-- ---------- 3. complaint respondents ----------
CREATE TABLE public.complaint_respondents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  match_state text NOT NULL CHECK (match_state IN (
    'MATCHED_REGULATED','MATCHED_PREVIOUSLY_REGULATED','UNMATCHED',
    'SUSPECTED_UNAUTHORISED','INTERMEDIARY','PENDING_MATCH')),
  respondent_role text NOT NULL DEFAULT 'provider'
    CHECK (respondent_role IN ('provider','intermediary','agent','broker','other')),
  licensee_id uuid REFERENCES public.licensees(id) ON DELETE SET NULL,
  license_id uuid REFERENCES public.licenses(id) ON DELETE SET NULL,
  legal_name text,
  trading_name text,
  website text,
  email text,
  phone text,
  address text,
  country text,
  online_reference text,
  service_offered text,
  agent_name text,
  related_principal_licensee_id uuid REFERENCES public.licensees(id) ON DELETE SET NULL,
  related_principal_name text,
  consumer_notes text,
  information_source text NOT NULL DEFAULT 'consumer_declared'
    CHECK (information_source IN ('consumer_declared','staff_entered','legacy_migration')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT complaint_respondents_identity_chk CHECK (
    licensee_id IS NOT NULL
    OR COALESCE(NULLIF(btrim(legal_name),''), NULLIF(btrim(trading_name),''), NULLIF(btrim(agent_name),'')) IS NOT NULL
  ),
  CONSTRAINT complaint_respondents_matched_chk CHECK (
    match_state NOT IN ('MATCHED_REGULATED','MATCHED_PREVIOUSLY_REGULATED') OR licensee_id IS NOT NULL
  )
);
CREATE INDEX complaint_respondents_complaint_idx ON public.complaint_respondents (complaint_id);
CREATE INDEX complaint_respondents_licensee_idx ON public.complaint_respondents (licensee_id);
CREATE INDEX complaint_respondents_match_idx ON public.complaint_respondents (match_state);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_respondents TO authenticated;
GRANT ALL ON public.complaint_respondents TO service_role;
ALTER TABLE public.complaint_respondents ENABLE ROW LEVEL SECURITY;

CREATE POLICY cresp_staff_all ON public.complaint_respondents
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'view'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'edit'));
CREATE POLICY cresp_own_read ON public.complaint_respondents
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.complaints c
                  WHERE c.id = complaint_respondents.complaint_id AND c.complainant_id = auth.uid()));

-- ---------- 4. contact preferences ----------
CREATE TABLE public.complaint_contact_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  complaint_id uuid NOT NULL UNIQUE REFERENCES public.complaints(id) ON DELETE CASCADE,
  preferred_method text NOT NULL CHECK (preferred_method IN ('email','phone','post')),
  alternative_method text CHECK (alternative_method IN ('email','phone','post')),
  email text,
  phone text,
  postal_address_line1 text,
  postal_address_line2 text,
  city text,
  region text,
  postal_code text,
  country text,
  preferred_language text NOT NULL DEFAULT 'English',
  accessibility_needs text,
  safe_contact_instructions text,
  information_source text NOT NULL DEFAULT 'consumer_declared'
    CHECK (information_source IN ('consumer_declared','staff_entered','legacy_migration')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_contact_preferences TO authenticated;
GRANT ALL ON public.complaint_contact_preferences TO service_role;
ALTER TABLE public.complaint_contact_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY ccp_staff_all ON public.complaint_contact_preferences
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'view'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'edit'));
CREATE POLICY ccp_own_read ON public.complaint_contact_preferences
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.complaints c
                  WHERE c.id = complaint_contact_preferences.complaint_id AND c.complainant_id = auth.uid()));

-- conditional validation (trigger, not CHECK, so rules can evolve with config)
CREATE OR REPLACE FUNCTION public.complaint_contact_pref_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_method text := lower(coalesce(NEW.preferred_method,''));
BEGIN
  IF v_method = 'email' AND NULLIF(btrim(coalesce(NEW.email,'')),'') IS NULL THEN
    RAISE EXCEPTION 'CONTACT_EMAIL_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF v_method = 'phone' AND NULLIF(btrim(coalesce(NEW.phone,'')),'') IS NULL THEN
    RAISE EXCEPTION 'CONTACT_PHONE_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF v_method = 'post' AND (
      NULLIF(btrim(coalesce(NEW.postal_address_line1,'')),'') IS NULL
      OR NULLIF(btrim(coalesce(NEW.city,'')),'') IS NULL) THEN
    RAISE EXCEPTION 'CONTACT_POSTAL_ADDRESS_REQUIRED' USING ERRCODE='22023';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER complaint_contact_pref_validate_trg
  BEFORE INSERT OR UPDATE ON public.complaint_contact_preferences
  FOR EACH ROW EXECUTE FUNCTION public.complaint_contact_pref_validate();

-- ---------- 5. support / vulnerability assessments ----------
CREATE TABLE public.complaint_vulnerability_assessments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'self_declared'
    CHECK (source IN ('self_declared','staff_assessed','legacy_migration')),
  support_required boolean NOT NULL DEFAULT false,
  categories text[] NOT NULL DEFAULT '{}',
  consumer_notes text,
  staff_review_state text NOT NULL DEFAULT 'pending'
    CHECK (staff_review_state IN ('pending','reviewed','not_required')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  staff_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cva_complaint_idx ON public.complaint_vulnerability_assessments (complaint_id);
CREATE INDEX cva_review_idx ON public.complaint_vulnerability_assessments (staff_review_state);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_vulnerability_assessments TO authenticated;
GRANT ALL ON public.complaint_vulnerability_assessments TO service_role;
ALTER TABLE public.complaint_vulnerability_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY cva_staff_all ON public.complaint_vulnerability_assessments
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'view'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'edit'));

-- ---------- 6. jurisdiction assessments (scaffold only) ----------
CREATE TABLE public.complaint_jurisdiction_assessments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  complaint_id uuid NOT NULL UNIQUE REFERENCES public.complaints(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING_ASSESSMENT'
    CHECK (status IN ('PENDING_ASSESSMENT','ACCEPTED','OUT_OF_JURISDICTION','REFERRED','PARTIAL')),
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE SET NULL,
  routing_basis text,
  assessed_by uuid,
  assessed_at timestamptz,
  rationale text,
  referred_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cja_status_idx ON public.complaint_jurisdiction_assessments (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_jurisdiction_assessments TO authenticated;
GRANT ALL ON public.complaint_jurisdiction_assessments TO service_role;
ALTER TABLE public.complaint_jurisdiction_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY cja_staff_all ON public.complaint_jurisdiction_assessments
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'view'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'edit'));

-- ---------- 7. structured intake details ----------
CREATE TABLE public.complaint_intake_details (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  complaint_id uuid NOT NULL UNIQUE REFERENCES public.complaints(id) ON DELETE CASCADE,
  -- product / service / channel
  sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.conduct_products(id) ON DELETE SET NULL,
  product_family text,
  product_other text,
  service_description text,
  channel_id uuid REFERENCES public.conduct_channels(id) ON DELETE SET NULL,
  channel_code text,
  channel_other text,
  customer_segment text,
  -- incident
  incident_date date,
  incident_date_to date,
  is_ongoing boolean NOT NULL DEFAULT false,
  location text,
  transaction_reference text,
  amount_involved numeric(18,2),
  currency text DEFAULT 'XCD',
  amount_disputed numeric(18,2),
  claimed_loss numeric(18,2),
  continuing_loss boolean NOT NULL DEFAULT false,
  urgent_funds_access boolean NOT NULL DEFAULT false,
  suspected_fraud boolean NOT NULL DEFAULT false,
  -- prior complaint to the entity
  raised_with_entity boolean NOT NULL DEFAULT false,
  entity_complaint_reference text,
  raised_with_entity_date date,
  raised_with_entity_channel text,
  acknowledgement_received boolean,
  final_response_received boolean,
  final_response_date date,
  outcome_offered text,
  redress_offered text,
  redress_offered_amount numeric(18,2),
  redress_accepted boolean,
  still_dissatisfied_reason text,
  -- desired outcome
  desired_outcomes text[] NOT NULL DEFAULT '{}',
  desired_outcome_other text,
  desired_amount numeric(18,2),
  -- declaration
  declaration_accepted boolean NOT NULL DEFAULT false,
  privacy_notice_version text,
  privacy_notice_acknowledged boolean NOT NULL DEFAULT false,
  respondent_contact_permitted boolean,
  information_sharing_acknowledged boolean NOT NULL DEFAULT false,
  declared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_intake_details TO authenticated;
GRANT ALL ON public.complaint_intake_details TO service_role;
ALTER TABLE public.complaint_intake_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY cid_staff_all ON public.complaint_intake_details
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'view'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'edit'));
CREATE POLICY cid_own_read ON public.complaint_intake_details
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.complaints c
                  WHERE c.id = complaint_intake_details.complaint_id AND c.complainant_id = auth.uid()));

-- ---------- 8. tracking credentials (hash only) ----------
CREATE TABLE public.complaint_tracking_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  complaint_id uuid NOT NULL UNIQUE REFERENCES public.complaints(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  code_hint text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ctc_hash_idx ON public.complaint_tracking_credentials (code_hash);

-- deliberately no anon/authenticated grants: reachable only via governed
-- SECURITY DEFINER functions.
GRANT ALL ON public.complaint_tracking_credentials TO service_role;
ALTER TABLE public.complaint_tracking_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY ctc_service_only ON public.complaint_tracking_credentials
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- 9. rate-limit identity beyond email ----------
ALTER TABLE public.public_intake_events
  ADD COLUMN IF NOT EXISTS phone_hash text,
  ADD COLUMN IF NOT EXISTS email_hash text,
  ADD COLUMN IF NOT EXISTS context text;
CREATE INDEX IF NOT EXISTS public_intake_events_phone_idx
  ON public.public_intake_events (kind, phone_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS public_intake_events_emailhash_idx
  ON public.public_intake_events (kind, email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS public_intake_events_ip_idx
  ON public.public_intake_events (kind, ip_hash, created_at DESC);

-- ---------- 10. public evidence has no portal uploader ----------
ALTER TABLE public.file_uploads ALTER COLUMN uploaded_by DROP NOT NULL;

-- ---------- 11. updated_at triggers ----------
CREATE OR REPLACE FUNCTION public.mc_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

CREATE TRIGGER cparties_touch BEFORE UPDATE ON public.complaint_parties
  FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();
CREATE TRIGGER cresp_touch BEFORE UPDATE ON public.complaint_respondents
  FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();
CREATE TRIGGER cva_touch BEFORE UPDATE ON public.complaint_vulnerability_assessments
  FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();
CREATE TRIGGER cja_touch BEFORE UPDATE ON public.complaint_jurisdiction_assessments
  FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();
CREATE TRIGGER cid_touch BEFORE UPDATE ON public.complaint_intake_details
  FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();
CREATE TRIGGER ctc_touch BEFORE UPDATE ON public.complaint_tracking_credentials
  FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();
CREATE TRIGGER cpic_touch BEFORE UPDATE ON public.complaint_public_intake_config
  FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();

-- ---------- 12. seed the global public intake configuration ----------
INSERT INTO public.complaint_public_intake_config (regulator_id, privacy_notice_text, declaration_text)
VALUES (
  NULL,
  'We use the information you give us to assess and handle your complaint, to supervise the businesses we regulate, and to produce statistics. We may share relevant details with the business your complaint is about so it can respond.',
  'I confirm that the information I have given is true and accurate to the best of my knowledge.'
)
ON CONFLICT DO NOTHING;
