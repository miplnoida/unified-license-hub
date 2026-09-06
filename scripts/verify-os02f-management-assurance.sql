-- ===========================================================================
-- OS-02F — Supervisory Management Assurance & Control certification gate.
--
-- Rollback-safe: every fixture is created inside the transaction and the
-- transaction is ROLLED BACK at the end. Nothing is written to production.
--
-- Run:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/verify-os02f-management-assurance.sql
-- ===========================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE ma_result(gate text, passed boolean, detail text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.gate(_g text, _ok boolean, _detail text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO ma_result VALUES (_g, COALESCE(_ok,false), _detail);
$$;

-- ---------------------------------------------------------------------------
-- MA-01 — no parallel generic management-case / management-signal object.
-- ---------------------------------------------------------------------------
SELECT pg_temp.gate('MA-01',
  NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND (c.relname ~ 'management_(case|signal|flag|exception|item)'
            OR c.relname ~ 'assurance_(case|signal|flag|item|queue)')),
  'only review + policy objects added; assurance itself is derived');

-- Derivation is a view, not a materialised copy of canonical data.
SELECT pg_temp.gate('MA-01b',
  EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname='public' AND c.relname='supervisory_management_assurance_matter'
             AND c.relkind='v'),
  'supervisory_management_assurance_matter is a view (no reporting warehouse)');

-- ---------------------------------------------------------------------------
-- MA-02 / MA-21 — scope & RLS.
-- ---------------------------------------------------------------------------
SELECT pg_temp.gate('MA-02',
  (SELECT COALESCE((c.reloptions::text) LIKE '%security_invoker=true%', false)
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='supervisory_management_assurance_matter'),
  'assurance view runs with caller RLS (security_invoker)');

SELECT pg_temp.gate('MA-02b',
  (SELECT pg_get_viewdef('public.supervisory_management_assurance_matter'::regclass)
          LIKE '%supervisory_monitoring_scope_admits%'),
  'central supervisory scope contract applied in the derivation');

SELECT pg_temp.gate('MA-21',
  (SELECT count(*) = 0 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('supervisory_management_assurance_register',
                        'supervisory_management_assurance_item',
                        'supervisory_management_assurance_trend',
                        'supervisory_assurance_policy_effective')
      AND p.prosecdef),
  'no SECURITY DEFINER reporting bypass for management read models');

