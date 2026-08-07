-- Phase 1 / LIC-DEC-001 + LIC-DEC-002 — decision gates and immutable artefacts
--
-- Verifies the gate computation, the merge-field contract, version increments,
-- certificate content persistence (must NOT be decision-letter markup) and
-- immutability of issued artefacts.

BEGIN;
SELECT plan(28);

SELECT has_function('public', 'decision_gate_status', 'decision_gate_status exists');
SELECT has_table('public', 'decision_artifacts', 'decision_artifacts exists');
SELECT has_function('public', 'issue_decision_artifact', 'issue_decision_artifact exists');

-- Client roles cannot write artefacts directly, only through the RPC.
SELECT ok(NOT has_table_privilege('authenticated', 'public.decision_artifacts', 'INSERT'),
          'authenticated cannot insert artefacts directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.decision_artifacts', 'UPDATE'),
          'authenticated cannot update artefacts');
SELECT ok(NOT has_table_privilege('authenticated', 'public.decision_artifacts', 'DELETE'),
          'authenticated cannot delete artefacts');
SELECT ok(NOT has_table_privilege('authenticated', 'public.decision_artifacts', 'TRUNCATE'),
          'authenticated cannot truncate artefacts');
SELECT ok(NOT has_table_privilege('anon', 'public.decision_artifacts', 'SELECT'),
          'anon cannot read artefacts');
SELECT ok(NOT has_function_privilege('anon',
            'public.issue_decision_artifact(uuid,text,text,jsonb,text,uuid,text,text,jsonb,uuid,date,date)', 'EXECUTE'),
          'anon cannot execute issue_decision_artifact');

-- ---------------------------------------------------------------------------
-- Fixtures: a super_admin approver and an application to decide.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _dec_probe(application_id uuid, application_number text);

DO $$
DECLARE
  v_approver uuid := '00000000-0000-0000-0000-0000000d0001';
  v_applicant uuid := '00000000-0000-0000-0000-0000000d0002';
  v_app uuid;
  v_num text;
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (v_approver, 'super_admin')
    ON CONFLICT DO NOTHING;

  INSERT INTO public.applications (applicant_id, license_type, status)
    VALUES (v_applicant, 'Phase1 Test Licence', 'under_review')
    RETURNING id, application_number INTO v_app, v_num;

  INSERT INTO _dec_probe(application_id, application_number) VALUES (v_app, v_num);
END$$;

-- Gate computation returns the documented shape.
SELECT ok(
  (SELECT public.decision_gate_status((SELECT application_id FROM _dec_probe))) ? 'gates',
  'gate status returns a gates array');
SELECT ok(
  (SELECT public.decision_gate_status((SELECT application_id FROM _dec_probe))) ? 'blocking_unmet',
  'gate status returns blocking_unmet');
SELECT ok(
  (SELECT (public.decision_gate_status((SELECT application_id FROM _dec_probe)) -> 'ready')) IS NOT NULL,
  'gate status returns readiness');

-- An open RFI is a blocking gate.
INSERT INTO public.application_rfis (application_id, raised_by, status)
VALUES ((SELECT application_id FROM _dec_probe),
        '00000000-0000-0000-0000-0000000d0001', 'open');

SELECT is(
  (SELECT public.decision_gate_status((SELECT application_id FROM _dec_probe)) ->> 'ready'),
  'false', 'an open RFI blocks decision readiness');

SELECT ok(
  (SELECT jsonb_path_exists(
     public.decision_gate_status((SELECT application_id FROM _dec_probe)) -> 'gates',
     '$[*] ? (@.key == "open_rfis" && @.blocking == true && @.passed == false)')),
  'the open RFI is reported as an unmet blocking gate');

-- Clearing the RFI and recording a clean sufficiency evaluation opens the gate.
UPDATE public.application_rfis SET status = 'closed'
 WHERE application_id = (SELECT application_id FROM _dec_probe);
INSERT INTO public.sufficiency_evaluations (application_id, overall_status, blocker_count)
VALUES ((SELECT application_id FROM _dec_probe), 'pass', 0);

SELECT is(
  (SELECT public.decision_gate_status((SELECT application_id FROM _dec_probe)) ->> 'ready'),
  'true', 'resolving the blockers makes the application decision-ready');

-- ---------------------------------------------------------------------------
-- Issuance behaviour (as the approver).
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000d0001","role":"authenticated"}';

-- Missing merge fields are reported, not silently accepted.
SELECT is(
  (SELECT public.issue_decision_artifact(
     (SELECT application_id FROM _dec_probe), 'decision_letter', '<p>x</p>', '{}'::jsonb) ->> 'code'),
  'MISSING_MERGE_FIELDS', 'missing merge fields are rejected');

