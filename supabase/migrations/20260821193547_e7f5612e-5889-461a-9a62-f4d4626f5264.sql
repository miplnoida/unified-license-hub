-- P12/P08 closure certification fixtures (non-production, is_demo = true).
DO $$
DECLARE
  v_complaint record;
  v_inv record;
  v_t1 uuid;
  v_t2 uuid;
  v_d_ok uuid;
  v_d_bounce uuid;
BEGIN
  SELECT id, complaint_number, licensee_id INTO v_complaint
    FROM public.complaints ORDER BY created_at LIMIT 1;
  SELECT id, code, licensee_id INTO v_inv
    FROM public.conduct_investigations ORDER BY created_at LIMIT 1;
  IF v_complaint.id IS NULL OR v_inv.id IS NULL THEN RETURN; END IF;

  -- Thread A: complaint-linked, awaiting entity response, SLA breached, with delivery evidence.
  SELECT id INTO v_t1 FROM public.correspondence_threads
   WHERE source_type = 'complaint' AND source_id = v_complaint.id AND is_demo LIMIT 1;
  IF v_t1 IS NULL THEN
    INSERT INTO public.correspondence_threads (
      subject, summary, category, channel, direction, priority, status, sender_name,
      licensee_id, assigned_unit, assigned_team, thread_type, thread_state,
      source_type, source_id, source_reference, module, is_entity_facing, is_demo,
      received_at, last_message_at, last_message_kind, response_due_at, sla_breached_at)
    VALUES (
      'CERTIFICATION — Complaint information request', 'Request for supporting statements on the complaint.',
      'Complaint', 'email', 'outbound', 'high', 'responded', 'Market Conduct Unit',
      v_complaint.licensee_id, 'Market Conduct', 'Market Conduct', 'complaint_correspondence', 'pending_response',
      'complaint', v_complaint.id, v_complaint.complaint_number, 'complaints', true, true,
      now() - interval '10 days', now() - interval '6 days', 'external_outbound',
      now() - interval '2 days', now() - interval '2 days')
    RETURNING id INTO v_t1;

    INSERT INTO public.correspondence_dispatches (source_type, source_id, recipient_email, recipient_name, channel, subject, body, status, provider_message_id, sent_at)
    VALUES ('complaint', v_complaint.id, 'cert.entity@example.test', 'Certification Entity', 'email',
            'CERTIFICATION — Complaint information request', 'Please provide statements.', 'DELIVERED', 'cert-msg-delivered', now() - interval '6 days')
    RETURNING id INTO v_d_ok;

    INSERT INTO public.correspondence_dispatches (source_type, source_id, recipient_email, recipient_name, channel, subject, body, status, error_message, sent_at)
    VALUES ('complaint', v_complaint.id, 'invalid.mailbox@example.test', 'Certification Entity', 'email',
            'CERTIFICATION — Complaint information request (retry)', 'Please provide statements.', 'BOUNCED', 'mailbox does not exist', now() - interval '5 days')
    RETURNING id INTO v_d_bounce;

    INSERT INTO public.correspondence_messages (thread_id, direction, channel, subject, body, is_internal_note, author_name, author_role, dispatch_id, sent_at, message_kind, delivery_status, delivered_at, is_draft)
    VALUES (v_t1, 'outbound', 'email', 'CERTIFICATION — Complaint information request', 'Please provide statements.', false,
            'Market Conduct Officer', 'analyst', v_d_ok, now() - interval '6 days', 'external_outbound', 'delivered', now() - interval '6 days', false);

    INSERT INTO public.correspondence_messages (thread_id, direction, channel, subject, body, is_internal_note, author_name, author_role, dispatch_id, sent_at, message_kind, delivery_status, bounce_reason, is_draft)
    VALUES (v_t1, 'outbound', 'email', 'CERTIFICATION — Complaint information request (retry)', 'Please provide statements.', false,
            'Market Conduct Officer', 'analyst', v_d_bounce, now() - interval '5 days', 'external_outbound', 'bounced', 'mailbox does not exist', false);

    INSERT INTO public.correspondence_messages (thread_id, direction, channel, subject, body, is_internal_note, author_name, author_role, sent_at, message_kind, delivery_status, is_draft)
    VALUES (v_t1, 'outbound', 'email', 'CERTIFICATION — queued follow-up', 'Follow-up pending dispatch.', false,
            'Market Conduct Officer', 'analyst', now() - interval '1 day', 'external_outbound', 'queued', false);

    INSERT INTO public.correspondence_events (thread_id, action, actor_name, detail, visible_to_licensee)
    VALUES (v_t1, 'dispatched', 'Market Conduct Officer', 'Certification dispatch recorded', true);
  END IF;

  -- Thread B: investigation-linked internal thread, no SLA, unassigned.
  SELECT id INTO v_t2 FROM public.correspondence_threads
   WHERE source_type = 'conduct_investigation' AND source_id = v_inv.id AND is_demo LIMIT 1;
  IF v_t2 IS NULL THEN
    INSERT INTO public.correspondence_threads (
      subject, summary, category, channel, direction, priority, status, sender_name,
      licensee_id, thread_type, thread_state, source_type, source_id, source_reference,
      module, is_entity_facing, is_demo, received_at, last_message_at, last_message_kind)
    VALUES (
      'CERTIFICATION — Investigation evidence request', 'Internal coordination on investigation evidence.',
      'Conduct', 'portal', 'inbound', 'normal', 'received', 'Conduct Investigator',
      v_inv.licensee_id, 'conduct_correspondence', 'open', 'conduct_investigation', v_inv.id, v_inv.code,
      'conduct', false, true, now() - interval '3 days', now() - interval '1 day', 'external_inbound')
    RETURNING id INTO v_t2;

    INSERT INTO public.correspondence_messages (thread_id, direction, channel, subject, body, is_internal_note, author_name, author_role, sent_at, message_kind, is_draft)
    VALUES (v_t2, 'inbound', 'portal', 'CERTIFICATION — Investigation evidence request', 'Evidence bundle attached.', false,
            'Conduct Investigator', 'analyst', now() - interval '1 day', 'external_inbound', false);
  END IF;
END $$;