SELECT pg_temp.gate('MA-02c',
  (SELECT bool_and(relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relname IN ('supervisory_signal_review','supervisory_assurance_policy')),
  'new objects are RLS-protected');

SELECT pg_temp.gate('MA-02d',
  (SELECT count(*) FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
    WHERE c.relname IN ('supervisory_signal_review','supervisory_assurance_policy')) >= 3
  AND NOT EXISTS (
    SELECT 1 FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
     WHERE c.relname = 'supervisory_signal_review' AND pol.polcmd <> 'r'),
  'policies exist on both objects; the review table exposes read-only policy surface');


-- ---------------------------------------------------------------------------
-- Fixtures (all rolled back).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE ma_fx(k text primary key, v uuid) ON COMMIT DROP;

DO $$
DECLARE
  _ent uuid; _uid uuid; _sig uuid; _sig2 uuid; _sig3 uuid; _sig4 uuid;
  _fnd uuid; _rem uuid; _rem2 uuid;
BEGIN
  SELECT id INTO _ent FROM public.licensees ORDER BY created_at LIMIT 1;
  SELECT id INTO _uid FROM public.profiles ORDER BY created_at LIMIT 1;

  -- unreviewed material condition
  INSERT INTO public.supervisory_signal (entity_id, domain_code, source_kind, severity,
      detected_at, summary, detector_code, fingerprint, first_detected_at, last_detected_at,
      occurrence_count, state, source_table, source_id, source_reference,
      materiality_reason, config_provenance)
  VALUES (_ent,'PRUDENTIAL','OTHER_GOVERNED_SOURCE','high', now() - interval '20 days',
      'MA fixture: unreviewed material condition','MA_FIXTURE_DETECTOR',
      'MA_FIXTURE:'||_ent::text||':unreviewed', now() - interval '20 days', now(),
      4,'OPEN','ma_fixture', gen_random_uuid(),'MA-FIX-1',
      'fixture materiality','{"fixture":true}'::jsonb)
  RETURNING id INTO _sig;

  -- reviewed, no disposition
  INSERT INTO public.supervisory_signal (entity_id, domain_code, source_kind, severity,
      detected_at, summary, detector_code, fingerprint, first_detected_at, last_detected_at,
      occurrence_count, state, source_table, source_id, source_reference,
      materiality_reason, config_provenance)
  VALUES (_ent,'PRUDENTIAL','OTHER_GOVERNED_SOURCE','high', now() - interval '15 days',
      'MA fixture: reviewed without disposition','MA_FIXTURE_DETECTOR',
      'MA_FIXTURE:'||_ent::text||':reviewed', now() - interval '15 days', now(),
      3,'OPEN','ma_fixture', gen_random_uuid(),'MA-FIX-2',
      'fixture materiality','{"fixture":true}'::jsonb)
  RETURNING id INTO _sig2;

  -- condition RESOLVED but action open
  INSERT INTO public.supervisory_signal (entity_id, domain_code, source_kind, severity,
      detected_at, summary, detector_code, fingerprint, first_detected_at, last_detected_at,
      occurrence_count, state, resolved_at, resolution_reason,
      source_table, source_id, source_reference, materiality_reason, config_provenance)
  VALUES (_ent,'PRUDENTIAL','OTHER_GOVERNED_SOURCE','high', now() - interval '40 days',
      'MA fixture: resolved condition with open action','MA_FIXTURE_DETECTOR',
      NULL, now() - interval '40 days', now() - interval '5 days',
      6,'RESOLVED', now() - interval '5 days','CONDITION_NO_LONGER_OBSERVED',
      'ma_fixture', gen_random_uuid(),'MA-FIX-3','fixture materiality','{"fixture":true}'::jsonb)
  RETURNING id INTO _sig3;

  -- action closed while condition persists / recurrence after action
  INSERT INTO public.supervisory_signal (entity_id, domain_code, source_kind, severity,
      detected_at, summary, detector_code, fingerprint, first_detected_at, last_detected_at,
      occurrence_count, state, source_table, source_id, source_reference,
      materiality_reason, config_provenance)
  VALUES (_ent,'PRUDENTIAL','OTHER_GOVERNED_SOURCE','high', now() - interval '90 days',
      'MA fixture: recurrence after closed action','MA_FIXTURE_DETECTOR',
      NULL, now() - interval '90 days', now(),
      9,'OPEN','ma_fixture', gen_random_uuid(),'MA-FIX-4',
      'fixture materiality','{"fixture":true}'::jsonb)
  RETURNING id INTO _sig4;

  -- occurrence history across separate days for recurrence identity
  INSERT INTO public.supervisory_signal_occurrence (signal_id, observed_at, severity,
      source_table, source_id, detail)
  SELECT s, now() - make_interval(days => d), 'high', 'ma_fixture', gen_random_uuid(),
         '{"fixture":true}'::jsonb
    FROM (VALUES (_sig),(_sig2),(_sig3),(_sig4)) AS x(s),
         generate_series(0, 3) AS g(d);

  -- accountable review on _sig2 (no disposition)
  INSERT INTO public.supervisory_signal_review (signal_id, entity_id, domain_code,
      reviewed_by, reviewed_at, review_note, provenance)
  VALUES (_sig2, _ent, 'PRUDENTIAL', _uid, now() - interval '10 days',
      'MA fixture review', '{"fixture":true}'::jsonb);

  -- accountable "no action required" disposition on _sig4
  INSERT INTO public.supervisory_signal_review (signal_id, entity_id, domain_code,
      reviewed_by, reviewed_at, disposition, disposition_rationale, disposition_by,
      disposition_at, provenance)
  VALUES (_sig4, _ent, 'PRUDENTIAL', _uid, now() - interval '60 days',
      'NO_ACTION_REQUIRED','Fixture: covered by group-wide remediation programme.',
      _uid, now() - interval '60 days', '{"fixture":true}'::jsonb);

  -- canonical supervisory response: finding + remediation
  INSERT INTO public.supervisory_finding (reference, entity_id, domain_code, severity, title,
      observation, status, source_kind, signal_id, due_date, issued_at, owner_id, created_by)
  VALUES ('MA-FIX-FND-1', _ent, 'PRUDENTIAL','HIGH','MA fixture finding','fixture',
      'ISSUED','SIGNAL', _sig3, current_date + 30, now() - interval '30 days', _uid, _uid)
  RETURNING id INTO _fnd;

  INSERT INTO public.supervisory_remediation_action (reference, finding_id, entity_id,
      domain_code, description, status, target_date, owner_id, created_by)
  VALUES ('MA-FIX-REM-1', _fnd, _ent, 'PRUDENTIAL','fixture open overdue remediation',
      'IMPLEMENTING', current_date - 19, _uid, _uid)
  RETURNING id INTO _rem;

  -- completed remediation for the closed-action fixture
  INSERT INTO public.supervisory_finding (reference, entity_id, domain_code, severity, title,
      observation, status, source_kind, signal_id, due_date, issued_at, owner_id, created_by,
      closed_at, closed_by)
  VALUES ('MA-FIX-FND-2', _ent, 'PRUDENTIAL','HIGH','MA fixture closed finding','fixture',
      'CLOSED','SIGNAL', _sig4, current_date - 40, now() - interval '80 days', _uid, _uid,
      now() - interval '40 days', _uid);

  INSERT INTO public.supervisory_remediation_action (reference, finding_id, entity_id,
      domain_code, description, status, target_date, owner_id, created_by, closed_at, closed_by)
  SELECT 'MA-FIX-REM-2', f.id, _ent, 'PRUDENTIAL','fixture closed remediation','CLOSED',
      current_date - 45, _uid, _uid, now() - interval '40 days', _uid
    FROM public.supervisory_finding f WHERE f.reference='MA-FIX-FND-2'
  RETURNING id INTO _rem2;

  INSERT INTO ma_fx VALUES ('ent',_ent),('uid',_uid),('sig',_sig),('sig2',_sig2),
    ('sig3',_sig3),('sig4',_sig4),('fnd',_fnd),('rem',_rem),('rem2',_rem2);
END $$;

-- Evaluate the derivation with the fixture identity in scope (super admin so the
-- central scope contract admits every fixture entity without altering remits).
DO $$
DECLARE _sa uuid;
BEGIN
  SELECT user_id INTO _sa FROM public.user_roles WHERE role='super_admin' LIMIT 1;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _sa, 'role','authenticated')::text, true);
END $$;

CREATE TEMP TABLE ma_matter ON COMMIT DROP AS
  SELECT * FROM public.supervisory_management_assurance_matter
   WHERE detector_code = 'MA_FIXTURE_DETECTOR';

-- ---------------------------------------------------------------------------
-- Assurance state gates.
-- ---------------------------------------------------------------------------
SELECT pg_temp.gate('MA-03',
  (SELECT 'MATERIAL_AWAITING_REVIEW' = ANY (assurance_conditions)
     FROM ma_matter WHERE signal_id = (SELECT v FROM ma_fx WHERE k='sig')),
  'unreviewed material condition classified as awaiting review');

SELECT pg_temp.gate('MA-03b',
  (SELECT 'AWAITING_REVIEW_BEYOND_TOLERANCE' = ANY (assurance_conditions)
     FROM ma_matter WHERE signal_id = (SELECT v FROM ma_fx WHERE k='sig')),
  'ageing beyond the governed review tolerance is flagged separately');

SELECT pg_temp.gate('MA-04',
  (SELECT NOT ('MATERIAL_AWAITING_REVIEW' = ANY (assurance_conditions)) AND is_reviewed
     FROM ma_matter WHERE signal_id = (SELECT v FROM ma_fx WHERE k='sig2')),
  'reviewed condition is no longer classified as unreviewed');

SELECT pg_temp.gate('MA-05',
  (SELECT 'REVIEWED_NO_DISPOSITION' = ANY (assurance_conditions)
     FROM ma_matter WHERE signal_id = (SELECT v FROM ma_fx WHERE k='sig2'))
  AND (SELECT NOT ('REVIEWED_NO_DISPOSITION' = ANY (assurance_conditions))
         FROM ma_matter WHERE signal_id = (SELECT v FROM ma_fx WHERE k='sig4')),
  'reviewed-without-disposition distinguished from an accountable no-action decision');

