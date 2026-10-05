DO $fix$
DECLARE _src text;
BEGIN
  SELECT pg_get_functiondef('public.supervisory_assessment_reassign(uuid,text,uuid,uuid,text)'::regprocedure) INTO _src;
  IF _src LIKE '%ERRCODE = ''40001''%' THEN
    EXECUTE replace(_src, 'ERRCODE = ''40001''', 'ERRCODE = ''55000''');
  END IF;
END $fix$;