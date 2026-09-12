-- PCOMP-R2E: supervisory_domain_actions had no mapping for the 'approve' intent,
-- so every governed approval check that used it received NULL and denied every
-- officer (evidence policy exceptions, question plan overrides). Map the intent
-- to the same canonical approval permission already used by the rest of the
-- supervisory spine. No permission is widened: NULL previously denied all.
CREATE OR REPLACE FUNCTION public.supervisory_domain_actions(_domain_code text, _intent text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE upper(COALESCE(_domain_code,''))
    WHEN 'AML_CFT' THEN CASE lower(_intent)
        WHEN 'view' THEN ARRAY['aml_supervision.view']
        WHEN 'edit' THEN ARRAY['aml_supervision.edit']
        WHEN 'approve' THEN ARRAY['aml_supervision.approve']
        WHEN 'confidential' THEN ARRAY['aml_supervision.view_confidential']
      END
    WHEN 'PRUDENTIAL' THEN CASE lower(_intent)
        WHEN 'view' THEN ARRAY['prudential_supervision.view']
        WHEN 'edit' THEN ARRAY['prudential_supervision.record_camels_assessment']
        WHEN 'approve' THEN ARRAY['prudential_supervision.approve']
        WHEN 'confidential' THEN ARRAY['prudential_supervision.view_confidential']
      END
    WHEN 'MARKET_CONDUCT' THEN CASE lower(_intent)
        WHEN 'view' THEN ARRAY['market_conduct.view','market_conduct.run_conduct_analytics']
        WHEN 'edit' THEN ARRAY['market_conduct.edit','market_conduct.run_conduct_analytics']
        WHEN 'approve' THEN ARRAY['market_conduct.approve']
        WHEN 'confidential' THEN ARRAY['market_conduct.view_confidential']
      END
    ELSE CASE lower(_intent)
        WHEN 'view' THEN ARRAY['supervisory_spine.view']
        WHEN 'edit' THEN ARRAY['supervisory_spine.edit']
        WHEN 'approve' THEN ARRAY['supervisory_spine.approve']
        WHEN 'confidential' THEN ARRAY['supervisory_spine.view_confidential']
      END
  END;
$function$;