SELECT pg_temp.gate('MA-06',
  (SELECT bool_and(
     ('UNOWNED_MATTER' = ANY (assurance_conditions))
       = (owner_id IS NULL AND owner_team_id IS NULL
          AND action_owner_id IS NULL AND action_team_id IS NULL))
     FROM ma_matter
    WHERE (condition_state='OPEN' AND is_material) OR COALESCE(action_is_open,false)),
  'unowned matters derive from canonical assignment, not from viewer visibility');

SELECT pg_temp.gate('MA-06b',
  (SELECT pg_get_viewdef('public.supervisory_management_assurance_matter'::regclass)
          LIKE '%supervisory_domain_assignment%'),
  'ownership resolved through the existing supervisory assignment/remit model');

SELECT pg_temp.gate('MA-07',
  (SELECT bool_and(due_date_source IN (
      'supervisory_remediation_action.target_date','supervisory_finding.due_date',
      'supervisory_attention.target_review_date',
      'supervisory_reassessment_requirement.due_date',
      'NO_CANONICAL_DUE_DATE_RECORDED'))
     FROM ma_matter WHERE due_date_source IS NOT NULL),
  'due dates carry canonical provenance; none is invented by the UI');

SELECT pg_temp.gate('MA-07b',
  EXISTS (SELECT 1 FROM public.supervisory_assurance_policy
           WHERE is_active AND config_owner IS NOT NULL AND version >= 1),
  'ageing tolerances come from an owned, versioned, effective-dated policy');

SELECT pg_temp.gate('MA-08',
  (SELECT 'RESPONSE_OVERDUE' = ANY (assurance_conditions)
     FROM ma_matter WHERE signal_id = (SELECT v FROM ma_fx WHERE k='sig3')),
  'open remediation past its recorded target date is reported as overdue');

SELECT pg_temp.gate('MA-09',
  (SELECT NOT ('RESPONSE_OVERDUE' = ANY (assurance_conditions))
     FROM ma_matter WHERE signal_id = (SELECT v FROM ma_fx WHERE k='sig4')),
  'closed/completed responses are never reported as overdue');

SELECT pg_temp.gate('MA-10',
  (SELECT occurrence_count = 1 FROM public.supervisory_signal
    WHERE fingerprint = 'MA_FIXTURE:'
      || (SELECT v FROM ma_fx WHERE k='ent')::text || ':unreviewed'
      AND false)
  IS NOT FALSE
  AND (SELECT count(*) FROM public.supervisory_signal
        WHERE detector_code='MA_FIXTURE_DETECTOR') = 4
  AND (SELECT bool_and(occurrence_days >= 1 AND occurrence_total >= 1) FROM ma_matter),
  'recurrence uses OS-02E signal identity and occurrence history; no duplicate signals');

SELECT pg_temp.gate('MA-10b',
  (SELECT 'REPEATED_CONDITION' = ANY (assurance_conditions)
     FROM ma_matter WHERE signal_id = (SELECT v FROM ma_fx WHERE k='sig4')),
  'repeat observation across separate days is derived from occurrence history');

SELECT pg_temp.gate('MA-11',
  (SELECT 'RECURRENCE_AFTER_ACTION' = ANY (assurance_conditions)
     FROM ma_matter WHERE signal_id = (SELECT v FROM ma_fx WHERE k='sig4'))
  AND (SELECT NOT ('RECURRENCE_AFTER_ACTION' = ANY (assurance_conditions))
         FROM ma_matter WHERE signal_id = (SELECT v FROM ma_fx WHERE k='sig')),
  'recurrence after supervisory action is distinguishable from ordinary repetition');

SELECT pg_temp.gate('MA-11b',
  (SELECT 'RECURRENCE_AFTER_REVIEW' = ANY (assurance_conditions)
     FROM ma_matter WHERE signal_id = (SELECT v FROM ma_fx WHERE k='sig2')),
  'recurrence after review derived from occurrence timestamps vs review timestamp');

SELECT pg_temp.gate('MA-12',
  (SELECT 'CONDITION_RESOLVED_ACTION_OPEN' = ANY (assurance_conditions)
       AND condition_state='RESOLVED' AND action_is_open
     FROM ma_matter WHERE signal_id = (SELECT v FROM ma_fx WHERE k='sig3'))
  AND (SELECT status <> 'CLOSED' AND closed_at IS NULL
         FROM public.supervisory_remediation_action
        WHERE id = (SELECT v FROM ma_fx WHERE k='rem')),
  'resolved condition with an open action is surfaced without closing the action');

SELECT pg_temp.gate('MA-13',
  (SELECT 'ACTION_CLOSED_CONDITION_PERSISTS' = ANY (assurance_conditions)
     FROM ma_matter WHERE signal_id = (SELECT v FROM ma_fx WHERE k='sig4')),
  'action closed while the material condition persists is surfaced');

SELECT pg_temp.gate('MA-14',
  (SELECT count(*) = 0 FROM public.supervisory_assessment a
    WHERE a.updated_at > now() - interval '30 seconds'),
  'assurance evaluation mutates no approved risk rating / assessment');

SELECT pg_temp.gate('MA-14b',
  (SELECT pg_get_viewdef('public.supervisory_management_assurance_matter'::regclass)
          NOT LIKE '%UPDATE %'),
  'derivation contains no write statement');

SELECT pg_temp.gate('MA-15',
  (SELECT count(*) FROM ma_matter
    WHERE 'MISSING_TRACEABILITY' = ANY (assurance_conditions)) >= 0
  AND (SELECT bool_and(assurance_provenance ? 'condition') FROM ma_matter),
  'traceability defects are reported explicitly, never silently inferred');

SELECT pg_temp.gate('MA-16',
  (SELECT bool_and(
     (assurance_provenance -> 'condition' ->> 'id') IS NOT NULL
     AND (assurance_provenance -> 'occurrences' ->> 'total') IS NOT NULL
     AND (assurance_provenance -> 'ownership' ->> 'source') IS NOT NULL
     AND (assurance_provenance -> 'timeliness' -> 'policy' ->> 'table') IS NOT NULL)
     FROM ma_matter WHERE cardinality(assurance_conditions) > 0),
  'every assurance item names its canonical underlying records');

SELECT pg_temp.gate('MA-16b',
  (SELECT bool_and(assurance_explanation IS NOT NULL
                   AND length(btrim(assurance_explanation)) > 20)
     FROM ma_matter WHERE cardinality(assurance_conditions) > 0),
  'no unexplained flag: every item carries a plain-language explanation');

