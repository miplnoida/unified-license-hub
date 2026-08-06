CREATE OR REPLACE FUNCTION public.conduct_supervision_learning(_limit int DEFAULT 25)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE res jsonb;
BEGIN
  IF NOT public.can_view_conduct_intelligence() THEN
    RAISE EXCEPTION 'Not authorised to view conduct supervision data';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY occurred_at DESC), '[]'::jsonb) INTO res
  FROM (
    SELECT jsonb_build_object('source','thematic_review','id',t.id,'ref',t.code,'title',t.title,
             'learning',t.regulatory_learning,'occurred_at',COALESCE(t.closed_at, t.updated_at),
             'href','/supervision/thematic-reviews/'||t.id) AS x,
           COALESCE(t.closed_at, t.updated_at) AS occurred_at
    FROM public.thematic_reviews t
    WHERE t.regulatory_learning IS NOT NULL AND length(trim(t.regulatory_learning)) > 0

    UNION ALL

    SELECT jsonb_build_object('source','investigation','id',cc.investigation_id,'ref',i.code,
             'title',COALESCE(i.allegation,'Investigation closure'),'learning',cc.regulatory_learning,
             'occurred_at',COALESCE(cc.approved_at, cc.updated_at),
             'href','/conduct/investigations/'||cc.investigation_id) AS x,
           COALESCE(cc.approved_at, cc.updated_at) AS occurred_at
    FROM public.conduct_investigation_closures cc
    JOIN public.conduct_investigations i ON i.id = cc.investigation_id
    WHERE cc.regulatory_learning IS NOT NULL AND length(trim(cc.regulatory_learning)) > 0
      AND cc.status = 'approved'
  ) s
  LIMIT _limit;

  RETURN res;
END;
$$;
