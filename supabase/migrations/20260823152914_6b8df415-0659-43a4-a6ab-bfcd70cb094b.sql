-- RC1 §2 parity correction: the visible-entity set must mirror
-- can_read_prudential_entity exactly (regulator officer fields + entity_user_access).
-- The active-supervision-assignment branch was wider than the previous RLS rule,
-- so it is removed.
CREATE OR REPLACE FUNCTION public.prudential_visible_entities(_user uuid)
RETURNS TABLE(id uuid, name text, sector_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH flags AS (
    SELECT
      _user IS NOT NULL AND NOT public.has_external_role(_user) AS internal,
      _user IS NOT NULL AND (
        public.is_super_admin(_user)
        OR public.has_permission(_user, 'prudential_supervision', 'view_all_entities')
      ) AS view_all,
      _user IS NOT NULL AND public.has_permission(_user, 'prudential_supervision', 'view') AS can_view
  )
  SELECT l.id, l.name, l.sector_id
    FROM public.licensees l, flags f
   WHERE f.internal
     AND (
       f.view_all
       OR (
         f.can_view
         AND (
           l.lead_regulator_id = _user
           OR l.regulator_officer_id = _user
           OR l.alternate_regulator_id = _user
           OR EXISTS (SELECT 1 FROM public.entity_user_access eua
                       WHERE eua.entity_id = l.id AND eua.user_id = _user)
         )
       )
     );
$function$;