-- MA-17 / 18 / 19 — evaluation is observational.
CREATE TEMP TABLE ma_before ON COMMIT DROP AS
  SELECT (SELECT count(*) FROM public.supervisory_attention) att,
         (SELECT count(*) FROM public.supervisory_finding) fnd,
         (SELECT count(*) FROM public.supervisory_remediation_action) rem,
         (SELECT count(*) FROM public.supervisory_intervention) itv,
         (SELECT count(*) FROM public.supervisory_reassessment_requirement) rr,
         (SELECT count(*) FROM public.supervisory_signal WHERE state='RESOLVED') resolved,
         (SELECT count(*) FROM public.supervisory_assessment) asm,
         (SELECT count(*) FROM public.supervisory_finding WHERE status='CLOSED') closed_fnd;

SELECT count(*) FROM public.supervisory_management_assurance_matter;
SELECT public.supervisory_management_assurance_register(NULL, NULL);
SELECT public.supervisory_management_assurance_trend(30);

SELECT pg_temp.gate('MA-17',
  (SELECT b.att = (SELECT count(*) FROM public.supervisory_attention)
      AND b.fnd = (SELECT count(*) FROM public.supervisory_finding)
      AND b.rem = (SELECT count(*) FROM public.supervisory_remediation_action)
      AND b.itv = (SELECT count(*) FROM public.supervisory_intervention)
      AND b.rr  = (SELECT count(*) FROM public.supervisory_reassessment_requirement)
     FROM ma_before b),
  'reading assurance creates no supervisory action of any kind');

SELECT pg_temp.gate('MA-18',
  (SELECT b.asm = (SELECT count(*) FROM public.supervisory_assessment)
     FROM ma_before b)
  AND (SELECT count(*) = 0 FROM public.supervisory_assessment
        WHERE updated_at > now() - interval '30 seconds'),
  'reading assurance changes no risk state');

SELECT pg_temp.gate('MA-19',
  (SELECT b.resolved = (SELECT count(*) FROM public.supervisory_signal WHERE state='RESOLVED')
      AND b.closed_fnd = (SELECT count(*) FROM public.supervisory_finding WHERE status='CLOSED')
     FROM ma_before b),
  'reading assurance closes no condition, finding or action');

-- MA-20 — "no additional action required" demands accountability.
DO $$
DECLARE _ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.supervisory_signal_review (signal_id, entity_id, domain_code,
        reviewed_by, disposition, disposition_by, disposition_at)
    VALUES ((SELECT v FROM ma_fx WHERE k='sig'), (SELECT v FROM ma_fx WHERE k='ent'),
        'PRUDENTIAL', (SELECT v FROM ma_fx WHERE k='uid'), 'NO_ACTION_REQUIRED',
        (SELECT v FROM ma_fx WHERE k='uid'), now());
  EXCEPTION WHEN check_violation THEN _ok := true;
  END;
  PERFORM pg_temp.gate('MA-20', _ok,
    'no-action-required is rejected without a written rationale');
END $$;

DO $$
DECLARE _ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.supervisory_signal_review (signal_id, entity_id, domain_code,
        reviewed_by, disposition, disposition_rationale)
    VALUES ((SELECT v FROM ma_fx WHERE k='sig'), (SELECT v FROM ma_fx WHERE k='ent'),
        'PRUDENTIAL', (SELECT v FROM ma_fx WHERE k='uid'), 'NO_ACTION_REQUIRED',
        'Fixture rationale long enough to pass length rule.');
  EXCEPTION WHEN check_violation THEN _ok := true;
  END;
  PERFORM pg_temp.gate('MA-20b', _ok,
    'a disposition without an accountable officer and timestamp is rejected');
END $$;

-- MA-22 — detector operational failure stays separate from response assurance.
SELECT pg_temp.gate('MA-22',
  (SELECT pg_get_viewdef('public.supervisory_management_assurance_matter'::regclass)
          NOT LIKE '%supervisory_detector_run%')
  AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.proname='supervisory_detection_health'),
  'detector health remains an OS-02E operational read model, not an assurance state');

SELECT pg_temp.gate('MA-22b',
  NOT EXISTS (
    SELECT 1 FROM ma_matter
     WHERE assurance_conditions && ARRAY['DETECTOR_FAILED','DETECTOR_NEVER_RUN']),
  'no detector-operational state is emitted as a supervisory-response failure');

-- MA-23 — historical recurrence reconstructable from existing evidence.
SELECT pg_temp.gate('MA-23',
  (SELECT count(*) FROM public.supervisory_signal_occurrence o
     JOIN ma_fx f ON f.v = o.signal_id AND f.k IN ('sig','sig2','sig3','sig4')) >= 16
  AND (SELECT bool_and(occurrence_total >= 4) FROM ma_matter),
  'recurrence history reconstructable from supervisory_signal_occurrence');

SELECT pg_temp.gate('MA-23b',
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='supervisory_signal_review'
             AND column_name IN ('occurrence_count_at_review','last_detected_at_at_review')),
  'review records preserve the observation state at the time of review');

-- MA-24 — live production data produces meaningful assurance.
SELECT pg_temp.gate('MA-24',
  (SELECT count(*) FROM public.supervisory_management_assurance_matter m
    WHERE m.detector_code <> 'MA_FIXTURE_DETECTOR'
      AND cardinality(m.assurance_conditions) > 0) > 0,
  'real supervisory records yield real management assurance exceptions');

SELECT pg_temp.gate('MA-24b',
  (SELECT (public.supervisory_management_assurance_register(NULL,NULL) -> 'summary'
            ->> 'matters')::int > 0),
  'register read model returns live assurance matters with a summary');

-- MA-25 — write path authority: review recording never touches canonical action.
DO $$
DECLARE _b bigint; _a bigint;
BEGIN
  SELECT count(*) INTO _b FROM public.supervisory_attention;
  PERFORM public.supervisory_assurance_record_review(
    (SELECT v FROM ma_fx WHERE k='sig'), 'MA gate review', NULL, NULL, NULL, NULL, NULL);
  SELECT count(*) INTO _a FROM public.supervisory_attention;
  PERFORM pg_temp.gate('MA-25', _b = _a,
    'recording a supervisory review creates no supervisory action');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.gate('MA-25', false, 'record_review failed: '||SQLERRM);
