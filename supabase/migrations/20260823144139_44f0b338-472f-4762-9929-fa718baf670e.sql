-- Holding prudential_supervision.manage_remediation is itself an authority to
-- act on supervisory remediation actions (used by examination closure).
CREATE OR REPLACE FUNCTION public.can_act_on_prudential(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user,'prudential_supervision','workflow_action')
      OR public.has_permission(_user,'prudential_supervision','edit')
      OR public.has_permission(_user,'prudential_supervision','create')
      OR public.has_permission(_user,'prudential_supervision','manage_remediation');
$function$;