-- ============================================================
-- TECHNICAL SUPPORT DESK (applicant / licensee help requests)
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS public.support_ticket_seq;

CREATE OR REPLACE FUNCTION public.generate_support_ticket_number()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN 'SUP-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.support_ticket_seq')::text, 6, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL UNIQUE DEFAULT public.generate_support_ticket_number(),
  requester_id uuid NOT NULL,
  requester_email text,
  requester_name text,
  licensee_id uuid,
  portal_area text NOT NULL DEFAULT 'general',
  category text NOT NULL DEFAULT 'technical',
  subject text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid,
  resolution_notes text,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_requester ON public.support_tickets(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assignee ON public.support_tickets(assigned_to, status);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON public.support_ticket_messages(ticket_id, created_at);

GRANT SELECT, INSERT ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- Staff predicate: internal roles may operate the support queue.
CREATE OR REPLACE FUNCTION public.support_is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('super_admin','admin','supervisor','licensing_officer','analyst','developer','legal_compliance')
  );
$$;

-- Tickets --------------------------------------------------------------
CREATE POLICY "Requesters view own tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (requester_id = auth.uid());

CREATE POLICY "Support staff view all tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (public.support_is_staff(auth.uid()));

CREATE POLICY "Requesters create own tickets"
  ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Support staff update tickets"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.support_is_staff(auth.uid()))
  WITH CHECK (public.support_is_staff(auth.uid()));

-- Messages -------------------------------------------------------------
CREATE POLICY "Requesters view own ticket messages"
  ON public.support_ticket_messages FOR SELECT TO authenticated
  USING (
    is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.requester_id = auth.uid()
    )
  );

CREATE POLICY "Support staff view all ticket messages"
  ON public.support_ticket_messages FOR SELECT TO authenticated
  USING (public.support_is_staff(auth.uid()));

CREATE POLICY "Requesters reply on own tickets"
  ON public.support_ticket_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.requester_id = auth.uid()
    )
  );

CREATE POLICY "Support staff reply on tickets"
  ON public.support_ticket_messages FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.support_is_staff(auth.uid()));

-- updated_at maintenance
CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();