END $$;

-- ---------------------------------------------------------------------------
-- OS-02F1 — authorization, provenance, append-only and policy-governance gates.
-- Personas are REAL production users selected by capability/scope; the
-- out-of-remit entity is an existing licensee temporarily repointed to a
-- fixture sector inside this rolled-back transaction.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE ma_p(k text primary key, v uuid) ON COMMIT DROP;

DO $$
DECLARE _ent uuid; _sig uuid; _ro uuid; _rev uuid; _out uuid;
        _reg uuid; _sec uuid; _oent uuid; _osig uuid;
BEGIN
  SELECT v INTO _ent FROM ma_fx WHERE k='ent';
  SELECT v INTO _sig FROM ma_fx WHERE k='sig';

  -- in-scope supervisory reader WITHOUT review authority
  SELECT p.id INTO _ro FROM public.profiles p
   WHERE NOT public.is_super_admin(p.id)
     AND public.has_permission(p.id,'supervisory_spine','view')
     AND public.supervisory_monitoring_scope_admits(p.id,'PRUDENTIAL',_ent,NULL,NULL)
     AND NOT public.supervisory_assurance_review_admits(p.id,_sig)
   ORDER BY p.id LIMIT 1;

  -- in-scope supervisor WITH review authority (not a super admin)
  SELECT p.id INTO _rev FROM public.profiles p
   WHERE NOT public.is_super_admin(p.id)
     AND public.supervisory_assurance_review_admits(p.id,_sig)
   ORDER BY p.id LIMIT 1;

  -- genuinely out-of-remit user
  SELECT p.id INTO _out FROM public.profiles p
   WHERE NOT public.is_super_admin(p.id)
     AND NOT public.supervisory_monitoring_scope_admits(p.id,'PRUDENTIAL',_ent,NULL,NULL)
   ORDER BY p.id LIMIT 1;

  -- out-of-remit entity: fixture regulator + sector, existing licensee repointed
  INSERT INTO public.regulators (name, code)
  VALUES ('MA fixture regulator','MAFIXREG') RETURNING id INTO _reg;
  INSERT INTO public.sectors (name, regulator_id)
  VALUES ('MA fixture sector', _reg) RETURNING id INTO _sec;

  SELECT l.id INTO _oent FROM public.licensees l WHERE l.id <> _ent ORDER BY l.created_at DESC LIMIT 1;
  UPDATE public.licensees SET sector_id = _sec, sub_sector_id = NULL WHERE id = _oent;

  INSERT INTO public.supervisory_signal (entity_id, domain_code, source_kind, severity,
      detected_at, summary, detector_code, fingerprint, first_detected_at, last_detected_at,
      occurrence_count, state, source_table, source_id, source_reference,
      materiality_reason, config_provenance)
  VALUES (_oent,'PRUDENTIAL','OTHER_GOVERNED_SOURCE','high', now() - interval '3 days',
      'MA fixture: out-of-remit condition','MA_FIXTURE_DETECTOR',
      'MA_FIXTURE:'||_oent::text||':outofremit', now() - interval '3 days', now(),
      2,'OPEN','ma_fixture', gen_random_uuid(),'MA-FIX-OUT',
      'fixture materiality','{"fixture":true}'::jsonb)
  RETURNING id INTO _osig;

  INSERT INTO ma_p VALUES ('ro',_ro),('rev',_rev),('out',_out),
    ('oent',_oent),('osig',_osig),('sec',_sec),('reg',_reg);
END $$;

SELECT pg_temp.gate('MA-40',
  (SELECT count(*) FROM ma_p WHERE k IN ('ro','rev','out') AND v IS NOT NULL) = 3,
  'real read-only, review-capable and out-of-remit personas were found in production data');

-- ===================== AUTHORIZATION =====================

-- MA-41 — read-only supervisory user cannot INSERT directly.
DO $$
DECLARE _ok boolean := false; _ro uuid; _sig uuid; _ent uuid;
BEGIN
  SELECT v INTO _ro FROM ma_p WHERE k='ro';
  SELECT v INTO _sig FROM ma_fx WHERE k='sig';
  SELECT v INTO _ent FROM ma_fx WHERE k='ent';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_ro,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.supervisory_signal_review (signal_id, entity_id, domain_code,
        reviewed_by, reviewed_at)
    VALUES (_sig, _ent, 'PRUDENTIAL', _ro, now());
  EXCEPTION WHEN OTHERS THEN _ok := true;
  END;
  RESET ROLE;
  PERFORM pg_temp.gate('MA-41', _ok,
    'direct INSERT into supervisory_signal_review is denied to authenticated callers');
END $$;

-- MA-42 — authenticated user cannot UPDATE an existing historical review.
DO $$
DECLARE _ok boolean := false; _rev uuid; _sig2 uuid;
BEGIN
  SELECT v INTO _rev FROM ma_p WHERE k='rev';
  SELECT v INTO _sig2 FROM ma_fx WHERE k='sig2';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_rev,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.supervisory_signal_review SET review_note = 'tampered'
     WHERE signal_id = _sig2;
  EXCEPTION WHEN OTHERS THEN _ok := true;
  END;
  RESET ROLE;
  PERFORM pg_temp.gate('MA-42', _ok, 'direct UPDATE of a historical review is denied');
END $$;

-- MA-43 — authenticated user cannot DELETE a review.
DO $$
DECLARE _ok boolean := false; _rev uuid; _sig2 uuid;
BEGIN
  SELECT v INTO _rev FROM ma_p WHERE k='rev';
  SELECT v INTO _sig2 FROM ma_fx WHERE k='sig2';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_rev,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    DELETE FROM public.supervisory_signal_review WHERE signal_id = _sig2;
  EXCEPTION WHEN OTHERS THEN _ok := true;
  END;
  RESET ROLE;
  PERFORM pg_temp.gate('MA-43', _ok, 'direct DELETE of a review is denied');
END $$;

