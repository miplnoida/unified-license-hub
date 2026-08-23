-- Examination staff must be able to read the remediation actions raised from
-- their own examination findings, without gaining broad prudential visibility.
CREATE OR REPLACE FUNCTION public.can_read_examination_linked_action(_user uuid, _source_type text, _source_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _source_type = 'examination_finding'
     AND EXISTS (
       SELECT 1
       FROM public.examination_findings f
       JOIN public.examinations e ON e.id = f.examination_id
       WHERE f.id = _source_id
         AND public.can_read_examination(_user, e.entity_id)
     );
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_examination_linked_action(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_examination_linked_action(uuid, text, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS prudential_actions_read ON public.prudential_actions;
CREATE POLICY prudential_actions_read ON public.prudential_actions
FOR SELECT
USING (
  can_read_prudential_entity(auth.uid(), entity_id)
  OR public.can_read_examination_linked_action(auth.uid(), source_type, source_id)
);