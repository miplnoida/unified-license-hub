DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY[
    'public.supervisory_policy_profile_effective(text,uuid,uuid,uuid,date)',
    'public.supervisory_policy_component_capability(text)',
    'public.supervisory_assessment_policy_basis(uuid)',
    'public.supervisory_policy_profile_compatibility(uuid)',
    'public.supervisory_policy_vocabulary(text,uuid)',
    'public.supervisory_policy_component_content_hash(text,uuid)']
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', s);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', s);
  END LOOP;
  FOREACH s IN ARRAY ARRAY[
    'public.tg_supervisory_policy_component_immutable()',
    'public.supervisory_policy_component_reference_guard()',
    'public.tg_supervisory_assessment_evidence_exception_guard()',
    'public.tg_supervisory_policy_component_event_append_only()',
    'public.supervisory_assessment_policy_snapshot_immutable()']
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', s);
  END LOOP;
END $$;