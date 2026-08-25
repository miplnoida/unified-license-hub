-- Storage access for support ticket attachments (path: <ticket_id>/<file>)
DROP POLICY IF EXISTS "support attachments read" ON storage.objects;
CREATE POLICY "support attachments read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (
      public.support_is_staff(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.support_tickets t
         WHERE t.requester_id = auth.uid()
           AND t.id::text = (storage.foldername(name))[1]
      )
    )
  );

DROP POLICY IF EXISTS "support attachments write" ON storage.objects;
CREATE POLICY "support attachments write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'support-attachments'
    AND (
      public.support_is_staff(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.support_tickets t
         WHERE t.requester_id = auth.uid()
           AND t.id::text = (storage.foldername(name))[1]
      )
    )
  );

-- Automatic activity log ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.support_ticket_audit_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.support_ticket_audit(ticket_id, actor_id, action, details)
    VALUES (NEW.id, NEW.requester_id, 'created',
            jsonb_build_object('category', NEW.category, 'priority', NEW.priority));
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.support_ticket_audit(ticket_id, actor_id, action, details)
    VALUES (NEW.id, auth.uid(), 'status_changed',
            jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     OR NEW.assigned_team IS DISTINCT FROM OLD.assigned_team THEN
    INSERT INTO public.support_ticket_audit(ticket_id, actor_id, action, details)
    VALUES (NEW.id, auth.uid(), 'assignment_changed',
            jsonb_build_object('assigned_to', NEW.assigned_to, 'assigned_team', NEW.assigned_team));
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.support_ticket_audit(ticket_id, actor_id, action, details)
    VALUES (NEW.id, auth.uid(), 'priority_changed',
            jsonb_build_object('from', OLD.priority, 'to', NEW.priority));
  END IF;
  IF COALESCE(NEW.resolution_notes,'') IS DISTINCT FROM COALESCE(OLD.resolution_notes,'') THEN
    INSERT INTO public.support_ticket_audit(ticket_id, actor_id, action, details)
    VALUES (NEW.id, auth.uid(), 'resolution_recorded', '{}'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_ticket_audit_ins ON public.support_tickets;
CREATE TRIGGER support_ticket_audit_ins
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_ticket_audit_trg();

DROP TRIGGER IF EXISTS support_ticket_audit_upd ON public.support_tickets;
CREATE TRIGGER support_ticket_audit_upd
  AFTER UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_ticket_audit_trg();

CREATE OR REPLACE FUNCTION public.support_message_audit_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.support_ticket_audit(ticket_id, actor_id, action, details)
  VALUES (NEW.ticket_id, NEW.author_id,
          CASE WHEN NEW.is_internal THEN 'internal_note_added' ELSE 'reply_sent' END,
          '{}'::jsonb);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_message_audit_ins ON public.support_ticket_messages;
CREATE TRIGGER support_message_audit_ins
  AFTER INSERT ON public.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_message_audit_trg();
