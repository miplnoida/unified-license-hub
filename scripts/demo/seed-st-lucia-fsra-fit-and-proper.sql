-- =====================================================================
-- DEMO ENVIRONMENT: DEMO_SLU_FSRA_2026 — STAGE 4
-- Fit & Proper thread: declaration -> screening -> findings ->
-- committee -> determination -> conditions -> monitoring.
--
-- PRIMARY (SAFE) CASE   FPA-SLU-2026-0001  Determined / Fit with Conditions
--   Subject      Alicia Joseph (SAINT-LUCIA-FSRA-DEMO)  5c1c0001…
--   Institution  Hewanorra Nexus Digital Finance Ltd    5c1a0001…
--   Relationship Proposed CEO + Director + effective controller (54%)
--
-- OPTIONAL (RESETTABLE) CASE  FPA-SLU-2026-0002  Awaiting Determination
--   Subject      Daniel Mercer (SAINT-LUCIA-FSRA-DEMO)  5c1c0002…
--   Used for the live "record a determination" demonstration. Resetting it
--   never touches the primary record.
--
-- TRUTHFULNESS NOTES
--   * 54% is NOT stored as a claim: it is the calculated effective interest
--     of the ownership network already seeded in stage 1
--       15% direct  +  65% of Nexus Caribbean Holdings x 60% of Hewanorra
--       = 15 + (0.65 * 0.60 * 100) = 54.00
--     The role row records the calculated figure and cites its inputs.
--   * The combination of ownership, board seat and executive management is
--     recorded as a GOVERNANCE / CONFLICT-MANAGEMENT consideration, not as an
--     adverse finding. Every screening finding is disposed as "cleared".
--   * The determination is human: recorded by the F&P supervisor on the
--     committee's rationale. No AI system produced or approved it.
--   * Idempotent: fixed 5c5… UUID family, safe to re-run. Re-runs re-anchor
--     only the demonstration timestamps (through the documented, audited
--     rule_overrides mechanism) so the case keeps its "High / due soon"
--     posture on any demonstration day. Evidence, rationale, conditions,
--     votes, determining officer and audit history are never rewritten.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF public.is_production_environment() THEN
    RAISE EXCEPTION 'DEMO seed refused: production environment';
  END IF;
END $$;

DO $seed$
DECLARE
  c_regulator   uuid := '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3';  -- Saint Lucia FSRA
  c_entity      uuid := '5c1a0001-0000-4000-8000-000000000001';  -- Hewanorra Nexus
  c_person      uuid := '5c1c0001-0000-4000-8000-000000000001';  -- Alicia Joseph
  c_person2     uuid := '5c1c0002-0000-4000-8000-000000000002';  -- Daniel Mercer
  c_officer     uuid := '0f6b6743-085d-4862-b19d-b9d45887ae17';  -- fit_proper_officer@
  c_supervisor  uuid := 'fd4d4164-435b-4c5a-b96d-79428ac5719e';  -- fit_proper_supervisor@
  c_admin       uuid := '4248640c-3397-4cf6-a274-fa09bad4ba64';  -- super_admin@

  c_ind         uuid := '5c500001-0000-4000-8000-000000000001';
  c_ind2        uuid := '5c500002-0000-4000-8000-000000000002';
  c_link        uuid := '5c510001-0000-4000-8000-000000000001';
  c_link2       uuid := '5c510002-0000-4000-8000-000000000002';
  c_role_ceo    uuid := '5c520001-0000-4000-8000-000000000001';
  c_role_dir    uuid := '5c520002-0000-4000-8000-000000000002';
  c_role_ctrl   uuid := '5c520003-0000-4000-8000-000000000003';
  c_role_dir2   uuid := '5c520004-0000-4000-8000-000000000004';
  c_cmt         uuid := '5c530001-0000-4000-8000-000000000001';
  c_m_chair     uuid := '5c530011-0000-4000-8000-000000000011';
  c_m_member    uuid := '5c530012-0000-4000-8000-000000000012';
  c_m_sec       uuid := '5c530013-0000-4000-8000-000000000013';
  c_case        uuid := '5c540001-0000-4000-8000-000000000001';
  c_case2       uuid := '5c540002-0000-4000-8000-000000000002';
  c_run         uuid := '5c550001-0000-4000-8000-000000000001';
  c_run2        uuid := '5c550002-0000-4000-8000-000000000002';
  c_det         uuid := '5c580001-0000-4000-8000-000000000001';
  c_mon         uuid := '5c5a0001-0000-4000-8000-00000000000a';
  c_inv         uuid := '5c5b0001-0000-4000-8000-00000000000b';
  c_inv2        uuid := '5c5b0002-0000-4000-8000-00000000000c';
  c_form_tpl    uuid := '11111111-2222-3333-4444-000000000f01';
  c_form_ver    uuid := '11111111-2222-3333-4444-000000000f02';

  v_direct      numeric;
  v_via_pct     numeric;
  v_holdco_pct  numeric;
  v_effective   numeric;
  v_submitted   timestamptz := now() - interval '96 days';
  v_screened    timestamptz := now() - interval '78 days';
  v_committee   timestamptz := now() - interval '30 days';
  v_determined  timestamptz := now() - interval '28 days';   -- 30-day SLA -> due soon -> HIGH
  v_declaration jsonb;
