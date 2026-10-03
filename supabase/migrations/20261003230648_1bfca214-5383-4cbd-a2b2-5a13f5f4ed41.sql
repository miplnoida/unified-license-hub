-- AML-CLOSE-02D: revoke unaudited self-granted aml_head from the ordinary AML officer persona (history preserved)
UPDATE public.sec_user_roles ur
   SET status = 'inactive', effective_until = now(), updated_at = now()
  FROM public.sec_roles r
 WHERE r.id = ur.role_id AND r.key = 'aml_head'
   AND ur.user_id = 'b8eaf680-fe66-4d49-b816-1c087f511235'
   AND ur.assigned_by = ur.user_id
   AND ur.status = 'active';

INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
VALUES (NULL, 'security.revoke_self_granted_role', 'user', 'b8eaf680-fe66-4d49-b816-1c087f511235',
        jsonb_build_object('role','aml_head','status','active','assigned_by','self','audit_trail','none'),
        jsonb_build_object('status','inactive','reason','AML-CLOSE-02D least privilege: self-granted role with no governed assignment record'));

-- Structural guard: a user may not grant themselves a role unless they are super admin.
CREATE OR REPLACE FUNCTION public.sec_user_roles_no_self_grant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'active'
     AND NEW.assigned_by IS NOT NULL
     AND NEW.assigned_by = NEW.user_id
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active' OR OLD.role_id IS DISTINCT FROM NEW.role_id)
     AND NOT public.is_super_admin(NEW.assigned_by) THEN
    RAISE EXCEPTION 'self_role_grant_refused' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.sec_user_roles_no_self_grant() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sec_user_roles_no_self_grant ON public.sec_user_roles;
CREATE TRIGGER trg_sec_user_roles_no_self_grant
BEFORE INSERT OR UPDATE ON public.sec_user_roles
FOR EACH ROW EXECUTE FUNCTION public.sec_user_roles_no_self_grant();