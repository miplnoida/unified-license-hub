CREATE OR REPLACE FUNCTION public.aml_portfolio(_limit integer DEFAULT 200)
 RETURNS TABLE(entity_id uuid, entity_name text, sector_name text, licence_reference text, residual_rating text, inherent_rating text, control_rating text, prior_rating text, trend text, last_review_date date, next_review_date date, assessment_current boolean, last_assessment_id uuid, last_assessment_reference text, last_assessment_status text, methodology_version text, assigned_officer_id uuid, assigned_officer_name text, assigned_team_id uuid, high_risk_dimensions text[], open_findings integer, critical_findings integer, overdue_remediation integer, active_examinations integer, reassessment_required boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH cur AS (
    SELECT a.* FROM public.supervisory_assessment a
     WHERE a.domain_code = 'AML_CFT' AND a.status = 'approved' AND a.is_current
  )
  SELECT l.id, l.name, s.name,
         (SELECT lic.license_number FROM public.entity_licenses el
            JOIN public.licenses lic ON lic.id = el.license_id
           WHERE el.entity_id = l.id
           ORDER BY el.is_primary DESC NULLS LAST, el.effective_from DESC NULLS LAST LIMIT 1),
         rs.residual_rating, rs.inherent_rating, rs.control_rating,
         (SELECT m.previous_rating FROM public.entity_risk_state_movement m
            WHERE m.entity_id = l.id AND m.domain_code = 'AML_CFT'
            ORDER BY (m.new_assessment_id IS NOT DISTINCT FROM rs.driving_assessment_id) DESC,
                     m.approved_at DESC, m.created_at DESC LIMIT 1),
         COALESCE((SELECT m.trend FROM public.entity_risk_state_movement m
                    WHERE m.entity_id = l.id AND m.domain_code = 'AML_CFT'
                    ORDER BY (m.new_assessment_id IS NOT DISTINCT FROM rs.driving_assessment_id) DESC,
                             m.approved_at DESC, m.created_at DESC LIMIT 1), 'STABLE'),
         rs.last_review_date, rs.next_review_date,
         (rs.next_review_date IS NULL OR rs.next_review_date >= current_date),
         c.id, c.reference, COALESCE(c.status, 'none'), c.methodology_version,
         c.owner_id,
         (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = c.owner_id),
         c.team_id,
         COALESCE((SELECT array_agg(d.dimension_code ORDER BY d.dimension_code)
                     FROM public.supervisory_assessment_dimension d
                    WHERE d.assessment_id = rs.driving_assessment_id
                      AND upper(COALESCE(d.residual_rating,'')) IN ('HIGH','SEVERE','MEDIUM_HIGH')), '{}'::text[]),
         (SELECT count(*)::int FROM public.supervisory_finding f
           WHERE f.entity_id = l.id AND f.domain_code = 'AML_CFT'
             AND f.status NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')),
         (SELECT count(*)::int FROM public.supervisory_finding f
           WHERE f.entity_id = l.id AND f.domain_code = 'AML_CFT' AND f.severity IN ('HIGH','CRITICAL')
             AND f.status NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')),
         (SELECT count(*)::int FROM public.supervisory_remediation_action a
           WHERE a.entity_id = l.id AND a.domain_code = 'AML_CFT' AND a.target_date < current_date
             AND a.status NOT IN ('EFFECTIVE','CLOSED')),
         (SELECT count(*)::int FROM public.examinations e
           WHERE e.entity_id = l.id AND e.domain_code = 'AML_CFT' AND e.closed_at IS NULL),
         EXISTS (SELECT 1 FROM public.supervisory_reassessment_requirement rr
                  WHERE rr.entity_id = l.id AND rr.domain_code = 'AML_CFT'
                    AND rr.status IN ('REQUIRED','IN_PROGRESS'))
    FROM public.licensees l
    LEFT JOIN public.sectors s ON s.id = l.sector_id
    LEFT JOIN public.entity_risk_state rs
           ON rs.entity_id = l.id AND rs.domain_code = 'AML_CFT'
    LEFT JOIN cur c ON c.entity_id = l.id
   WHERE COALESCE(l.status,'') <> 'archived'
   ORDER BY CASE upper(COALESCE(rs.residual_rating,''))
              WHEN 'SEVERE' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM_HIGH' THEN 3
              WHEN 'MODERATE' THEN 4 WHEN 'LOW' THEN 5 ELSE 6 END,
            l.name
   LIMIT _limit;
$function$;