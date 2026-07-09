
CREATE TABLE IF NOT EXISTS public.return_data_revisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id UUID NOT NULL REFERENCES public.returns_filed(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  snapshot_reason TEXT NOT NULL CHECK (snapshot_reason IN ('submitted','edit_requested','resubmitted','admin_edit')),
  previous_status TEXT,
  new_status TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  form_version_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (return_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_return_data_revisions_return ON public.return_data_revisions(return_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_return_data_revisions_reason ON public.return_data_revisions(return_id, snapshot_reason);

GRANT SELECT, INSERT ON public.return_data_revisions TO authenticated;
GRANT ALL ON public.return_data_revisions TO service_role;

ALTER TABLE public.return_data_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Return stakeholders can view revisions"
ON public.return_data_revisions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.returns_filed r
    LEFT JOIN public.profiles p ON p.id = auth.uid()
    WHERE r.id = return_data_revisions.return_id
      AND (
        r.created_by = auth.uid()
        OR public.has_role(auth.uid(), 'super_admin'::app_role)
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'supervisor'::app_role)
        OR public.has_role(auth.uid(), 'analyst'::app_role)
        OR public.has_role(auth.uid(), 'licensing_officer'::app_role)
        OR (p.licensee_id IS NOT NULL AND (p.licensee_id = r.entity_id OR p.licensee_id = r.on_behalf_of_licensee_id))
        OR r.entity_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
        OR r.on_behalf_of_licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
        OR public.external_can_access_return_filed(auth.uid(), r.id, 'can_submit_returns'::text)
      )
  )
);

CREATE POLICY "Service role manages revisions"
ON public.return_data_revisions FOR ALL
TO service_role
USING (true) WITH CHECK (true);

-- Snapshot function (SECURITY DEFINER so both trigger and client RPC use identical numbering)
CREATE OR REPLACE FUNCTION public.snapshot_return_revision(
  _return_id UUID,
  _reason TEXT,
  _previous_status TEXT DEFAULT NULL,
  _new_status TEXT DEFAULT NULL,
  _actor_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot JSONB;
  v_versions JSONB;
  v_next INT;
  v_id UUID;
  v_actor UUID;
BEGIN
  IF _reason NOT IN ('submitted','edit_requested','resubmitted','admin_edit') THEN
    RAISE EXCEPTION 'invalid snapshot_reason: %', _reason;
  END IF;

  v_actor := COALESCE(_actor_id, auth.uid());

  -- Aggregate current form data grouped by form_id
  SELECT
    COALESCE(jsonb_object_agg(form_id, data), '{}'::jsonb),
    COALESCE(jsonb_object_agg(form_id, ver), '{}'::jsonb)
  INTO v_snapshot, v_versions
  FROM (
    SELECT
      form_id::text AS form_id,
      jsonb_object_agg(field_name, to_jsonb(field_value)) AS data,
      COALESCE(MAX(form_version_id::text), NULL) AS ver
    FROM public.return_form_data
    WHERE return_id = _return_id
    GROUP BY form_id
  ) grouped;

  SELECT COALESCE(MAX(revision_number), 0) + 1
  INTO v_next
  FROM public.return_data_revisions
  WHERE return_id = _return_id;

  INSERT INTO public.return_data_revisions
    (return_id, revision_number, snapshot_reason, previous_status, new_status, snapshot, form_version_ids, created_by)
  VALUES
    (_return_id, v_next, _reason, _previous_status, _new_status, COALESCE(v_snapshot,'{}'::jsonb), COALESCE(v_versions,'{}'::jsonb), v_actor)
  RETURNING id INTO v_id;

  -- Best-effort audit entry
  BEGIN
    INSERT INTO public.return_audit_log (return_id, action, previous_status, new_status, performed_by, event_key, source, metadata)
    VALUES (
      _return_id,
      'revision_snapshot_created',
      _previous_status,
      _new_status,
      v_actor,
      'return.revision.snapshot',
      'rpc:snapshot_return_revision',
      jsonb_build_object('revision_id', v_id, 'revision_number', v_next, 'reason', _reason)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.snapshot_return_revision(UUID, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;

-- Trigger: snapshot when a return transitions into SUB
CREATE OR REPLACE FUNCTION public.trg_snapshot_return_on_submit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev TEXT;
  v_new TEXT;
  v_reason TEXT;
BEGIN
  v_prev := COALESCE(OLD.workflow_status::text, '');
  v_new := COALESCE(NEW.workflow_status::text, '');
  IF v_new <> 'SUB' OR v_prev = v_new THEN
    RETURN NEW;
  END IF;
  IF v_prev = 'TBR' THEN
    v_reason := 'resubmitted';
  ELSE
    v_reason := 'submitted';
  END IF;
  PERFORM public.snapshot_return_revision(NEW.id, v_reason, v_prev, v_new, NEW.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS returns_filed_snapshot_on_submit ON public.returns_filed;
CREATE TRIGGER returns_filed_snapshot_on_submit
AFTER UPDATE OF workflow_status ON public.returns_filed
FOR EACH ROW
EXECUTE FUNCTION public.trg_snapshot_return_on_submit();