-- Certificate without an effective date is rejected.
SELECT ok(
  (SELECT public.issue_decision_artifact(
     (SELECT application_id FROM _dec_probe), 'license_certificate', '<p>cert</p>',
     jsonb_build_object('application_number', (SELECT application_number FROM _dec_probe),
                        'applicant_name', 'Phase1 Applicant',
                        'license_type', 'Phase1 Test Licence')) -> 'missing') @> '["effective_date"]'::jsonb,
  'certificate requires an effective date');

-- Valid letter issuance → v1.
SELECT is(
  (SELECT public.issue_decision_artifact(
     (SELECT application_id FROM _dec_probe), 'decision_letter', '<h1>DECISION LETTER</h1>',
     jsonb_build_object('application_number', (SELECT application_number FROM _dec_probe),
                        'applicant_name', 'Phase1 Applicant',
                        'license_type', 'Phase1 Test Licence'),
     'approved', NULL, NULL, 'Meets all prudential and conduct requirements.') ->> 'version'),
  '1', 'first decision letter is version 1');

-- Re-issue → v2 (versioned, previous version retained).
SELECT is(
  (SELECT public.issue_decision_artifact(
     (SELECT application_id FROM _dec_probe), 'decision_letter', '<h1>DECISION LETTER (revised)</h1>',
     jsonb_build_object('application_number', (SELECT application_number FROM _dec_probe),
                        'applicant_name', 'Phase1 Applicant',
                        'license_type', 'Phase1 Test Licence'),
     'approved', NULL, NULL, 'Revised rationale after supervisory review.') ->> 'version'),
  '2', 'reissued decision letter increments to version 2');

-- Certificate issuance stores CERTIFICATE content, not the letter markup.
SELECT is(
  (SELECT public.issue_decision_artifact(
     (SELECT application_id FROM _dec_probe), 'license_certificate',
     '<h1>LICENCE CERTIFICATE</h1><p>Phase1 Applicant</p>',
     jsonb_build_object('application_number', (SELECT application_number FROM _dec_probe),
                        'applicant_name', 'Phase1 Applicant',
                        'license_type', 'Phase1 Test Licence'),
     'approved', NULL, NULL, NULL, '[]'::jsonb, NULL, current_date, NULL) ->> 'version'),
  '1', 'certificate versions independently of the letter');

SELECT ok(
  (SELECT rendered_html FROM public.decision_artifacts
    WHERE application_id = (SELECT application_id FROM _dec_probe)
      AND artifact_type = 'license_certificate' AND version = 1) LIKE '%LICENCE CERTIFICATE%',
  'stored certificate contains certificate content');

SELECT ok(
  (SELECT rendered_html FROM public.decision_artifacts
    WHERE application_id = (SELECT application_id FROM _dec_probe)
      AND artifact_type = 'license_certificate' AND version = 1) NOT LIKE '%DECISION LETTER%',
  'stored certificate is NOT decision-letter markup');

SELECT ok(
  (SELECT checksum IS NOT NULL FROM public.decision_artifacts
    WHERE application_id = (SELECT application_id FROM _dec_probe)
      AND artifact_type = 'license_certificate' AND version = 1),
  'issued artefact carries a content checksum');


-- ---------------------------------------------------------------------------
-- Immutability: an issued artefact can never be edited or removed. Corrections
-- are made by issuing a new version.
-- ---------------------------------------------------------------------------
SELECT is((SELECT count(*)::int FROM public.decision_artifacts
           WHERE application_id = (SELECT application_id FROM _dec_probe)
             AND artifact_type = 'decision_letter'),
          2, 'v1 of the decision letter is retained alongside v2');

SELECT ok((SELECT rendered_html FROM public.decision_artifacts
           WHERE application_id = (SELECT application_id FROM _dec_probe)
             AND artifact_type = 'decision_letter' AND version = 1)
          NOT LIKE '%revised%',
          'v1 content is untouched by the reissue');

SELECT throws_ok(
  $$UPDATE public.decision_artifacts SET rendered_html = '<p>tampered</p>'
     WHERE application_id = (SELECT application_id FROM _dec_probe)
       AND artifact_type = 'decision_letter' AND version = 1$$,
  NULL, NULL, 'issued artefacts cannot be updated');

SELECT throws_ok(
  $$DELETE FROM public.decision_artifacts
     WHERE application_id = (SELECT application_id FROM _dec_probe)$$,
  NULL, NULL, 'issued artefacts cannot be deleted');

SELECT is((SELECT count(*)::int FROM public.decision_artifacts
           WHERE application_id = (SELECT application_id FROM _dec_probe)),
          3, 'artefact ledger is intact after tamper attempts');

SELECT * FROM finish();
ROLLBACK;
