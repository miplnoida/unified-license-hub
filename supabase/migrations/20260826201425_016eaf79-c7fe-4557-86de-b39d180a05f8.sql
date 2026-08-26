CREATE OR REPLACE FUNCTION public.conduct_evidence_pack_list(_pack_type text DEFAULT NULL::text, _subject_id uuid DEFAULT NULL::uuid, _sector_id uuid DEFAULT NULL::uuid, _regulator_id uuid DEFAULT NULL::uuid, _limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _sectors uuid[];
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  _sectors := public.conduct_planning_scope(_uid, _sector_id, _regulator_id);
  RETURN jsonb_build_object('packs', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'reference', p.reference,
             'pack_type', p.pack_type, 'subject_id', p.subject_id, 'subject_key', p.subject_key,
             'subject_label', p.subject_label,
             'sector_id', p.sector_id, 'period_start', p.period_start, 'period_end', p.period_end,
             'current_version', p.current_version, 'status', p.status,
             'created_by', p.created_by, 'created_at', p.created_at,
             'latest_signature', (SELECT v.facts_signature FROM public.conduct_evidence_pack_versions v
                                   WHERE v.pack_id = p.id ORDER BY v.version DESC LIMIT 1))
             ORDER BY p.created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.conduct_evidence_packs p2
             WHERE (_pack_type IS NULL OR p2.pack_type = _pack_type)
               AND (_subject_id IS NULL OR p2.subject_id = _subject_id)
               AND (_sectors IS NULL OR p2.sector_id IS NULL OR p2.sector_id = ANY(_sectors))
             ORDER BY p2.created_at DESC
             LIMIT GREATEST(1, LEAST(COALESCE(_limit, 100), 500))) p));
END $function$;

REVOKE ALL ON FUNCTION public.conduct_evidence_pack_list(text,uuid,uuid,uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.conduct_evidence_pack_list(text,uuid,uuid,uuid,integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.conduct_evidence_pack_list(text,uuid,uuid,uuid,integer) TO authenticated, service_role;