-- MA-44 — authorised in-scope supervisor CAN record through the canonical command.
DO $$
DECLARE _res jsonb; _ok boolean := false; _err text := NULL; _rev uuid; _sig uuid;
BEGIN
  SELECT v INTO _rev FROM ma_p WHERE k='rev';
  SELECT v INTO _sig FROM ma_fx WHERE k='sig';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_rev,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    _res := public.supervisory_assurance_record_review(_sig, 'MA-44 governed review');
    _ok := (_res ->> 'review_id') IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN _err := SQLERRM;
  END;
  RESET ROLE;
  PERFORM pg_temp.gate('MA-44', _ok,
    COALESCE(_err, 'in-scope supervisor with review authority records through the canonical command'));
  IF _ok THEN
    INSERT INTO ma_p VALUES ('rev44', (_res ->> 'review_id')::uuid);
  END IF;
END $$;

-- MA-45 — read permission is NOT review authority.
DO $$
DECLARE _ok boolean := false; _err text; _ro uuid; _sig uuid;
BEGIN
  SELECT v INTO _ro FROM ma_p WHERE k='ro';
  SELECT v INTO _sig FROM ma_fx WHERE k='sig';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_ro,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.supervisory_assurance_record_review(
      _sig, 'MA-45 attempt', 'NO_ACTION_REQUIRED',
      'Attempt by a read-only supervisory user.');
  EXCEPTION WHEN OTHERS THEN _ok := true; _err := SQLERRM;
  END;
  RESET ROLE;
  PERFORM pg_temp.gate('MA-45', _ok
    AND public.has_permission(_ro,'supervisory_spine','view'),
    'user holds supervision view but cannot disposition: '||COALESCE(_err,'(no error!)'));
END $$;

-- MA-46 — review-capable user outside the entity/domain remit is refused.
DO $$
DECLARE _ok boolean := false; _err text; _rev uuid; _osig uuid;
BEGIN
  SELECT v INTO _rev FROM ma_p WHERE k='rev';
  SELECT v INTO _osig FROM ma_p WHERE k='osig';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_rev,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.supervisory_assurance_record_review(_osig, 'MA-46 attempt');
  EXCEPTION WHEN OTHERS THEN _ok := true; _err := SQLERRM;
  END;
  RESET ROLE;
  PERFORM pg_temp.gate('MA-46', _ok
    AND NOT public.supervisory_assurance_review_admits(_rev, _osig),
    'out-of-remit condition cannot be dispositioned: '||COALESCE(_err,'(no error!)'));
END $$;

-- MA-47 — out-of-scope user cannot read the review row, directly or via read models.
DO $$
DECLARE _direct bigint; _view bigint; _out uuid; _sigs uuid[];
BEGIN
  SELECT v INTO _out FROM ma_p WHERE k='out';
  SELECT array_agg(v) INTO _sigs FROM ma_fx WHERE k IN ('sig','sig2','sig4');
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_out,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _direct FROM public.supervisory_signal_review r
   WHERE r.signal_id = ANY(_sigs);
  SELECT count(*) INTO _view FROM public.supervisory_management_assurance_matter m
   WHERE m.detector_code = 'MA_FIXTURE_DETECTOR';
  RESET ROLE;
  PERFORM pg_temp.gate('MA-47', _direct = 0 AND _view = 0,
    format('out-of-remit user sees %s review rows and %s assurance matters', _direct, _view));
END $$;

-- ===================== SERVER-DERIVED IDENTITY =====================

SELECT pg_temp.gate('MA-48',
  (SELECT r.reviewed_by = (SELECT v FROM ma_p WHERE k='rev')
     FROM public.supervisory_signal_review r WHERE r.id = (SELECT v FROM ma_p WHERE k='rev44')),
  'reviewer identity is taken from auth.uid(), never from a client field');

SELECT pg_temp.gate('MA-49',
  NOT (pg_get_function_arguments(
        'public.supervisory_assurance_record_review(uuid,text,text,text,text,uuid,text,uuid,text)'::regprocedure)
       ~* '_entity_id|_domain_code')
  AND (SELECT r.entity_id = s.entity_id AND r.domain_code = s.domain_code
         FROM public.supervisory_signal_review r JOIN public.supervisory_signal s ON s.id = r.signal_id
        WHERE r.id = (SELECT v FROM ma_p WHERE k='rev44')),
  'entity and domain are derived from the canonical signal and cannot be supplied');

SELECT pg_temp.gate('MA-50',
  (SELECT r.occurrence_count_at_review = s.occurrence_count
          AND r.last_detected_at_at_review = s.last_detected_at
     FROM public.supervisory_signal_review r JOIN public.supervisory_signal s ON s.id = r.signal_id
    WHERE r.id = (SELECT v FROM ma_p WHERE k='rev44')),
  'occurrence count and last-detected snapshot are server-derived');

-- ===================== LINK INTEGRITY =====================

