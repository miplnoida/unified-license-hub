-- Fallback intake authority: derived from the active regulator, never hard-coded.
UPDATE public.complaint_public_intake_config c
   SET default_intake_regulator_id = r.id
  FROM (SELECT id FROM public.regulators WHERE status = 'active' ORDER BY created_at LIMIT 1) r
 WHERE c.regulator_id IS NULL
   AND c.default_intake_regulator_id IS NULL
   AND (SELECT count(*) FROM public.regulators WHERE status = 'active') = 1;

-- ---------- parties ----------
INSERT INTO public.complaint_parties (
  complaint_id, party_role, party_type, is_primary_contact, full_name,
  email, phone, information_source, notes)
SELECT c.id, 'complainant', 'individual', true,
       NULLIF(btrim(coalesce(c.complainant_name,'')),''),
       NULLIF(btrim(lower(coalesce(c.email,''))),''),
       NULLIF(btrim(coalesce(c.complainant_phone,'')),''),
       'legacy_migration',
       'Created by MC-01 migration from the original complaint record.'
  FROM public.complaints c
 WHERE NOT EXISTS (SELECT 1 FROM public.complaint_parties p WHERE p.complaint_id = c.id)
   AND COALESCE(NULLIF(btrim(coalesce(c.complainant_name,'')),''),
                NULLIF(btrim(coalesce(c.email,'')),''),
                NULLIF(btrim(coalesce(c.complainant_phone,'')),'')) IS NOT NULL;

-- ---------- respondents ----------
INSERT INTO public.complaint_respondents (
  complaint_id, is_primary, match_state, respondent_role, licensee_id, legal_name, information_source)
SELECT c.id, true, 'MATCHED_REGULATED', 'provider', c.licensee_id, l.name, 'legacy_migration'
  FROM public.complaints c
  JOIN public.licensees l ON l.id = c.licensee_id
 WHERE NOT EXISTS (SELECT 1 FROM public.complaint_respondents r WHERE r.complaint_id = c.id);

-- ---------- contact preferences ----------
INSERT INTO public.complaint_contact_preferences (
  complaint_id, preferred_method, email, phone, information_source)
SELECT c.id,
       CASE
         WHEN lower(coalesce(c.preferred_contact_method,'')) IN ('email','phone','post')
              AND NOT (lower(c.preferred_contact_method) = 'phone'
                       AND NULLIF(btrim(coalesce(c.complainant_phone,'')),'') IS NULL)
              AND NOT (lower(c.preferred_contact_method) = 'post')
           THEN lower(c.preferred_contact_method)
         WHEN NULLIF(btrim(coalesce(c.email,'')),'') IS NOT NULL THEN 'email'
         WHEN NULLIF(btrim(coalesce(c.complainant_phone,'')),'') IS NOT NULL THEN 'phone'
         ELSE NULL
       END,
       NULLIF(btrim(lower(coalesce(c.email,''))),''),
       NULLIF(btrim(coalesce(c.complainant_phone,'')),''),
       'legacy_migration'
  FROM public.complaints c
 WHERE NOT EXISTS (SELECT 1 FROM public.complaint_contact_preferences x WHERE x.complaint_id = c.id)
   AND COALESCE(NULLIF(btrim(coalesce(c.email,'')),''),
                NULLIF(btrim(coalesce(c.complainant_phone,'')),'')) IS NOT NULL;

-- ---------- vulnerability / support ----------
INSERT INTO public.complaint_vulnerability_assessments (
  complaint_id, source, support_required, categories, consumer_notes, staff_review_state)
SELECT c.id, 'legacy_migration', true,
       CASE WHEN NULLIF(btrim(coalesce(c.vulnerability_category,'')),'') IS NOT NULL
            THEN ARRAY[c.vulnerability_category] ELSE '{}'::text[] END,
       NULLIF(btrim(coalesce(c.vulnerability_notes,'')),''),
       'pending'
  FROM public.complaints c
 WHERE c.vulnerability_indicator IS TRUE
   AND NOT EXISTS (SELECT 1 FROM public.complaint_vulnerability_assessments v WHERE v.complaint_id = c.id);

-- ---------- jurisdiction scaffold for every legacy complaint ----------
INSERT INTO public.complaint_jurisdiction_assessments (complaint_id, status, regulator_id, routing_basis)
SELECT c.id, 'PENDING_ASSESSMENT', c.regulator_id,
       CASE WHEN c.licensee_id IS NOT NULL THEN 'matched_respondent' ELSE 'legacy_migration' END
  FROM public.complaints c
 WHERE NOT EXISTS (SELECT 1 FROM public.complaint_jurisdiction_assessments j WHERE j.complaint_id = c.id);
