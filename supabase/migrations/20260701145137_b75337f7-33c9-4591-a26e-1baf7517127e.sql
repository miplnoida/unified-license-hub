CREATE OR REPLACE FUNCTION public.external_can_access_return_filed_values(
  _user_id uuid,
  _entity_id uuid,
  _on_behalf_of_licensee_id uuid,
  _created_by uuid,
  _capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    (_created_by = _user_id)
    OR (
      _entity_id IS NOT NULL
      AND public.has_portal_capability(_user_id, _entity_id, 'returns'::public.portal_area, _capability)
    )
    OR (
      _on_behalf_of_licensee_id IS NOT NULL
      AND public.has_portal_capability(_user_id, _on_behalf_of_licensee_id, 'returns'::public.portal_area, _capability)
    );
$function$;