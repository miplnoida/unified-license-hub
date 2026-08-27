-- Consumer complaint lifecycle notifications: canonical complainant resolution
-- and the missing lifecycle events. Uses the existing centralized architecture
-- (notification_event_configs + notification_enqueue_event).

-- 1) Canonical complainant recipient rule -------------------------------------
-- The legacy pair {payload_user:complainant_id} + {custom_email:complainant_email}
-- cannot address public (email-only) complainants. The dispatcher now supports a
-- single `complainant` rule that resolves a registered user, else the complaint's
-- own email, else the complainant party email.
UPDATE public.notification_event_configs
   SET recipient_rules = '[{"type":"complainant"}]'::jsonb, updated_at = now()
 WHERE event_key IN ('complaint.acknowledged','complaint.complainant_update','complaint.outcome_released');

-- Mixed-audience events: swap only the complainant rule, keep regulator/licensee rules.
UPDATE public.notification_event_configs
   SET recipient_rules = (
         SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) || '[{"type":"complainant"}]'::jsonb
           FROM jsonb_array_elements(recipient_rules) r
          WHERE NOT (r->>'type' = 'payload_user' AND r->>'key' = 'complainant_id')
       ),
       updated_at = now()
 WHERE event_key IN ('complaint.closed','complaint.resolved','complaint.investigation_started',
                     'complaint.escalated_to_enforcement');

-- 2) Missing complainant-facing lifecycle events ------------------------------
INSERT INTO public.notification_event_configs (
  event_key, description, title_template, message_template,
  email_subject_template, email_body_template, channels, recipient_rules,
  notification_type, dedupe_window_seconds, is_active, severity, category, module,
  action_required, allow_mute, system_required, delivery_frequency
) VALUES
 ('complaint_jurisdiction_accepted',
  'Complainant notice that the complaint falls within the regulator''s remit.',
  'Complaint accepted for handling | {{complaint_number}}',
  'Your complaint {{complaint_number}} has been assessed as within our remit and will now be handled by our consumer complaints team.',
  'Complaint accepted for handling | {{complaint_number}}',
  'Your complaint {{complaint_number}} has been assessed as within our remit and will now be handled by our consumer complaints team. We will contact you if further information is needed.',
  ARRAY['in_app','email'], '[{"type":"complainant"}]'::jsonb,
  'info', 300, true, 'medium', 'info', 'complaints', false, true, true, 'immediate'),
 ('complaint_jurisdiction_partially_accepted',
  'Complainant notice that part of the complaint falls within remit.',
  'Complaint partially accepted | {{complaint_number}}',
  'Part of your complaint {{complaint_number}} falls within our remit and will be handled. The remaining matters fall outside our powers.',
  'Complaint partially accepted | {{complaint_number}}',
  'Part of your complaint {{complaint_number}} falls within our remit and will be handled by our consumer complaints team. The remaining matters fall outside our statutory powers and cannot be pursued by us.',
  ARRAY['in_app','email'], '[{"type":"complainant"}]'::jsonb,
  'info', 300, true, 'medium', 'info', 'complaints', false, true, true, 'immediate'),
 ('complaint_jurisdiction_referred',
  'Complainant notice that the complaint has been referred to another body.',
  'Complaint referred | {{complaint_number}}',
  'Your complaint {{complaint_number}} has been referred to the body responsible for this matter.',
  'Complaint referred | {{complaint_number}}',
  'Your complaint {{complaint_number}} has been referred to the organisation responsible for this matter. They will contact you directly about the next steps.',
  ARRAY['in_app','email'], '[{"type":"complainant"}]'::jsonb,
  'info', 300, true, 'medium', 'info', 'complaints', false, true, true, 'immediate'),
 ('complaint_jurisdiction_out_of_scope',
  'Complainant notice that the complaint falls outside the regulator''s remit.',
  'Complaint outside our remit | {{complaint_number}}',
  'Your complaint {{complaint_number}} falls outside our statutory remit, so we are unable to take it forward.',
  'Complaint outside our remit | {{complaint_number}}',
  'Following assessment, your complaint {{complaint_number}} falls outside our statutory remit and we are unable to take it forward. You may wish to seek independent advice about other options available to you.',
  ARRAY['in_app','email'], '[{"type":"complainant"}]'::jsonb,
  'info', 300, true, 'medium', 'info', 'complaints', false, true, true, 'immediate'),
 ('complaint.information_requested',
  'Information requested from the complainant so the complaint can progress.',
  'Information needed | {{complaint_number}}',
  'We need further information to progress your complaint {{complaint_number}}. Please respond by {{due_date}}.',
  'Information needed | {{complaint_number}}',
  'To progress your complaint {{complaint_number}} we need further information from you. Please respond by {{due_date}}. If we do not hear from you we may be unable to take the matter further.',
  ARRAY['in_app','email'], '[{"type":"complainant"}]'::jsonb,
  'warning', 300, true, 'high', 'action_required', 'complaints', true, false, true, 'immediate'),
 ('complaint.redress_communicated',
  'Complainant notice that agreed redress has been completed.',
  'Redress completed | {{complaint_number}}',
  'The redress agreed on your complaint {{complaint_number}} has been recorded as completed.',
  'Redress completed | {{complaint_number}}',
  'The redress agreed in relation to your complaint {{complaint_number}} has been recorded as completed. If you believe this is not correct, please contact us.',
  ARRAY['in_app','email'], '[{"type":"complainant"}]'::jsonb,
  'info', 300, true, 'medium', 'info', 'complaints', false, true, true, 'immediate'),
 ('complaint.reopened',
  'Complainant notice that a closed complaint has been reopened.',
  'Complaint reopened | {{complaint_number}}',
  'Your complaint {{complaint_number}} has been reopened and is being looked at again.',
  'Complaint reopened | {{complaint_number}}',
  'Your complaint {{complaint_number}} has been reopened and is being reviewed again. We will contact you once the review is complete.',
  ARRAY['in_app','email'], '[{"type":"complainant"}]'::jsonb,
  'info', 300, true, 'medium', 'info', 'complaints', false, true, true, 'immediate')
