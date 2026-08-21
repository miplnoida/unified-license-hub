-- EPR-05 — coherent single-case read model for the Licensing case workspace
CREATE OR REPLACE FUNCTION public.application_case(_application_id uuid, _audience text DEFAULT 'internal')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v jsonb; s record; v_ext boolean := (_audience = 'external');
BEGIN
  SELECT * INTO s FROM public.v_application_case_state WHERE id = _application_id;
  IF s.id IS NULL THEN RETURN NULL; END IF;

  v := jsonb_build_object(
    'application_id', s.id,
    'reference', s.application_number,
    'applicant_id', s.applicant_id,
    'applicant_name', s.applicant_name,
    'applicant_org', s.applicant_org,
    'entity_id', s.entity_id,
    'entity_name', s.entity_name,
    'entity_href', CASE WHEN s.entity_id IS NOT NULL THEN '/entities/' || s.entity_id END,
    'application_category', s.application_category,
    'license_type', s.license_type,
    'regulator_id', s.regulator_id,
    'stage', s.stage,
    'stage_label', s.stage_label,
    'status', s.status,
    'status_label', s.status_label,
    'submitted_at', s.submitted_at,
    'created_at', s.created_at,
    'last_activity_at', s.last_activity_at,
    'is_terminal', s.is_terminal,
    'canonical_href', s.canonical_href,
    'next_action', public.application_next_action(s.stage, coalesce(_audience, 'internal')),
    'workflow', jsonb_build_object(
      'instance_id', s.workflow_instance_id,
      'workflow_id', s.workflow_id,
      'current_step_id', s.current_step_id,
      'current_step_name', s.current_step_name,
      'current_step_order', s.current_step_order,
      'is_final_step', s.current_step_is_terminal),
    'sufficiency', (
      SELECT jsonb_build_object(
        'status', s.sufficiency_status,
        'evaluation_id', e.id,
        'evaluated_at', e.evaluated_at,
        'triggered_by', e.triggered_by,
        'overall_status', e.overall_status,
        'blocker_count', e.blocker_count,
        'warning_count', e.warning_count,
        'pass_count', e.pass_count)
        FROM sufficiency_evaluations e
       WHERE e.application_id = s.id ORDER BY e.evaluated_at DESC LIMIT 1),
    'rfis', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r.id, 'summary', r.summary, 'status', r.status,
               'raised_at', r.raised_at, 'due_at', r.due_at,
               'closed_at', r.closed_at, 'closure_notes', r.closure_notes,
               'pauses_sla', r.pauses_sla,
               'raised_by_name', CASE WHEN v_ext THEN NULL ELSE public.app_actor_display_name(r.raised_by) END)
             ORDER BY r.raised_at DESC)
        FROM application_rfis r WHERE r.application_id = s.id), '[]'::jsonb),
    'open_rfi_count', s.open_rfi_count,
    'forms', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'requirement_id', fr.id, 'template_id', fr.template_id,
               'form_version_id', fr.form_version_id, 'package_id', fr.package_id,
               'is_required', fr.is_required, 'sequence', fr.sequence,
               'status', fr.status, 'response_id', fr.response_id,
               'pinned_at', fr.pinned_at) ORDER BY fr.sequence NULLS LAST)
        FROM application_form_requirements fr WHERE fr.application_id = s.id), '[]'::jsonb),
    'payments', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'amount', p.amount, 'currency', p.currency,
               'status', p.status, 'verification_status', p.verification_status,
               'paid_at', p.paid_at, 'receipt_number', p.receipt_number,
               'fee_configuration_id', p.fee_configuration_id) ORDER BY p.created_at DESC)
        FROM payments p WHERE p.application_id = s.id), '[]'::jsonb),
    'license', (SELECT jsonb_build_object(
               'id', l.id, 'license_number', l.license_number, 'status', l.status,
               'issued_at', l.issued_at, 'valid_from', l.valid_from, 'valid_until', l.valid_until,
               'href', '/licenses/' || l.id)
        FROM licenses l WHERE l.application_id = s.id LIMIT 1)
  );

  IF v_ext THEN
    RETURN v;
  END IF;

  RETURN v || jsonb_build_object(
    'owner_user_id', s.owner_user_id,
    'owner_name', s.owner_name,
    'team', s.team,
    'priority', s.priority,
    'priority_reason', s.priority_reason,
    'priority_source', s.priority_source,
    'manual_priority', s.manual_priority,
    'sla_due_at', s.sla_due_at,
    'sla_state', s.sla_state,
    'sla_hours', s.sla_hours,
    'waiting_on', s.waiting_on,
    'blockers', public.application_blockers(s.id),
    'decision_gates', public.decision_gate_status(s.id),
    'fit_and_proper', public.application_fp_gate(s.id),
    'decision', jsonb_build_object(
      'rationale', (SELECT a.decision_rationale FROM applications a WHERE a.id = s.id),
      'approved_at', (SELECT a.approved_at FROM applications a WHERE a.id = s.id),
      'rejected_at', (SELECT a.rejected_at FROM applications a WHERE a.id = s.id),
      'cancelled_at', (SELECT a.cancelled_at FROM applications a WHERE a.id = s.id),
      'artifacts', coalesce((SELECT jsonb_agg(jsonb_build_object(
            'id', d.id, 'artifact_type', d.artifact_type, 'version', d.version,
            'created_at', d.created_at) ORDER BY d.created_at DESC)
          FROM decision_artifacts d WHERE d.application_id = s.id), '[]'::jsonb))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.application_case(uuid, text) TO authenticated;