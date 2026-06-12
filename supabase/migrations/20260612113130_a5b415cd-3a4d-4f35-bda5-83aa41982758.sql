
ALTER TABLE public.approval_step_actions
  ADD COLUMN IF NOT EXISTS require_digital_signature boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signature_data_url text;

CREATE OR REPLACE FUNCTION public.build_workflow_snapshot(_workflow_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'version', 2,
    'steps', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'local_id', s.id::text,
            'step_order', s.step_order,
            'name', s.name,
            'description', s.description,
            'approver_role', s.approver_role::text,
            'approver_role_id', s.approver_role_id,
            'approver_type', s.approver_type,
            'approver_config', s.approver_config,
            'sla_hours', s.sla_hours,
            'auto_approve_on_timeout', s.auto_approve_on_timeout,
            'allowed_actions', s.allowed_actions,
            'actions', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'action_type', a.action_type,
                'label', a.label,
                'require_comments', a.require_comments,
                'result_status_override', a.result_status_override,
                'next_step_mode', a.next_step_mode,
                'next_step_local_id', a.next_step_id::text,
                'end_state', a.end_state,
                'sort_order', a.sort_order,
                'is_enabled', a.is_enabled,
                'require_digital_signature', a.require_digital_signature,
                'signature_data_url', a.signature_data_url
              ) ORDER BY a.sort_order)
              FROM public.approval_step_actions a WHERE a.step_id = s.id
            ), '[]'::jsonb),
            'entry_notifications', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'event_key', n.event_key,
                'recipient_type', n.recipient_type,
                'recipient_config', n.recipient_config,
                'template_id', n.template_id,
                'is_enabled', n.is_enabled
              ))
              FROM public.approval_step_entry_notifications n WHERE n.step_id = s.id
            ), '[]'::jsonb),
            'action_notifications', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'action_type', n.action_type,
                'event_key', n.event_key,
                'recipient_type', n.recipient_type::text,
                'recipient_config', n.recipient_config,
                'template_id', n.template_id,
                'is_enabled', n.is_enabled
              ))
              FROM public.approval_action_notifications n WHERE n.step_id = s.id
            ), '[]'::jsonb)
          ) ORDER BY s.step_order
        )
        FROM public.approval_steps s WHERE s.workflow_id = _workflow_id
      ),
      '[]'::jsonb
    )
  )
$$;
