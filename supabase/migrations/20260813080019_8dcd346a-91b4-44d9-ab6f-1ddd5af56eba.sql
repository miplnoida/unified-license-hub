CREATE OR REPLACE FUNCTION public.application_rfi_submit_response(
  p_rfi_item_id uuid,
  p_response_text text DEFAULT NULL,
  p_file_upload_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.application_rfi_items;
  v_rfi public.application_rfis;
  v_all_done boolean;
  v_response_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_item FROM public.application_rfi_items WHERE id = p_rfi_item_id;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Information request question not found';
  END IF;

  SELECT * INTO v_rfi FROM public.application_rfis WHERE id = v_item.rfi_id;
  IF v_rfi.id IS NULL THEN
    RAISE EXCEPTION 'Information request not found';
  END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR public.has_permission(v_uid, 'application_management', 'edit')
    OR public.has_permission(v_uid, 'application_management', 'workflow_action')
    OR public.can_mutate_application(v_uid, v_rfi.application_id)
  ) THEN
    RAISE EXCEPTION 'Not authorised to respond to this information request';
  END IF;

  IF v_rfi.status NOT IN ('open', 'responded') THEN
    RAISE EXCEPTION 'This information request is closed to further responses';
  END IF;

  IF v_item.response_status = 'responded'
     OR EXISTS (SELECT 1 FROM public.application_rfi_responses WHERE rfi_item_id = p_rfi_item_id) THEN
    RAISE EXCEPTION 'This question has already been answered';
  END IF;

  INSERT INTO public.application_rfi_responses (rfi_item_id, response_text, file_upload_ids, submitted_by)
  VALUES (p_rfi_item_id, NULLIF(btrim(coalesce(p_response_text, '')), ''), coalesce(p_file_upload_ids, '{}'::uuid[]), v_uid)
  RETURNING id INTO v_response_id;

  UPDATE public.application_rfi_items
  SET response_status = 'responded'
  WHERE id = p_rfi_item_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.application_rfi_items
    WHERE rfi_id = v_rfi.id AND response_status <> 'responded'
  ) INTO v_all_done;

  IF v_all_done THEN
    UPDATE public.application_rfis SET status = 'responded' WHERE id = v_rfi.id;
    IF v_rfi.approval_step_action_id IS NOT NULL THEN
      UPDATE public.approval_step_actions
      SET resumed_at = now()
      WHERE id = v_rfi.approval_step_action_id AND resumed_at IS NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'response_id', v_response_id,
    'rfi_id', v_rfi.id,
    'application_id', v_rfi.application_id,
    'all_items_done', v_all_done
  );
END;
$$;

REVOKE ALL ON FUNCTION public.application_rfi_submit_response(uuid, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.application_rfi_submit_response(uuid, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.application_rfi_submit_response(uuid, text, uuid[]) TO service_role;

-- Backfill: questions that already carry answers but were never marked answered
UPDATE public.application_rfi_items i
SET response_status = 'responded'
WHERE i.response_status = 'pending'
  AND EXISTS (SELECT 1 FROM public.application_rfi_responses r WHERE r.rfi_item_id = i.id);

UPDATE public.application_rfis r
SET status = 'responded'
WHERE r.status = 'open'
  AND EXISTS (SELECT 1 FROM public.application_rfi_items i WHERE i.rfi_id = r.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.application_rfi_items i
    WHERE i.rfi_id = r.id AND i.response_status <> 'responded'
  );