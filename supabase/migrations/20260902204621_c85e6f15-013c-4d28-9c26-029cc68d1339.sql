-- Widen the MAKER permission gates of the canonical spine so the approved AML
-- persona model works: AML officers/senior analysts prepare, AML supervisors
-- decide. Bodies are preserved byte-for-byte apart from the permission arrays.
DO $wave$
DECLARE
  r record;
  v_def text;
  v_new text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, x.find, x.repl
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN (VALUES
      ('supervisory_assessment_create',   '''supervisory_spine.create''', '''supervisory_spine.create'',''aml_supervision.create'''),
      ('supervisory_attention_open',      '''supervisory_spine.create''', '''supervisory_spine.create'',''aml_supervision.create'''),
      ('supervisory_plan_open',           '''supervisory_spine.create''', '''supervisory_spine.create'',''aml_supervision.create'''),
      ('supervisory_intervention_open',   '''supervisory_spine.create''', '''supervisory_spine.create'',''aml_supervision.create'''),
      ('supervisory_examination_open',    '''supervisory_spine.create''', '''supervisory_spine.create'',''aml_supervision.examine'''),
      ('examination_link_origin',         '''supervisory_spine.edit''',   '''supervisory_spine.edit'',''aml_supervision.examine'''),
      ('supervisory_assessment_transition','''supervisory_spine.submit''','''supervisory_spine.submit'',''aml_supervision.submit'''),
      ('supervisory_plan_lifecycle',      '''supervisory_spine.submit''', '''supervisory_spine.submit'',''aml_supervision.submit''')
    ) AS x(fname, find, repl) ON x.fname = p.proname
    WHERE n.nspname = 'public'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF position(r.repl in v_def) > 0 THEN
      CONTINUE; -- already widened
    END IF;
    v_new := replace(v_def, r.find, r.repl);
    IF v_new = v_def THEN
      RAISE EXCEPTION 'could not widen maker gate for %', r.proname;
    END IF;
    EXECUTE v_new;
  END LOOP;
END
$wave$;