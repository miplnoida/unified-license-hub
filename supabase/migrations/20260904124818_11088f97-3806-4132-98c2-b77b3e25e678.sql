CREATE OR REPLACE FUNCTION public.supervisory_methodology_resolve_detail(
  _domain_code text,
  _sector_id uuid DEFAULT NULL,
  _as_of date DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _d text; _asof date;
  _total int := 0; _top int := 0; _id uuid; _ver text; _cands jsonb;
BEGIN
  _d := upper(btrim(COALESCE(_domain_code,'')));
  _asof := COALESCE(_as_of, current_date);

  WITH elig AS (
    SELECT m.id, m.version, m.effective_from, m.effective_to,
           m.sector_id, m.regulator_id,
           (CASE WHEN m.sector_id IS NOT NULL THEN 2
                 WHEN COALESCE(array_length(m.applicable_sector_ids,1),0) > 0 THEN 1
                 ELSE 0 END)
         + (CASE WHEN m.regulator_id IS NOT NULL THEN 2 ELSE 0 END) AS specificity
      FROM public.supervisory_methodology m
     WHERE m.domain_code = _d
       AND m.status = 'ACTIVE'
       AND (m.effective_from IS NULL OR m.effective_from <= _asof)
       AND (m.effective_to   IS NULL OR m.effective_to   >= _asof)
       AND (CASE
              WHEN _sector_id IS NULL THEN
                m.sector_id IS NULL
                AND COALESCE(array_length(m.applicable_sector_ids,1),0) = 0
              ELSE
                m.sector_id = _sector_id
                OR (m.sector_id IS NULL
                    AND (COALESCE(array_length(m.applicable_sector_ids,1),0) = 0
                         OR _sector_id = ANY (m.applicable_sector_ids)))
            END)
       AND (m.regulator_id IS NULL OR m.regulator_id = _regulator_id)
  ), ranked AS (
    SELECT e.*, rank() OVER (ORDER BY e.specificity DESC,
                                      e.effective_from DESC NULLS LAST) AS rnk
      FROM elig e
  )
  SELECT count(*),
         count(*) FILTER (WHERE rnk = 1),
         (min(id::text) FILTER (WHERE rnk = 1))::uuid,
         min(version) FILTER (WHERE rnk = 1),
         COALESCE(jsonb_agg(jsonb_build_object(
             'methodology_id', id, 'version', version, 'rank', rnk,
             'specificity', specificity, 'effective_from', effective_from,
             'sector_id', sector_id, 'regulator_id', regulator_id)
           ORDER BY rnk, id), '[]'::jsonb)
    INTO _total, _top, _id, _ver, _cands
    FROM ranked;

  IF _total = 0 THEN
    RETURN jsonb_build_object('status','NONE_APPLICABLE','methodology_id',NULL,
      'methodology_version',NULL,'domain_code',_d,'sector_id',_sector_id,
      'regulator_id',_regulator_id,'as_of',_asof,
      'candidate_count',0,'candidates','[]'::jsonb,
      'reason','no ACTIVE methodology version of this domain applies to this sector, regulator and date');
  END IF;

  IF _top > 1 THEN
    RETURN jsonb_build_object('status','AMBIGUOUS','methodology_id',NULL,
      'methodology_version',NULL,'domain_code',_d,'sector_id',_sector_id,
      'regulator_id',_regulator_id,'as_of',_asof,
      'candidate_count',_total,'candidates',_cands,
      'reason','more than one methodology version applies with equal specificity and effective date; a methodology owner must scope or supersede one of them');
  END IF;

  RETURN jsonb_build_object('status','RESOLVED','methodology_id',_id,
    'methodology_version',_ver,'domain_code',_d,'sector_id',_sector_id,
    'regulator_id',_regulator_id,'as_of',_asof,
    'candidate_count',_total,'candidates',_cands);
END
$function$;