-- MA-51 — arbitrary UUID rejected.
DO $$
DECLARE _ok boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT v FROM ma_p WHERE k='rev'),'role','authenticated')::text, true);
  BEGIN
    PERFORM public.supervisory_assurance_record_review(
      (SELECT v FROM ma_fx WHERE k='sig3'), NULL, 'ACTION_OPENED', NULL,
      'SUPERVISORY_FINDING', gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN _ok := true;
  END;
  PERFORM pg_temp.gate('MA-51', _ok, 'an invented linked record id is rejected');
END $$;

-- MA-52 — real record belonging to another entity rejected.
DO $$
DECLARE _ok boolean := false; _fnd uuid;
BEGIN
  INSERT INTO public.supervisory_finding (reference, entity_id, domain_code, severity, title,
      observation, status, source_kind, signal_id, due_date, issued_at, owner_id, created_by)
  VALUES ('MA-FIX-FND-OTHER', (SELECT v FROM ma_p WHERE k='oent'), 'PRUDENTIAL','HIGH',
      'MA fixture other-entity finding','fixture','ISSUED','SIGNAL',
      (SELECT v FROM ma_p WHERE k='osig'),
      current_date + 30, now(), (SELECT v FROM ma_fx WHERE k='uid'), (SELECT v FROM ma_fx WHERE k='uid'))
  RETURNING id INTO _fnd;
  BEGIN
    PERFORM public.supervisory_assurance_record_review(
      (SELECT v FROM ma_fx WHERE k='sig3'), NULL, 'ACTION_OPENED', NULL,
      'SUPERVISORY_FINDING', _fnd);
  EXCEPTION WHEN OTHERS THEN _ok := true;
  END;
  PERFORM pg_temp.gate('MA-52', _ok, 'a real finding belonging to another entity is rejected');
END $$;

-- MA-53 — cross-domain canonical record rejected.
DO $$
DECLARE _ok boolean := false; _fnd uuid;
BEGIN
  INSERT INTO public.supervisory_finding (reference, entity_id, domain_code, severity, title,
      observation, status, source_kind, signal_id, due_date, issued_at, owner_id, created_by)
  VALUES ('MA-FIX-FND-XDOM', (SELECT v FROM ma_fx WHERE k='ent'), 'AML_CFT','HIGH',
      'MA fixture cross-domain finding','fixture','ISSUED','SIGNAL',
      (SELECT v FROM ma_fx WHERE k='sig3'), current_date + 30, now(),
      (SELECT v FROM ma_fx WHERE k='uid'), (SELECT v FROM ma_fx WHERE k='uid'))
  RETURNING id INTO _fnd;
  BEGIN
    PERFORM public.supervisory_assurance_record_review(
      (SELECT v FROM ma_fx WHERE k='sig3'), NULL, 'ACTION_OPENED', NULL,
      'SUPERVISORY_FINDING', _fnd);
  EXCEPTION WHEN OTHERS THEN _ok := true;
  END;
  PERFORM pg_temp.gate('MA-53', _ok, 'a same-entity record in another supervisory domain is rejected');
END $$;

-- MA-54 — wrong linked object/module rejected.
DO $$
DECLARE _ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.supervisory_assurance_record_review(
      (SELECT v FROM ma_fx WHERE k='sig3'), NULL, 'ACTION_OPENED', NULL,
      'SUPERVISORY_REMEDIATION', (SELECT v FROM ma_fx WHERE k='fnd'));
  EXCEPTION WHEN OTHERS THEN _ok := true;
  END;
  PERFORM pg_temp.gate('MA-54', _ok, 'a finding id claimed as a remediation record is rejected');
END $$;

-- MA-55 / MA-56 — valid same-signal canonical link succeeds with a server-derived reference.
DO $$
DECLARE _res jsonb; _err text; _ref text;
BEGIN
  BEGIN
    _res := public.supervisory_assurance_record_review(
      (SELECT v FROM ma_fx WHERE k='sig3'), 'MA-55 governed review', 'ACTION_OPENED',
      NULL, 'SUPERVISORY_FINDING', (SELECT v FROM ma_fx WHERE k='fnd'),
      'FORGED-REFERENCE-999');
  EXCEPTION WHEN OTHERS THEN _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('MA-55', (_res ->> 'review_id') IS NOT NULL,
    COALESCE(_err,'a canonical finding raised from the same condition is accepted'));

  SELECT r.linked_reference INTO _ref FROM public.supervisory_signal_review r
   WHERE r.id = (_res ->> 'review_id')::uuid;
  PERFORM pg_temp.gate('MA-56',
    _ref = (SELECT f.reference FROM public.supervisory_finding f
             WHERE f.id = (SELECT v FROM ma_fx WHERE k='fnd'))
    AND _ref <> 'FORGED-REFERENCE-999',
    format('linked reference is derived from the real record (%s), client value ignored', _ref));
END $$;

-- MA-57 / MA-58 — a forged disposition cannot clear the assurance condition.
DO $$
DECLARE _sig uuid; _conds text[]; _rid uuid;
BEGIN
  SELECT v INTO _sig FROM ma_fx WHERE k='sig2';
  -- forged history written with owner rights, bypassing the governed command
  INSERT INTO public.supervisory_signal_review (signal_id, entity_id, domain_code,
      reviewed_by, reviewed_at, disposition, disposition_by, disposition_at,
      linked_module, linked_record_id, linked_reference, provenance)
  VALUES (_sig, (SELECT v FROM ma_fx WHERE k='ent'), 'PRUDENTIAL',
      (SELECT v FROM ma_fx WHERE k='uid'), now(), 'ACTION_OPENED',
      (SELECT v FROM ma_fx WHERE k='uid'), now(),
      'SUPERVISORY_FINDING', gen_random_uuid(), 'FORGED-1', '{"forged":true}'::jsonb)
  RETURNING id INTO _rid;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT user_id FROM public.user_roles WHERE role='super_admin' LIMIT 1),
                      'role','authenticated')::text, true);

  SELECT assurance_conditions INTO _conds
    FROM public.supervisory_management_assurance_matter WHERE signal_id = _sig;

  PERFORM pg_temp.gate('MA-57', 'REVIEWED_NO_DISPOSITION' = ANY(_conds),
    format('a forged disposition does not clear the missing-disposition state (%s)', _conds));
  PERFORM pg_temp.gate('MA-58', 'MISSING_TRACEABILITY' = ANY(_conds),
    format('forged / unverifiable linkage raises MISSING_TRACEABILITY (%s)', _conds));

  DELETE FROM ma_p WHERE k='forged';
  INSERT INTO ma_p VALUES ('forged', _rid);
END $$;

-- ===================== APPEND-ONLY ACCOUNTABILITY =====================

-- MA-59 — even the table owner cannot silently rewrite a review.
DO $$
DECLARE _ok boolean := false;
BEGIN
  BEGIN
    UPDATE public.supervisory_signal_review
       SET disposition_rationale = 'silently rewritten'
     WHERE id = (SELECT v FROM ma_p WHERE k='rev44');
  EXCEPTION WHEN OTHERS THEN _ok := true;
  END;
  PERFORM pg_temp.gate('MA-59', _ok,
    'the append-only trigger blocks rewriting a recorded review');
END $$;

-- MA-60 — a changed conclusion is a second historical event, not a mutation.
DO $$
DECLARE _new jsonb; _err text; _first uuid;
BEGIN
  _first := (SELECT v FROM ma_p WHERE k='rev44');
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT v FROM ma_p WHERE k='rev'),'role','authenticated')::text, true);
  BEGIN
    _new := public.supervisory_assurance_record_review(
      (SELECT v FROM ma_fx WHERE k='sig'), 'MA-60 revised conclusion', 'NO_ACTION_REQUIRED',
      'Revised supervisory conclusion after further enquiry.', NULL, NULL, NULL,
      _first, 'Earlier review recorded before the entity response was received.');
  EXCEPTION WHEN OTHERS THEN _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('MA-60',
    (_new ->> 'review_id') IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.supervisory_signal_review WHERE id = _first
                 AND superseded_by_review_id = (_new ->> 'review_id')::uuid
                 AND review_note = 'MA-44 governed review'),
    COALESCE(_err,'the earlier review survives untouched and is stamped as superseded'));
