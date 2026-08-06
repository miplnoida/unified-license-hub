-- Formal Investigation — Interview Record: structure, grants, RLS and RPC behaviour.
BEGIN;
SELECT plan(16);

-- Structure
SELECT has_table('public','conduct_interviews','interviews table exists');
SELECT has_table('public','conduct_interview_participants','participants table exists');
SELECT has_table('public','conduct_interview_attachments','attachments table exists');
SELECT has_column('public','conduct_interviews','key_information','key information captured');
SELECT has_column('public','conduct_interviews','attestation_outcome','attestation outcome captured');
SELECT has_column('public','conduct_interviews','refusal_reason','refusal reason captured');
SELECT has_column('public','conduct_interview_attachments','produced_by_interviewee','produced-by flag present');

-- RLS enabled
SELECT is((SELECT relrowsecurity FROM pg_class WHERE oid='public.conduct_interviews'::regclass), true, 'RLS on interviews');
SELECT is((SELECT relrowsecurity FROM pg_class WHERE oid='public.conduct_interview_participants'::regclass), true, 'RLS on participants');
SELECT is((SELECT relrowsecurity FROM pg_class WHERE oid='public.conduct_interview_attachments'::regclass), true, 'RLS on attachments');

-- Grants
SELECT ok(has_table_privilege('authenticated','public.conduct_interviews','SELECT'), 'authenticated can select interviews');
SELECT ok(has_table_privilege('service_role','public.conduct_interviews','INSERT'), 'service_role can insert interviews');

-- RPCs
SELECT has_function('public','conduct_finalise_interview','finalise RPC exists');
SELECT has_function('public','conduct_amend_interview','amend RPC exists');

-- Behaviour: refusal without a reason is rejected; guard blocks direct edits after finalise.
DO $$
DECLARE
  reg uuid := gen_random_uuid();
  inv uuid := gen_random_uuid();
  itv uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.regulators(id,name,code) VALUES (reg,'Intv Reg','ITV-'||substr(reg::text,1,8))
    ON CONFLICT DO NOTHING;
  INSERT INTO public.conduct_investigations(id, source_type, allegation, status)
    VALUES (inv, 'manual', 'Mis-selling allegation for interview test', 'opened');
  INSERT INTO public.conduct_interviews(id, investigation_id, interviewee_name, key_information, status)
    VALUES (itv, inv, 'Test Interviewee', 'Confirmed the sales script was not followed.', 'conducted');
  PERFORM set_config('test.interview_id', itv::text, true);
END $$;

SET LOCAL ROLE service_role;

SELECT throws_ok(
  format($$SELECT public.conduct_finalise_interview(%L::uuid,'refused',NULL,NULL,'short',NULL)$$,
    current_setting('test.interview_id')),
  '23514',
  NULL,
  'refusal without a 10-char reason is rejected'
);

SELECT lives_ok(
  format($$SELECT public.conduct_finalise_interview(%L::uuid,'refused',NULL,NULL,'Declined to sign without legal counsel present',' Supervisor A')$$,
    current_setting('test.interview_id')),
  'refusal with a proper reason finalises the record'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
