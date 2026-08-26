-- MC-01 governed public-intake runtime regression coverage.
BEGIN;
SELECT plan(9);

SELECT has_function(
  'public', 'resolve_complaint_intake_regulator', ARRAY['uuid','uuid'],
  'canonical complaint regulator resolver exists'
);

SELECT is(
  has_function_privilege('anon',
    'public.resolve_complaint_intake_regulator(uuid,uuid)', 'EXECUTE'),
  false,
  'anonymous callers cannot invoke internal regulator resolution'
);

SELECT is(
  has_function_privilege('authenticated',
    'public.public_complaint_intake_submit(jsonb,uuid[],text)', 'EXECUTE'),
  false,
  'authenticated callers cannot bypass governed public intake'
);

SELECT is(
  has_function_privilege('service_role',
    'public.public_complaint_intake_submit(jsonb,uuid[],text)', 'EXECUTE'),
  true,
  'backend service can invoke canonical public intake'
);

DO $fixtures$
DECLARE
  v_regulator uuid := gen_random_uuid();
  v_sector uuid := gen_random_uuid();
  v_licensee uuid := gen_random_uuid();
  v_stale_staff uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  INSERT INTO public.regulators (id, name, code, status)
  VALUES (v_regulator, 'MC01 Runtime Regulator', 'MC01-' || left(v_regulator::text, 8), 'active');

  INSERT INTO public.sectors (id, name, regulator_id)
  VALUES (v_sector, 'MC01 Runtime Sector', v_regulator);

  INSERT INTO auth.users (id, email)
  VALUES (v_stale_staff, 'mc01-stale-supervisor@runtime.test');

  INSERT INTO public.licensees (id, name, sector_id, status, lead_regulator_id)
  VALUES (v_licensee, 'MC01 Runtime Provider', v_sector, 'active', v_stale_staff);

  PERFORM set_config('mc01.regulator', v_regulator::text, false);
  SET LOCAL ROLE service_role;
  v_result := public.public_complaint_intake_submit(
    jsonb_build_object(
      'subject', 'MC-01 runtime certification complaint',
      'description', 'Non-sensitive fixture proving matched provider routing remains valid.',
      'email', 'mc01-runtime@cert.test',
      'anonymous', false,
      'parties', jsonb_build_array(jsonb_build_object(
        'party_role', 'affected_consumer', 'party_type', 'individual',
        'is_primary_contact', true, 'full_name', 'Runtime Consumer',
        'email', 'mc01-runtime@cert.test'
      )),
      'respondents', jsonb_build_array(jsonb_build_object(
        'is_primary', true, 'match_state', 'MATCHED_REGULATED',
        'respondent_role', 'provider', 'licensee_id', v_licensee,
        'legal_name', 'MC01 Runtime Provider'
      )),
      'contact_preference', jsonb_build_object(
        'preferred_method', 'email', 'email', 'mc01-runtime@cert.test'
      ),
      'intake_details', jsonb_build_object(
        'service_description', 'Runtime certification service',
        'declaration_accepted', true,
        'privacy_notice_acknowledged', true,
        'information_sharing_acknowledged', true
      )
    ),
    '{}'::uuid[],
    'mc01-pgtap-runtime-certification'
  );
  RESET ROLE;

  PERFORM set_config('mc01.complaint_id', v_result->>'id', false);
  PERFORM set_config('mc01.access_code', v_result->>'tracking_access_code', false);
END;
$fixtures$;

SELECT is(
  (SELECT regulator_id::text FROM public.complaints
    WHERE id = current_setting('mc01.complaint_id')::uuid),
  current_setting('mc01.regulator'),
  'matched respondent routes through sector authority, not supervisor user id'
);

SELECT matches(
  current_setting('mc01.access_code'), '^[A-F0-9]{12}$',
  'submission returns a 12-character hexadecimal access code'
);

SELECT is(
  (SELECT status FROM public.complaint_jurisdiction_assessments
    WHERE complaint_id = current_setting('mc01.complaint_id')::uuid),
  'PENDING_ASSESSMENT',
  'jurisdiction remains a pending assessment scaffold'
);

SELECT ok(
  (SELECT count(*) = 1 FROM public.workflow_instances
    WHERE entity_type = 'complaint'
      AND entity_id = current_setting('mc01.complaint_id')::uuid),
  'canonical submission initializes one complaint workflow'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
SELECT ok(
  COALESCE((public.get_public_complaint_tracking_v2(
    (SELECT complaint_number FROM public.complaints
      WHERE id = current_setting('mc01.complaint_id')::uuid),
    current_setting('mc01.access_code'), NULL
  )->>'found')::boolean, false),
  'redacted tracking resolves with the one-time access code'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;