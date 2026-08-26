DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.conduct_signals','public.conduct_signal_sources',
    'public.conduct_signal_alert_links','public.conduct_signal_history'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON TABLE %s FROM anon', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %s FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON TABLE %s TO authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE %s TO service_role', t);
  END LOOP;
END $$;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.conduct_signal_create(jsonb)',
    'public.conduct_signal_link_source(uuid,text,uuid,text,text,text)',
    'public.conduct_signal_link_evidence(uuid,uuid,text)',
    'public.conduct_signal_assign(uuid,uuid,text)',
    'public.conduct_signal_validate(uuid,text,text,text,numeric)',
    'public.conduct_signal_dismiss(uuid,text)',
    'public.conduct_signal_link_alert(uuid,uuid,text,text)',
    'public.conduct_signal_escalate_to_alert(uuid,text,text)',
    'public.conduct_signal_reopen(uuid,text)',
    'public.conduct_signal_register(text[],text[],text[],uuid,uuid,text,boolean,integer,integer)',
    'public.conduct_signal_case(uuid)',
    'public.conduct_signal_next_reference()',
    'public.conduct_signal_require(text[])',
    'public.conduct_signal_guard(uuid,text[])',
    'public.conduct_signal_log(uuid,text,text,text,text,jsonb,uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
  END LOOP;

  EXECUTE 'GRANT EXECUTE ON FUNCTION public.conduct_signal_log(uuid,text,text,text,text,jsonb,uuid) TO service_role';
  FOREACH fn IN ARRAY ARRAY[
    'public.conduct_signal_create(jsonb)',
    'public.conduct_signal_link_source(uuid,text,uuid,text,text,text)',
    'public.conduct_signal_link_evidence(uuid,uuid,text)',
    'public.conduct_signal_assign(uuid,uuid,text)',
    'public.conduct_signal_validate(uuid,text,text,text,numeric)',
    'public.conduct_signal_dismiss(uuid,text)',
    'public.conduct_signal_link_alert(uuid,uuid,text,text)',
    'public.conduct_signal_escalate_to_alert(uuid,text,text)',
    'public.conduct_signal_reopen(uuid,text)',
    'public.conduct_signal_register(text[],text[],text[],uuid,uuid,text,boolean,integer,integer)',
    'public.conduct_signal_case(uuid)',
    'public.conduct_signal_next_reference()',
    'public.conduct_signal_require(text[])',
    'public.conduct_signal_guard(uuid,text[])'
  ] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;