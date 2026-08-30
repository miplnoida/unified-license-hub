DO $patch$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.entity_change_set_transition(uuid,text,text)'::regprocedure);

  v_new := replace(v_def,
    'IF v_uid IS NOT NULL AND (v_uid = v_cs.submitted_by OR v_uid = v_cs.created_by) THEN',
    'IF v_uid IS NOT NULL AND v_cs.application_id IS NULL AND v_cs.regulatory_request_id IS NULL'
    || E'\n       AND (v_uid = v_cs.submitted_by OR v_uid = v_cs.created_by) THEN');

  IF v_new = v_def THEN
    RAISE NOTICE 'entity_change_set_transition maker-checker scope already patched';
    RETURN;
  END IF;

  EXECUTE v_new;

  COMMENT ON FUNCTION public.entity_change_set_transition(uuid,text,text) IS
    'Governed structural change-set lifecycle. Human proposal path (no application_id / '
    'regulatory_request_id) requires an independent checker: the maker may never approve or '
    'reject their own change. Change sets carried by a governed application or regulatory-request '
    'decision are already maker-checked by that approval workflow and are exempt from the '
    'second-person rule at this layer.';
END
$patch$;