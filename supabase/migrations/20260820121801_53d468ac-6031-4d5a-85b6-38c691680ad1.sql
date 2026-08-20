DO $mig$
DECLARE src text; ob text; nb text;
BEGIN
  -- returns summary: filing statuses are stored upper-case
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname = 'entity360_overview' AND pronamespace = 'public'::regnamespace;
  ob := $o$        'accepted', count(*) FILTER (WHERE rf.status = 'accepted'),
        'awaiting_review', count(*) FILTER (WHERE rf.status IN ('submitted','under_review')),
        'overdue', count(*) FILTER (WHERE rf.status <> 'accepted' AND p.due_date < current_date))$o$;
  nb := $n$        'accepted', count(*) FILTER (WHERE lower(rf.status) = 'accepted'),
        'awaiting_review', count(*) FILTER (WHERE lower(rf.status) IN ('submitted','under_review')),
        'overdue', count(*) FILTER (WHERE lower(rf.status) <> 'accepted' AND p.due_date < current_date))$n$;
  IF position(ob in src) = 0 THEN
    RAISE EXCEPTION 'entity360_overview: returns summary block not found';
  END IF;
  EXECUTE replace(src, ob, nb);

  -- documents section
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname = 'entity360_section' AND pronamespace = 'public'::regnamespace;
  ob := $o$  ELSIF _section = 'provenance' THEN$o$;
  nb := $n$  ELSIF _section = 'documents' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', d.id, 'file_name', d.file_name,
        'file_path', d.file_path, 'file_size', d.file_size, 'mime_type', d.mime_type,
        'uploaded_at', d.created_at) AS x
      FROM public.documents d
      WHERE d.entity_id = _entity_id
        AND (_as_of IS NULL OR d.created_at <= asof)
      ORDER BY d.created_at DESC LIMIT lim OFFSET off) s), '[]'::jsonb);

  ELSIF _section = 'provenance' THEN$n$;
  IF position(ob in src) = 0 THEN
    RAISE EXCEPTION 'entity360_section: provenance branch not found';
  END IF;
  EXECUTE replace(src, ob, nb);
END $mig$;