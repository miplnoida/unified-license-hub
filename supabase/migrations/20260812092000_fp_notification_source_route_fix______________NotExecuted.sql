-- ─────────────────────────────────────────────────────────────────────────────
-- notification_source_route() is the canonical route resolver — the edge
-- function (dispatch-notification-event) only falls back to its own map when
-- this RPC is unavailable, so fixing the edge function's map alone (as done
-- alongside this migration) is not sufficient. This function still points
-- fp_individual/fp_assessment at the retired /fit-and-proper/* tree, and has
-- no entry at all for fp_finding/fp_condition/fp_appeal/fp_monitoring_event/
-- fp_determination — every notification for those either 404s or resolves to
-- no link.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notification_source_route(
  _entity_type text,
  _entity_id text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _entity_type IS NULL OR coalesce(_entity_id, '') = '' THEN NULL
    WHEN _entity_id !~ '^[A-Za-z0-9._-]+$' THEN NULL
    ELSE (
      SELECT CASE lower(_entity_type)
        WHEN 'application'            THEN '/applications/'   || _entity_id
        WHEN 'applications'           THEN '/applications/'   || _entity_id
        WHEN 'registration'           THEN '/admin/registrations/' || _entity_id
        WHEN 'license'                THEN '/licenses/'       || _entity_id
        WHEN 'licensee'               THEN '/admin/licensees/' || _entity_id
        WHEN 'license_appeal'         THEN '/admin/license-appeals?appeal=' || _entity_id
        WHEN 'return'                 THEN '/returns-mgmt/'   || _entity_id
        WHEN 'return_filed'           THEN '/returns-mgmt/'   || _entity_id
        WHEN 'returns_filed'          THEN '/returns-mgmt/'   || _entity_id
        WHEN 'compliance_return'      THEN '/compliance/'     || _entity_id
        WHEN 'complaint'              THEN '/complaints/'     || _entity_id
        WHEN 'correspondence'         THEN '/correspondence/manager?thread=' || _entity_id
        WHEN 'correspondence_thread'  THEN '/correspondence/manager?thread=' || _entity_id
        WHEN 'escalation'             THEN '/escalations?escalation=' || _entity_id
        WHEN 'fp_individual'          THEN '/fpa/individuals/' || _entity_id
        WHEN 'fp_assessment'          THEN '/fpa/assessments/' || _entity_id
        WHEN 'fp_finding'             THEN '/fpa/findings/' || _entity_id
        WHEN 'fp_condition'           THEN '/fpa/entity/condition/' || _entity_id
        WHEN 'fp_appeal'              THEN '/fpa/entity/appeal/' || _entity_id
        WHEN 'fp_monitoring_event'    THEN '/fpa/entity/monitoring_event/' || _entity_id
        WHEN 'fp_determination'       THEN '/fpa/entity/determination/' || _entity_id
        WHEN 'prudential_assessment'  THEN '/prudential/assessments/' || _entity_id
        WHEN 'enforcement_action'     THEN '/enforcement/'    || _entity_id
        WHEN 'inspection'             THEN '/inspections/'    || _entity_id
        WHEN 'payment'                THEN '/payments/'       || _entity_id
        WHEN 'report'                 THEN '/reports/'        || _entity_id
        WHEN 'form_template'          THEN '/admin/forms/'    || _entity_id
        ELSE NULL
      END
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.notification_source_route(text, text) TO authenticated, service_role;

-- Any already-stored notification whose source_route/entity_type was resolved
-- against the old map should be recomputed instead of staying wrong forever.
UPDATE public.notifications
   SET source_route = public.notification_source_route(entity_type, entity_id),
       route_status = CASE
         WHEN public.notification_source_route(entity_type, entity_id) IS NOT NULL THEN 'resolved'
         ELSE 'legacy_no_route'
       END
 WHERE entity_type IN ('fp_individual', 'fp_assessment', 'fp_finding', 'fp_condition', 'fp_appeal', 'fp_monitoring_event', 'fp_determination')
   AND (source_route LIKE '/fit-and-proper/%' OR source_route IS NULL);