ON CONFLICT (event_key) DO UPDATE SET
  title_template = EXCLUDED.title_template,
  message_template = EXCLUDED.message_template,
  email_subject_template = EXCLUDED.email_subject_template,
  email_body_template = EXCLUDED.email_body_template,
  channels = EXCLUDED.channels,
  recipient_rules = EXCLUDED.recipient_rules,
  module = EXCLUDED.module,
  is_active = true,
  updated_at = now();

-- 3) Emission for the lifecycle points that had no emitter --------------------

-- (a) information requested from the complainant during jurisdiction assessment
CREATE OR REPLACE FUNCTION public.trg_complaint_info_request_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.complaints;
BEGIN
  IF COALESCE(NEW.requested_from,'COMPLAINANT') NOT IN ('COMPLAINANT','complainant') THEN
    RETURN NEW;
  END IF;
  SELECT * INTO c FROM public.complaints WHERE id = NEW.complaint_id;
  IF c.id IS NULL THEN RETURN NEW; END IF;

  PERFORM public.notification_enqueue_event(
    'complaint.information_requested', 'complaint', NEW.complaint_id,
    jsonb_build_object(
      'complaint_id', NEW.complaint_id,
      'complaint_number', c.complaint_number,
      'complainant_id', c.complainant_id,
      'complainant_email', c.email,
      'due_date', COALESCE(to_char(NEW.due_date, 'DD Mon YYYY'), 'the date stated in your case'),
      'cta_url', '/complaints/track',
      'cta_label', 'View your complaint'),
    NEW.id::text);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_complaint_info_request_notify ON public.complaint_jurisdiction_info_requests;
CREATE TRIGGER trg_complaint_info_request_notify
  AFTER INSERT ON public.complaint_jurisdiction_info_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_complaint_info_request_notify();

-- (b) redress completion / verification
CREATE OR REPLACE FUNCTION public.trg_complaint_redress_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.complaints;
BEGIN
  IF upper(COALESCE(NEW.status,'')) NOT IN ('COMPLETED','VERIFIED')
     OR upper(COALESCE(OLD.status,'')) = upper(COALESCE(NEW.status,'')) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO c FROM public.complaints WHERE id = NEW.complaint_id;
  IF c.id IS NULL THEN RETURN NEW; END IF;

  PERFORM public.notification_enqueue_event(
    'complaint.redress_communicated', 'complaint', NEW.complaint_id,
    jsonb_build_object(
      'complaint_id', NEW.complaint_id,
      'complaint_number', c.complaint_number,
      'complainant_id', c.complainant_id,
      'complainant_email', c.email,
      'cta_url', '/complaints/track',
      'cta_label', 'View your complaint'),
    NEW.id::text || ':' || upper(NEW.status));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_complaint_redress_notify ON public.complaint_redress;
CREATE TRIGGER trg_complaint_redress_notify
  AFTER UPDATE ON public.complaint_redress
  FOR EACH ROW EXECUTE FUNCTION public.trg_complaint_redress_notify();

-- (c) reopening a closed complaint
CREATE OR REPLACE FUNCTION public.trg_complaint_reopen_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('closed','resolved') AND NEW.status NOT IN ('closed','resolved') THEN
    PERFORM public.notification_enqueue_event(
      'complaint.reopened', 'complaint', NEW.id,
      jsonb_build_object(
        'complaint_id', NEW.id,
        'complaint_number', NEW.complaint_number,
        'complainant_id', NEW.complainant_id,
        'complainant_email', NEW.email,
        'cta_url', '/complaints/track',
        'cta_label', 'View your complaint'),
      'reopen:' || to_char(now(), 'YYYYMMDDHH24MISS'));
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_complaint_reopen_notify ON public.complaints;
CREATE TRIGGER trg_complaint_reopen_notify
  AFTER UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.trg_complaint_reopen_notify();