BEGIN
  -- ------------------------------------------------------------------
  -- 0. Effective control is CALCULATED from the seeded ownership network
  -- ------------------------------------------------------------------
  SELECT economic_interest_percentage INTO v_direct
    FROM public.ownership_interests
   WHERE owner_party_id = c_person AND owned_entity_id = c_entity AND effective_to IS NULL;

  SELECT economic_interest_percentage INTO v_via_pct
    FROM public.ownership_interests
   WHERE owner_party_id = c_person AND owned_entity_id IS NULL AND effective_to IS NULL
   ORDER BY economic_interest_percentage DESC LIMIT 1;      -- 65% of Nexus Caribbean Holdings

  SELECT economic_interest_percentage INTO v_holdco_pct
    FROM public.ownership_interests
   WHERE owner_party_id = '5c1d0001-0000-4000-8000-000000000001'
     AND owned_entity_id = c_entity AND effective_to IS NULL;

  IF v_direct IS NULL OR v_via_pct IS NULL OR v_holdco_pct IS NULL THEN
    RAISE EXCEPTION 'DEMO F&P seed: stage 1 ownership network missing — run seed-st-lucia-fsra-demo.sql first';
  END IF;

  v_effective := round(v_direct + (v_via_pct / 100.0) * v_holdco_pct, 2);
  IF v_effective <> 54.00 THEN
    RAISE EXCEPTION 'DEMO F&P seed: effective interest computed as %, expected 54.00', v_effective;
  END IF;

  -- ------------------------------------------------------------------
  -- 1. Fit & Proper individuals, resolved to the canonical person party
  -- ------------------------------------------------------------------
  INSERT INTO public.fp_individuals
    (id, full_name, date_of_birth, nationality, national_id, passport_number,
     email, phone, address, status, regulator_id, notes, created_by, created_at)
  VALUES
    (c_ind, 'Alicia Joseph (SAINT-LUCIA-FSRA-DEMO)', '1979-04-12', 'Saint Lucian',
     'SLU-NID-5C1C0001', 'SLU-PP-5C1C0001',
     'alicia.joseph@hewanorranexus.demo.lc', '+1 758 555 0101',
     'Rodney Bay, Gros Islet, Saint Lucia', 'active', c_regulator,
     'DEMO_SLU_FSRA_2026 — proposed CEO, director and effective controller of Hewanorra Nexus Digital Finance Ltd.',
     c_officer, v_submitted - interval '4 days'),
    (c_ind2, 'Daniel Mercer (SAINT-LUCIA-FSRA-DEMO)', '1984-11-03', 'Saint Lucian',
     'SLU-NID-5C1C0002', 'SLU-PP-5C1C0002',
     'daniel.mercer@hewanorranexus.demo.lc', '+1 758 555 0102',
     'Castries, Saint Lucia', 'active', c_regulator,
     'DEMO_SLU_FSRA_2026 — resettable live-demonstration subject (awaiting determination).',
     c_officer, now() - interval '21 days')
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        regulator_id = EXCLUDED.regulator_id,
        status = 'active',
        notes = EXCLUDED.notes;

  -- Canonical identity resolution (the autolink trigger may have written its
  -- own row; the demonstration owns a deterministic, fixed-id link instead).
  DELETE FROM public.fp_individual_party_links WHERE fp_individual_id IN (c_ind, c_ind2);
  INSERT INTO public.fp_individual_party_links
    (id, fp_individual_id, person_party_id, match_method, match_confidence,
     match_category, linked_by, linked_at, match_evidence, link_reason)
  VALUES
    (c_link, c_ind, c_person, 'NATIONAL_ID', 'DETERMINISTIC', 'EXACT_STRONG_IDENTIFIER',
     c_officer, v_submitted,
     jsonb_build_object('national_id','SLU-NID-5C1C0001','source','declaration + register match'),
     'Declared national identifier matches the registered person party exactly.'),
    (c_link2, c_ind2, c_person2, 'NATIONAL_ID', 'DETERMINISTIC', 'EXACT_STRONG_IDENTIFIER',
     c_officer, now() - interval '21 days',
     jsonb_build_object('national_id','SLU-NID-5C1C0002','source','declaration + register match'),
     'Declared national identifier matches the registered person party exactly.')
  ON CONFLICT (id) DO NOTHING;

  -- ------------------------------------------------------------------
  -- 2. Regulatory relationships (role register)
  -- ------------------------------------------------------------------
  INSERT INTO public.fp_individual_roles
    (id, individual_id, licensee_id, role_type, role_title, effective_from, is_current,
     ownership_pct, notes, created_by, reassessment_cycle_months, last_reassessment_at, next_reassessment_due)
  VALUES
    (c_role_ceo, c_ind, c_entity, 'ceo', 'Proposed Chief Executive Officer',
     (v_determined)::date, true, NULL,
     'Proposed appointment subject to a satisfactory fit and proper determination.',
     c_officer, 12, v_determined, (v_determined + interval '12 months')::date),
    (c_role_dir, c_ind, c_entity, 'director', 'Director (Board)',
     '2023-01-15', true, NULL,
     'Board appointment recorded in the entity appointment register.',
     c_officer, 12, v_determined, (v_determined + interval '12 months')::date),
    (c_role_ctrl, c_ind, c_entity, 'controller', 'Effective controller (calculated interest)',
     '2023-01-15', true, v_effective,
     format('Calculated effective interest %s%%: %s%% direct + %s%% of Nexus Caribbean Holdings which holds %s%% of the licensee. Source: ownership_interests (stage 1), not a declared figure.',
            v_effective, v_direct, v_via_pct, v_holdco_pct),
     c_officer, 12, v_determined, (v_determined + interval '12 months')::date),
    (c_role_dir2, c_ind2, c_entity, 'director', 'Director (Board)',
     '2024-06-01', true, 25,
     'Board appointment used for the resettable live determination demonstration.',
     c_officer, 12, NULL, NULL)
  ON CONFLICT (id) DO UPDATE
    SET role_title = EXCLUDED.role_title,
        ownership_pct = EXCLUDED.ownership_pct,
        notes = EXCLUDED.notes,
        is_current = true,
        last_reassessment_at = EXCLUDED.last_reassessment_at,
        next_reassessment_due = EXCLUDED.next_reassessment_due;

  -- The entity appointment register points at the same F&P individual, so
  -- Entity 360 and the F&P register cannot disagree about who this is.
  UPDATE public.entity_appointments
     SET fp_individual_id = c_ind
   WHERE person_party_id = c_person AND entity_id = c_entity
     AND fp_individual_id IS DISTINCT FROM c_ind;
  UPDATE public.entity_appointments
     SET fp_individual_id = c_ind2
   WHERE person_party_id = c_person2 AND entity_id = c_entity
     AND fp_individual_id IS DISTINCT FROM c_ind2;

  -- ------------------------------------------------------------------
  -- 3. Committee, membership and quorum configuration
  -- ------------------------------------------------------------------
  INSERT INTO public.fp_committees
    (id, name, description, regulator_id, quorum, approval_threshold_pct, is_active)
  VALUES
    (c_cmt, 'FSRA Fit & Proper Committee (Saint Lucia)',
     'Statutory fit and proper committee. Quorum 3 members; 60% supporting votes required to approve or approve with conditions.',
     c_regulator, 3, 60.00, true)
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name, description = EXCLUDED.description,
        quorum = 3, approval_threshold_pct = 60.00, is_active = true;

  INSERT INTO public.fp_committee_members (id, committee_id, user_id, member_role, is_active, added_at, vote_weight)
  VALUES
    (c_m_chair,  c_cmt, c_supervisor, 'chair',     true, v_submitted, 1),
    (c_m_member, c_cmt, c_admin,      'member',    true, v_submitted, 1),
    (c_m_sec,    c_cmt, c_officer,    'secretary', true, v_submitted, 1)
  ON CONFLICT (id) DO UPDATE
    SET member_role = EXCLUDED.member_role, is_active = true;

  -- ------------------------------------------------------------------
  -- 4. Declaration (personal questionnaire) as received
  -- ------------------------------------------------------------------
  v_declaration := jsonb_build_object(
    'submitted_at', to_char(v_submitted, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
    'full_name', 'Alicia Joseph',
    'date_of_birth', '1979-04-12',
    'national_id', 'SLU-NID-5C1C0001',
    'nationality', 'Saint Lucian',
    'address', 'Bay Walk Avenue, Rodney Bay, Gros Islet, Saint Lucia',
    'contact_number', '+1 758 555 0101',
    'qualifications', jsonb_build_array(
      jsonb_build_object('Qualification','BSc Economics (Hons)','Institution','University of the West Indies','Year','2001'),
      jsonb_build_object('Qualification','MBA, Finance','Institution','University of Warwick','Year','2006'),
      jsonb_build_object('Qualification','Chartered Financial Analyst (CFA)','Institution','CFA Institute','Year','2010')),
    'employment_history', jsonb_build_array(
      jsonb_build_object('Employer','Eastern Caribbean Merchant Bank','Role','Head of Corporate Banking','From','2014-02','To','2019-08','Reason for leaving','Recruited to found Hewanorra Nexus'),
      jsonb_build_object('Employer','Hewanorra Nexus Digital Finance Ltd','Role','Managing Director','From','2019-09','To','Present','Reason for leaving','n/a')),
    'directorships', jsonb_build_array(
      jsonb_build_object('Entity','Hewanorra Nexus Digital Finance Ltd','Role','Director','From','2023-01','To','Present'),
      jsonb_build_object('Entity','Nexus Caribbean Holdings Ltd','Role','Director & shareholder','From','2019-09','To','Present')),
    'ownership_interests', format(
      '15%% direct economic and voting interest in Hewanorra Nexus Digital Finance Ltd; 65%% of Nexus Caribbean Holdings Ltd, which holds 60%% of the licensee. Total effective interest %s%%.', v_effective),
    'criminal_regulatory_history', 'None. No convictions, cautions, pending charges or regulatory sanctions in any jurisdiction.',
    'bankruptcy_flag', 'No',
    'bankruptcy_details', '',
    'disciplinary_history', 'None recorded by any professional body, employer or regulator.',
    'conflicts_of_interest', 'I hold a controlling interest, a board seat and (proposed) executive management responsibility in the same licensee. I have proposed an annual conflict declaration and recusal from related-party decisions.',
    'related_parties', 'Nexus Caribbean Holdings Ltd (shareholder, 65% held by me). Daniel Mercer, fellow director, holds 25% directly.',
    'pep_status', 'No',
    'pep_details', '',
    'aml_training', 'AML/CFT for Senior Management — Eastern Caribbean Institute of Banking, completed 2025-11-14.',
    'consent_checks', jsonb_build_array('I consent to the regulator carrying out background, criminal, credit and regulatory checks.'),
    'declaration_confirm', jsonb_build_array('I confirm the information provided is true, accurate and complete. I understand that misrepresentation may result in refusal of authorisation, revocation of any authorisation granted, and referral to law-enforcement authorities.'),
    '_verification', jsonb_build_object(
      'declaration_complete', true,
      'identity_verified', true,
      'qualifications_verified', true,
      'employment_history_verified', true,
      'sanctions_screening', 'no_confirmed_match',
      'pep_screening', 'no_confirmed_match',
      'financial_soundness', 'no_material_concern',
      'verified_by', 'Fit & Proper Officer',
      'verified_at', to_char(v_screened, 'YYYY-MM-DD"T"HH24:MI:SSOF')));

  -- ------------------------------------------------------------------
  -- 5. The assessments (inserted pre-determination so every guard runs)
  -- ------------------------------------------------------------------
  INSERT INTO public.fp_assessments
    (id, individual_id, role_id, licensee_id, assessment_type, status, external_reference,
     declaration_data, submitted_at, submitted_by, committee_id, regulator_id, created_by,
     created_at, form_template_id, form_version_id)
  VALUES
    (c_case, c_ind, c_role_ceo, c_entity, 'initial', 'awaiting_committee', 'FPA-SLU-2026-0001',
     v_declaration, v_submitted, c_officer, c_cmt, c_regulator, c_officer,
     v_submitted - interval '4 days', c_form_tpl, c_form_ver)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.fp_assessments
    (id, individual_id, role_id, licensee_id, assessment_type, status, external_reference,
     declaration_data, submitted_at, submitted_by, committee_id, regulator_id, created_by,
     created_at, form_template_id, form_version_id)
  VALUES
    (c_case2, c_ind2, c_role_dir2, c_entity, 'initial', 'awaiting_committee', 'FPA-SLU-2026-0002',
     jsonb_build_object(
       'submitted_at', to_char(now() - interval '18 days', 'YYYY-MM-DD"T"HH24:MI:SSOF'),
       'full_name', 'Daniel Mercer',
       'date_of_birth', '1984-11-03',
       'national_id', 'SLU-NID-5C1C0002',
       'nationality', 'Saint Lucian',
       'address', 'Vigie, Castries, Saint Lucia',
       'contact_number', '+1 758 555 0102',
       'criminal_regulatory_history', 'None.',
       'bankruptcy_flag', 'No',
       'disciplinary_history', 'None.',
       'conflicts_of_interest', 'Holds 25% of the licensee directly; no executive responsibility proposed.',
       'related_parties', 'Co-shareholder with Alicia Joseph in Nexus Caribbean Holdings Ltd.',
       'pep_status', 'No',
       'aml_training', 'AML/CFT refresher, 2026-01-20.',
       'declaration_confirm', jsonb_build_array('I confirm the information provided is true, accurate and complete.')),
     now() - interval '18 days', c_officer, c_cmt, c_regulator, c_officer,
     now() - interval '21 days', c_form_tpl, c_form_ver)
  ON CONFLICT (id) DO NOTHING;

  -- Declaration invitations (how the declaration was requested and received)
  INSERT INTO public.declaration_invitations
    (id, individual_id, assessment_id, token_hash, verification_hash, channel, status,
     recipient_email, sent_at, opened_at, submitted_at, expires_at, created_by, created_at)
  VALUES
    (c_inv, c_ind, c_case, 'demo-slu-fp-0001-token', 'demo-slu-fp-0001-verify', 'EMAIL', 'SUBMITTED',
     'alicia.joseph@hewanorranexus.demo.lc',
     v_submitted - interval '4 days', v_submitted - interval '3 days', v_submitted,
     v_submitted + interval '30 days', c_officer, v_submitted - interval '4 days'),
    (c_inv2, c_ind2, c_case2, 'demo-slu-fp-0002-token', 'demo-slu-fp-0002-verify', 'EMAIL', 'SUBMITTED',
     'daniel.mercer@hewanorranexus.demo.lc',
     now() - interval '21 days', now() - interval '20 days', now() - interval '18 days',
     now() + interval '12 days', c_officer, now() - interval '21 days')
  ON CONFLICT (id) DO NOTHING;

  -- ------------------------------------------------------------------
  -- 6. Screening runs and their disposed findings (the evidence record)
  -- ------------------------------------------------------------------
  INSERT INTO public.fp_screening_runs
    (id, assessment_id, individual_id, run_type, status, started_at, completed_at,
     total_checks, total_hits, triggered_by, provider_outcomes, config_snapshot)
  VALUES
    (c_run, c_case, c_ind, 'initial', 'completed', v_screened - interval '1 day', v_screened,
     12, 1, c_officer,
     jsonb_build_array(
       jsonb_build_object('provider','UN Consolidated Sanctions List','check_type','sanctions','result','NO_MATCH','checked_at', v_screened),
       jsonb_build_object('provider','OFAC SDN','check_type','sanctions','result','NO_MATCH','checked_at', v_screened),
       jsonb_build_object('provider','UK OFSI','check_type','sanctions','result','NO_MATCH','checked_at', v_screened),
       jsonb_build_object('provider','EU Consolidated List','check_type','sanctions','result','NO_MATCH','checked_at', v_screened),
       jsonb_build_object('provider','PEP register (regional)','check_type','pep','result','NAME_SIMILARITY_ONLY','checked_at', v_screened),
       jsonb_build_object('provider','Adverse media sweep','check_type','adverse_media','result','NO_MATCH','checked_at', v_screened),
       jsonb_build_object('provider','Saint Lucia Registry of Companies','check_type','directorships','result','CONFIRMED','checked_at', v_screened),
       jsonb_build_object('provider','Insolvency register','check_type','insolvency','result','NO_MATCH','checked_at', v_screened)),
     jsonb_build_object('lists', 12, 'fuzzy_threshold', 0.85, 'run_by_role', 'Fit & Proper Officer')),
    (c_run2, c_case2, c_ind2, 'initial', 'completed', now() - interval '15 days', now() - interval '15 days',
     12, 0, c_officer,
     jsonb_build_array(
       jsonb_build_object('provider','UN Consolidated Sanctions List','check_type','sanctions','result','NO_MATCH','checked_at', now() - interval '15 days'),
       jsonb_build_object('provider','PEP register (regional)','check_type','pep','result','NO_MATCH','checked_at', now() - interval '15 days')),
     jsonb_build_object('lists', 12, 'fuzzy_threshold', 0.85, 'run_by_role', 'Fit & Proper Officer'))
  ON CONFLICT (id) DO UPDATE
    SET status = 'completed', completed_at = EXCLUDED.completed_at,
        total_checks = EXCLUDED.total_checks, total_hits = EXCLUDED.total_hits,
        provider_outcomes = EXCLUDED.provider_outcomes;

  INSERT INTO public.fp_findings
    (id, run_id, assessment_id, individual_id, check_type, severity, title, summary,
     source, is_false_positive, reviewed_by, reviewed_at, review_note,
     resolution_status, resolution_reason, resolved_by, resolved_at,
     citations, evidence_urls, created_at)
  VALUES
    ('5c560001-0000-4000-8000-000000000001', c_run, c_case, c_ind, 'identity', 'low',
     'Identity verified', 'Passport SLU-PP-5C1C0001 and national identifier verified against the civil register and the licensee''s appointment record.',
     'Saint Lucia civil register', false, c_officer, v_screened, 'Documentary identity evidence sighted and copied to the case file.',
     'cleared', 'Identity confirmed — no discrepancy.', c_officer, v_screened,
     jsonb_build_array(jsonb_build_object('type','document','ref','Passport SLU-PP-5C1C0001'),
                       jsonb_build_object('type','register','ref','Person party 5c1c0001')),
     jsonb_build_array('case-file://FPA-SLU-2026-0001/identity/passport.pdf'), v_screened),
    ('5c560002-0000-4000-8000-000000000002', c_run, c_case, c_ind, 'qualifications', 'low',
     'Qualifications verified', 'BSc (UWI, 2001), MBA (Warwick, 2006) and CFA charter (2010) confirmed directly with the awarding bodies.',
     'Awarding body confirmations', false, c_officer, v_screened, 'Three of three qualifications independently confirmed.',
     'cleared', 'All declared qualifications confirmed.', c_officer, v_screened,
     jsonb_build_array(jsonb_build_object('type','confirmation','ref','CFA Institute member verification')),
     jsonb_build_array('case-file://FPA-SLU-2026-0001/qualifications/confirmations.pdf'), v_screened),
    ('5c560003-0000-4000-8000-000000000003', c_run, c_case, c_ind, 'employment', 'low',
     'Employment history verified', 'Ten-year employment history confirmed with both employers; no unexplained gaps and no adverse leaving circumstances.',
     'Employer references', false, c_officer, v_screened, 'Two written references obtained.',
     'cleared', 'Employment history complete and consistent.', c_officer, v_screened,
     jsonb_build_array(jsonb_build_object('type','reference','ref','Eastern Caribbean Merchant Bank, 2019')),
     jsonb_build_array('case-file://FPA-SLU-2026-0001/employment/references.pdf'), v_screened),
    ('5c560004-0000-4000-8000-000000000004', c_run, c_case, c_ind, 'sanctions', 'low',
     'Sanctions screening — no confirmed match', 'Screened against UN, OFAC SDN, UK OFSI and EU consolidated lists. No match.',
     'Sanctions list screening', false, c_officer, v_screened, 'Zero hits across all four sanctions sources.',
     'cleared', 'No confirmed sanctions match.', c_officer, v_screened,
     jsonb_build_array(jsonb_build_object('type','screening','ref','Run ' || c_run::text)),
     jsonb_build_array('case-file://FPA-SLU-2026-0001/screening/sanctions.pdf'), v_screened),
    ('5c560005-0000-4000-8000-000000000005', c_run, c_case, c_ind, 'pep', 'low',
     'PEP screening — name similarity only, no confirmed match', 'One name-similarity hit on a regional PEP register was reviewed and discounted: different date of birth and nationality. Subject is not a PEP and is not a close associate of one.',
     'PEP register (regional)', false, c_officer, v_screened, 'Similarity hit reviewed against DOB and nationality; not the same person.',
     'cleared', 'No confirmed PEP match.', c_officer, v_screened,
     jsonb_build_array(jsonb_build_object('type','screening','ref','Run ' || c_run::text),
                       jsonb_build_object('type','analysis','ref','DOB/nationality discriminator')),
     jsonb_build_array('case-file://FPA-SLU-2026-0001/screening/pep-review.pdf'), v_screened),
    ('5c560006-0000-4000-8000-000000000006', c_run, c_case, c_ind, 'adverse_media', 'low',
     'Adverse media — no confirmed match', 'Regional and international media sweep returned no adverse coverage.',
     'Adverse media sweep', false, c_officer, v_screened, 'No adverse coverage identified.',
     'cleared', 'No adverse media.', c_officer, v_screened,
     jsonb_build_array(jsonb_build_object('type','screening','ref','Run ' || c_run::text)),
     jsonb_build_array('case-file://FPA-SLU-2026-0001/screening/media.pdf'), v_screened),
    ('5c560007-0000-4000-8000-000000000007', c_run, c_case, c_ind, 'financial_soundness', 'low',
     'Financial soundness — no material concern recorded', 'Credit and insolvency checks completed. No bankruptcy, judgment or insolvency proceeding recorded in any searched jurisdiction.',
     'Insolvency and credit registers', false, c_officer, v_screened, 'No material financial concern.',
     'cleared', 'No material financial soundness concern.', c_officer, v_screened,
     jsonb_build_array(jsonb_build_object('type','register','ref','Saint Lucia insolvency register')),
     jsonb_build_array('case-file://FPA-SLU-2026-0001/financial/soundness.pdf'), v_screened),
    ('5c560008-0000-4000-8000-000000000008', c_run, c_case, c_ind, 'governance', 'medium',
     'Combined ownership, board and executive roles — governance consideration',
     format('The subject would simultaneously hold %s%% effective control, a board seat and executive management responsibility. Recorded as a governance and conflict-management consideration to be addressed by conditions; it is NOT an adverse fitness finding.', v_effective),
     'Case analysis (ownership network)', false, c_officer, v_screened,
     'Escalated to committee for conditions rather than treated as an adverse finding.',
     'cleared', 'Addressed through determination conditions 1 and 2.', c_supervisor, v_committee,
     jsonb_build_array(jsonb_build_object('type','calculation','ref','ownership_interests: 15% direct + 65% x 60% = 54%')),
     jsonb_build_array('case-file://FPA-SLU-2026-0001/governance/conflict-analysis.pdf'), v_screened),
    ('5c560011-0000-4000-8000-000000000011', c_run2, c_case2, c_ind2, 'sanctions', 'low',
     'Sanctions screening — no confirmed match', 'No match across the configured sanctions sources.',
     'Sanctions list screening', false, c_officer, now() - interval '15 days', 'Zero hits.',
     'cleared', 'No confirmed sanctions match.', c_officer, now() - interval '15 days',
     '[]'::jsonb, '[]'::jsonb, now() - interval '15 days')
  ON CONFLICT (id) DO NOTHING;

  -- ------------------------------------------------------------------
  -- 7. Committee meeting: quorum, attendance and recorded votes
  -- ------------------------------------------------------------------
  INSERT INTO public.fp_committee_votes
    (id, assessment_id, committee_id, member_id, vote, justification, voted_at, weight, rationale_required)
  VALUES
    ('5c570001-0000-4000-8000-000000000001', c_case, c_cmt, c_m_chair, 'conditional',
     'Competence, honesty and financial soundness are evidenced and unchallenged. The concentration of ownership, board and executive roles requires ongoing conflict management, so I support approval subject to conditions.',
     v_committee, 1, true),
    ('5c570002-0000-4000-8000-000000000002', c_case, c_cmt, c_m_member, 'conditional',
     'Agree with the chair. No adverse screening outcome. Conditions on conflict declaration, independent oversight of related-party matters and change notification are proportionate.',
     v_committee, 1, true),
    ('5c570003-0000-4000-8000-000000000003', c_case, c_cmt, c_m_sec, 'approve',
     'Declaration complete, identity, qualifications and employment verified, screening clear. Content to approve with the conditions proposed by the chair.',
     v_committee, 1, false)
  ON CONFLICT (id) DO NOTHING;

  -- ------------------------------------------------------------------
  -- 8. Determination — human decision, recorded by the F&P supervisor
  -- ------------------------------------------------------------------
  INSERT INTO public.fp_determinations
    (id, assessment_id, individual_id, outcome, rationale, determined_by, determined_at,
     effective_from, effective_to, is_current, regulator_id, signature_hash)
  VALUES
    (c_det, c_case, c_ind, 'conditional',
     format('FIT WITH CONDITIONS. The Fit & Proper Committee met on %s with a quorum of 3 of 3 members (chair, member, secretary) and resolved by 3 supporting votes of 3 cast (100%%, threshold 60%%) to determine the subject fit and proper to hold the roles of Chief Executive Officer and Director of Hewanorra Nexus Digital Finance Ltd, subject to conditions. '
            'Basis: declaration received and complete; identity, qualifications and employment history verified; sanctions and PEP screening produced no confirmed match; no material financial soundness concern recorded; no criminal, regulatory, disciplinary or insolvency history disclosed or discovered. '
            'The committee expressly recorded that the subject''s combination of %s%% effective control, board membership and executive management responsibility is a governance and conflict-management consideration, not an adverse finding, and is addressed by the conditions attached to this determination. '
            'This determination was made by the committee and recorded by the Fit & Proper Supervisor. No automated or AI system produced, influenced or approved the outcome.',
            to_char(v_committee, 'DD Mon YYYY'), v_effective),
     c_supervisor, v_determined,
     (v_determined)::date, (v_determined + interval '12 months')::date, true, c_regulator,
     encode(digest('FPA-SLU-2026-0001|conditional|' || c_supervisor::text, 'sha256'), 'hex'))
  ON CONFLICT (id) DO NOTHING;

  -- Now that a determination artifact exists, move the case to Determined.
  UPDATE public.fp_assessments
     SET status = 'determined', determined_at = v_determined
   WHERE id = c_case AND status <> 'determined';

  -- ------------------------------------------------------------------
  -- 9. Conditions attached to the determination
  -- ------------------------------------------------------------------
  INSERT INTO public.fp_conditions
    (id, determination_id, individual_id, category, description, due_date,
     monitoring_owner, evidence_type, status, created_by, created_at)
  VALUES
    ('5c590001-0000-4000-8000-000000000001', c_det, c_ind, 'governance',
     'Submit an annual conflict-of-interest declaration to the board and to the FSRA, covering all ownership, directorship and management interests.',
     (v_determined + interval '12 months')::date, c_officer, 'Signed annual declaration', 'open', c_supervisor, v_determined),
    ('5c590002-0000-4000-8000-000000000002', c_det, c_ind, 'governance',
     'Ensure independent (non-conflicted) board oversight of all related-party matters, with the subject recused from the decision and the recusal minuted.',
     (v_determined + interval '6 months')::date, c_officer, 'Board minutes evidencing recusal', 'open', c_supervisor, v_determined),
    ('5c590003-0000-4000-8000-000000000003', c_det, c_ind, 'notification',
     'Notify the FSRA of any material change in ownership, role or matters bearing on fitness and propriety within 14 days of the change.',
     (v_determined + interval '12 months')::date, c_officer, 'Written notification to the FSRA', 'open', c_supervisor, v_determined),
    ('5c590004-0000-4000-8000-000000000004', c_det, c_ind, 'reassessment',
     'Undergo periodic fit and proper reassessment under the applicable policy cycle (12 months).',
     (v_determined + interval '12 months')::date, c_officer, 'Completed reassessment case', 'open', c_supervisor, v_determined)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.fp_monitoring_events
    (id, individual_id, determination_id, event_type, severity, summary, detail, raised_at)
  VALUES
    (c_mon, c_ind, c_det, 'assessment_due', 'low',
     'Periodic reassessment scheduled 12 months after the determination effective date.',
     jsonb_build_object('cycle_months', 12, 'due', (v_determined + interval '12 months')::date), v_determined)
  ON CONFLICT (id) DO NOTHING;

  -- ------------------------------------------------------------------
  -- 10. Re-anchor demonstration timestamps (documented, audited override)
  -- ------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.fp_assessments
              WHERE id = c_case AND determined_at IS DISTINCT FROM v_determined) THEN
    INSERT INTO public.rule_overrides
      (module, entity_type, entity_id, rule_key, reason, user_id, user_role, metadata)
    VALUES
      ('fit_and_proper', 'fp_assessment', c_case::text, 'fit_and_proper.assessment.edit_finalized',
       'DEMO_SLU_FSRA_2026 seed re-run: re-anchor demonstration timestamps only. No evidence, rationale, vote, condition or determining officer is modified.',
       c_admin, 'super_admin', jsonb_build_object('seed','seed-st-lucia-fsra-fit-and-proper.sql'));
    UPDATE public.fp_assessments SET determined_at = v_determined WHERE id = c_case;
  END IF;

  -- ------------------------------------------------------------------
  -- 11. Audit history (canonical + compliance journal)
  -- ------------------------------------------------------------------
  INSERT INTO public.compliance_audit_logs
    (entry_id, "timestamp", user_id, user_role, action_type, object_type, object_id, after_value, justification)
  VALUES
    ('5c5d0001-0000-4000-8000-000000000001', v_submitted - interval '4 days', c_officer, 'licensing_officer',
     'CREATE', 'fp_assessment', c_case::text,
     jsonb_build_object('reference','FPA-SLU-2026-0001','status','draft','type','initial'),
     'Initial fit and proper assessment opened for the proposed CEO and director of Hewanorra Nexus Digital Finance Ltd.'),
    ('5c5d0002-0000-4000-8000-000000000002', v_submitted, c_officer, 'licensing_officer',
     'WORKFLOW_TRANSITION', 'fp_assessment', c_case::text,
     jsonb_build_object('from','draft','to','submitted'),
     'Personal questionnaire received and recorded as complete.'),
    ('5c5d0003-0000-4000-8000-000000000003', v_screened, c_officer, 'licensing_officer',
     'WORKFLOW_TRANSITION', 'fp_assessment', c_case::text,
     jsonb_build_object('from','submitted','to','screening','screening_run', c_run),
     'Screening run completed: identity, qualifications, employment, sanctions, PEP, adverse media and financial soundness. One PEP name-similarity hit reviewed and discounted.'),
    ('5c5d0004-0000-4000-8000-000000000004', v_screened + interval '1 day', c_officer, 'licensing_officer',
     'WORKFLOW_TRANSITION', 'fp_assessment', c_case::text,
     jsonb_build_object('from','screening','to','awaiting_committee'),
     'All findings disposed as cleared. Referred to the Fit & Proper Committee because of the combined ownership, board and executive roles.'),
    ('5c5d0005-0000-4000-8000-000000000005', v_committee, c_supervisor, 'supervisor',
     'APPROVE', 'fp_assessment', c_case::text,
     jsonb_build_object('quorum_required',3,'votes_cast',3,'supporting_pct',100,'outcome','conditional'),
     'Committee met with quorum (3 of 3). Resolved to determine fit with conditions; conflict of interest concentration to be managed by conditions.'),
    ('5c5d0006-0000-4000-8000-000000000006', v_determined, c_supervisor, 'supervisor',
     'CREATE', 'fp_determination', c_det::text,
     jsonb_build_object('outcome','conditional','conditions',4,'determined_by','Fit & Proper Supervisor','ai_involvement','none'),
     'Determination issued: FIT WITH CONDITIONS. Human decision recorded on the committee rationale; no AI system produced or approved the outcome.'),
    ('5c5d0007-0000-4000-8000-000000000007', v_determined, c_supervisor, 'supervisor',
     'WORKFLOW_TRANSITION', 'fp_assessment', c_case::text,
     jsonb_build_object('from','awaiting_committee','to','determined'),
     'Case moved to Determined; four conditions opened for monitoring.'),
    ('5c5d0011-0000-4000-8000-000000000011', now() - interval '21 days', c_officer, 'licensing_officer',
     'CREATE', 'fp_assessment', c_case2::text,
     jsonb_build_object('reference','FPA-SLU-2026-0002','status','draft','type','initial'),
     'Assessment opened for Daniel Mercer (live demonstration case).'),
    ('5c5d0012-0000-4000-8000-000000000012', now() - interval '15 days', c_officer, 'licensing_officer',
     'WORKFLOW_TRANSITION', 'fp_assessment', c_case2::text,
     jsonb_build_object('from','screening','to','awaiting_committee'),
     'Screening clear; referred to committee. Awaiting determination.')
  ON CONFLICT (entry_id) DO NOTHING;

  INSERT INTO public.audit_logs (id, user_id, user_role, action, entity_type, entity_id, new_value, metadata, created_at)
  VALUES
    ('5c5c0001-0000-4000-8000-000000000001', c_supervisor, 'supervisor', 'fp_determination_record',
     'fp_determination', c_det::text,
     jsonb_build_object('assessment_reference','FPA-SLU-2026-0001','outcome','conditional','conditions',4),
     jsonb_build_object('demo','DEMO_SLU_FSRA_2026','human_decision',true,'ai_involvement','none'), v_determined)
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'DEMO F&P: FPA-SLU-2026-0001 determined (fit with conditions, % %% effective control); FPA-SLU-2026-0002 awaiting determination.', v_effective;
END $seed$;

COMMIT;
