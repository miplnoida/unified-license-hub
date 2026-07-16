
-- 1. Table
CREATE TABLE public.return_edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.returns_filed(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','allowed','denied')),
  requested_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decision_comment text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_return_edit_requests_return_id ON public.return_edit_requests(return_id);
CREATE INDEX idx_return_edit_requests_status ON public.return_edit_requests(status);

-- Only one active pending request per return.
CREATE UNIQUE INDEX uniq_return_edit_requests_pending
  ON public.return_edit_requests(return_id)
  WHERE status = 'pending';

-- 2. Grants
GRANT SELECT, INSERT, UPDATE ON public.return_edit_requests TO authenticated;
GRANT ALL ON public.return_edit_requests TO service_role;

-- 3. RLS
ALTER TABLE public.return_edit_requests ENABLE ROW LEVEL SECURITY;

-- Licensee (owner of the return) can read + insert their own.
CREATE POLICY "return_edit_requests_owner_read"
ON public.return_edit_requests FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.returns_filed r
          WHERE r.id = return_edit_requests.return_id
            AND (r.created_by = auth.uid()
                 OR has_role(auth.uid(), 'super_admin')
                 OR has_role(auth.uid(), 'admin')
                 OR has_role(auth.uid(), 'supervisor')
                 OR has_role(auth.uid(), 'analyst')))
);

CREATE POLICY "return_edit_requests_owner_insert"
ON public.return_edit_requests FOR INSERT TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND status = 'pending'
  AND EXISTS (SELECT 1 FROM public.returns_filed r
              WHERE r.id = return_edit_requests.return_id
                AND r.created_by = auth.uid())
);

-- Admin/supervisor can update (decide).
CREATE POLICY "return_edit_requests_admin_update"
ON public.return_edit_requests FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'))
WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_return_edit_requests_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_return_edit_requests_updated_at
BEFORE UPDATE ON public.return_edit_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_return_edit_requests_updated_at();

-- 4. RPCs
-- Licensee requests to edit an already-submitted / validated return.
CREATE OR REPLACE FUNCTION public.request_return_edit(
  _return_id uuid,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return public.returns_filed%ROWTYPE;
  v_uid uuid := auth.uid();
  v_req_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated', 'code', 'UNAUTHORIZED', 'http', 401);
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RETURN jsonb_build_object('error', 'A reason is required', 'code', 'BAD_REQUEST', 'http', 400);
  END IF;

  SELECT * INTO v_return FROM public.returns_filed WHERE id = _return_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Return not found', 'code', 'NOT_FOUND', 'http', 404);
  END IF;

  IF v_return.created_by IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('error', 'You are not authorised to request edits for this return', 'code', 'FORBIDDEN', 'http', 403);
  END IF;

  IF upper(coalesce(v_return.workflow_status,'')) NOT IN ('SUB','VAL') THEN
    RETURN jsonb_build_object('error', 'Edit requests are only allowed on submitted or validated returns', 'code', 'INVALID_STATE', 'http', 422);
  END IF;

  IF EXISTS (SELECT 1 FROM public.return_edit_requests WHERE return_id = _return_id AND status = 'pending') THEN
    RETURN jsonb_build_object('error', 'An edit request is already pending admin review', 'code', 'ALREADY_PENDING', 'http', 409);
  END IF;

  INSERT INTO public.return_edit_requests(return_id, reason, status, requested_by)
  VALUES (_return_id, btrim(_reason), 'pending', v_uid)
  RETURNING id INTO v_req_id;

  -- Audit
  BEGIN
    INSERT INTO public.return_audit_log(return_id, action, previous_status, new_status, comments, performed_by, created_at)
    VALUES (_return_id, 'applicant_edit_requested', v_return.workflow_status, v_return.workflow_status, btrim(_reason), v_uid, now());
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'request_id', v_req_id);
END $$;

REVOKE ALL ON FUNCTION public.request_return_edit(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_return_edit(uuid, text) TO authenticated;

-- Admin decides on a pending applicant edit request.
CREATE OR REPLACE FUNCTION public.decide_return_edit_request(
  _request_id uuid,
  _decision text,
  _comment text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.return_edit_requests%ROWTYPE;
  v_return public.returns_filed%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;
  IF NOT (has_role(v_uid,'super_admin') OR has_role(v_uid,'admin') OR has_role(v_uid,'supervisor')) THEN
    RETURN jsonb_build_object('error','Only regulators can decide edit requests','code','FORBIDDEN','http',403);
  END IF;
  IF _decision NOT IN ('allowed','denied') THEN
    RETURN jsonb_build_object('error','Decision must be allowed or denied','code','BAD_REQUEST','http',400);
  END IF;

  SELECT * INTO v_req FROM public.return_edit_requests WHERE id = _request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Request not found','code','NOT_FOUND','http',404);
  END IF;
  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('error','Request has already been decided','code','ALREADY_DECIDED','http',409);
  END IF;

  SELECT * INTO v_return FROM public.returns_filed WHERE id = v_req.return_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Return not found','code','NOT_FOUND','http',404);
  END IF;

  UPDATE public.return_edit_requests
  SET status = _decision,
      decided_by = v_uid,
      decision_comment = nullif(btrim(coalesce(_comment,'')), ''),
      decided_at = now()
  WHERE id = _request_id;

  IF _decision = 'allowed' THEN
    -- Move return to TBR and open a return_requests row so the existing
    -- TBR/resubmit-return path works unchanged.
    UPDATE public.returns_filed
    SET workflow_status = 'TBR', updated_by = v_uid
    WHERE id = v_req.return_id;

    BEGIN
      INSERT INTO public.return_requests(return_id, reasons, status, requested_by)
      VALUES (v_req.return_id, v_req.reason, 'active', v_req.requested_by);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
      INSERT INTO public.return_audit_log(return_id, action, previous_status, new_status, comments, performed_by, created_at)
      VALUES (v_req.return_id, 'edit_request_allowed', v_return.workflow_status, 'TBR', nullif(btrim(coalesce(_comment,'')), ''), v_uid, now());
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  ELSE
    BEGIN
      INSERT INTO public.return_audit_log(return_id, action, previous_status, new_status, comments, performed_by, created_at)
      VALUES (v_req.return_id, 'edit_request_denied', v_return.workflow_status, v_return.workflow_status, nullif(btrim(coalesce(_comment,'')), ''), v_uid, now());
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'decision', _decision, 'return_id', v_req.return_id);
END $$;

REVOKE ALL ON FUNCTION public.decide_return_edit_request(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_return_edit_request(uuid, text, text) TO authenticated;