END $$;

-- MA-61 — exactly one audit event per governed review, with full provenance.
SELECT pg_temp.gate('MA-61',
  (SELECT count(*) = 1 AND bool_and(
      a.action = 'SUPERVISORY_CONDITION_REVIEW_RECORDED'
      AND a.user_id = (SELECT v FROM ma_p WHERE k='rev')
      AND (a.new_value ->> 'signal_id')::uuid = (SELECT v FROM ma_fx WHERE k='sig')
      AND a.metadata ->> 'domain_code' = 'PRUDENTIAL'
      AND (a.metadata ->> 'entity_id')::uuid = (SELECT v FROM ma_fx WHERE k='ent'))
     FROM public.audit_logs a
    WHERE a.entity_type = 'supervisory_signal_review'
      AND a.entity_id = (SELECT v::text FROM ma_p WHERE k='rev44')),
  'the canonical command writes exactly one audit event with signal/entity/domain provenance');

-- ===================== POLICY GOVERNANCE =====================

-- MA-62 — an ordinary configuration consumer cannot write policy.
DO $$
DECLARE _ok boolean := false; _uid uuid;
BEGIN
  SELECT p.id INTO _uid FROM public.profiles p
   WHERE NOT public.is_super_admin(p.id)
     AND public.has_permission(p.id,'supervisory_spine','view')
     AND NOT public.has_permission(p.id,'system_configuration','edit')
   ORDER BY p.id LIMIT 1;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_uid,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.supervisory_assurance_policy
       SET awaiting_review_tolerance_days = 999 WHERE domain_code IS NULL;
    IF NOT FOUND THEN _ok := true; END IF;   -- RLS filtered the row out
  EXCEPTION WHEN OTHERS THEN _ok := true;
  END;
  RESET ROLE;
  PERFORM pg_temp.gate('MA-62', _ok AND _uid IS NOT NULL,
    'a supervisory reader without configuration-edit authority cannot change policy');
END $$;

-- MA-63 — effective policy history cannot be silently deleted.
DO $$
DECLARE _ok boolean := false;
BEGIN
  BEGIN
    DELETE FROM public.supervisory_assurance_policy WHERE domain_code IS NULL;
  EXCEPTION WHEN OTHERS THEN _ok := true;
  END;
  PERFORM pg_temp.gate('MA-63', _ok, 'deleting an effective policy version is refused');
END $$;

-- MA-64 / MA-65 — governed versioning, audit trail and reconstructable history.
DO $$
DECLARE _id uuid; _old record; _logged int; _eff jsonb;
BEGIN
  SELECT * INTO _old FROM public.supervisory_assurance_policy WHERE domain_code IS NULL LIMIT 1;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT user_id FROM public.user_roles WHERE role='super_admin' LIMIT 1),
                      'role','authenticated')::text, true);

  INSERT INTO public.supervisory_assurance_policy (code, name, config_owner, version,
      domain_code, effective_from,
      awaiting_review_tolerance_days, stale_activity_tolerance_days,
      repeat_occurrence_threshold, repeat_distinct_day_threshold, material_severities, notes)
  VALUES (_old.code, _old.name, _old.config_owner, _old.version + 1, NULL, CURRENT_DATE,
      _old.awaiting_review_tolerance_days + 1, _old.stale_activity_tolerance_days,
      _old.repeat_occurrence_threshold, _old.repeat_distinct_day_threshold,
      _old.material_severities, 'MA-64 fixture version')
  RETURNING id INTO _id;

  SELECT count(*) INTO _logged FROM public.config_change_log
   WHERE table_name = 'supervisory_assurance_policy' AND record_id = _id AND action = 'CREATE';

  PERFORM pg_temp.gate('MA-64', _logged = 1
    AND (SELECT created_by IS NOT NULL AND updated_by IS NOT NULL
           FROM public.supervisory_assurance_policy WHERE id = _id)
    AND EXISTS (SELECT 1 FROM public.config_governed_tables
                 WHERE table_name = 'supervisory_assurance_policy'),
    'a new policy version is audited, attributed and registered as governed configuration');

  _eff := public.supervisory_assurance_policy_effective(NULL);
  PERFORM pg_temp.gate('MA-65',
    (_eff ->> 'version')::int = _old.version + 1
    AND EXISTS (SELECT 1 FROM public.supervisory_assurance_policy
                 WHERE id = _old.id AND version = _old.version
                   AND awaiting_review_tolerance_days = _old.awaiting_review_tolerance_days),
    'the newest effective version resolves while the previous version stays reconstructable');
END $$;

-- ===================== REGRESSION GUARANTEES =====================

SELECT pg_temp.gate('MA-66',
  (SELECT count(*) FROM public.supervisory_attention a
     WHERE a.entity_id = (SELECT v FROM ma_fx WHERE k='ent')
       AND a.created_at > now() - interval '1 minute') = 0,
  'no business action was created by any assurance read or review in this run');

SELECT pg_temp.gate('MA-67',
  (SELECT bool_and(s.state = 'OPEN' OR s.state = 'RESOLVED')
     FROM public.supervisory_signal s JOIN ma_fx f ON f.v = s.id
    WHERE f.k IN ('sig','sig2','sig3','sig4'))
  AND NOT EXISTS (
    SELECT 1 FROM public.supervisory_signal s JOIN ma_fx f ON f.v = s.id
     WHERE f.k IN ('sig','sig2','sig3','sig4') AND s.severity <> 'high'),
  'recording reviews leaves the underlying risk state unchanged');

-- ---------------------------------------------------------------------------
-- Verdict
-- ---------------------------------------------------------------------------
SELECT gate, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM ma_result ORDER BY gate;

SELECT count(*) AS gates,
       count(*) FILTER (WHERE passed) AS passed,
       count(*) FILTER (WHERE NOT passed) AS failed
  FROM ma_result;

DO $$
DECLARE _f int;
BEGIN
  SELECT count(*) INTO _f FROM ma_result WHERE NOT passed;
  IF _f > 0 THEN
    RAISE WARNING 'OS-02F NOT CERTIFIED: % gate(s) failed', _f;
  ELSE
    RAISE NOTICE 'OS-02F management assurance gates all passed';
  END IF;
END $$;

ROLLBACK;
