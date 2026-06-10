-- Phase 2 workflow admin hardening:
--   1. Atomic step reorder RPC (no half-applied step_order on failure).
--   2. Tighten workflow_templates SELECT to internal staff only.
--   3. (No schema change needed for template allowed_actions — `steps` is JSONB.)

-- 1) Atomic reorder for approval_steps. Runs inside one transaction; if any
--    update fails (FK / RLS / constraint) the entire reorder rolls back.
--    Uses a two-pass write to avoid colliding with the unique
--    (workflow_id, step_order) index that exists in some environments.
CREATE OR REPLACE FUNCTION public.reorder_approval_steps(
  _workflow_id uuid,
  _orders jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  expected_count int;
  matched_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'insufficient privileges';
  END IF;

  IF _orders IS NULL OR jsonb_typeof(_orders) <> 'array' THEN
    RAISE EXCEPTION 'orders must be a JSON array';
  END IF;

  -- Validate every id belongs to the workflow
  SELECT count(*) INTO expected_count
  FROM jsonb_array_elements(_orders) AS e;

  SELECT count(*) INTO matched_count
  FROM jsonb_array_elements(_orders) AS e
  JOIN public.approval_steps s
    ON s.id = (e->>'id')::uuid
   AND s.workflow_id = _workflow_id;

  IF matched_count <> expected_count THEN
    RAISE EXCEPTION 'reorder payload references steps outside workflow %', _workflow_id;
  END IF;

  -- Pass 1: shift to a negative range to avoid unique collisions.
  FOR rec IN SELECT (e->>'id')::uuid AS id, (e->>'step_order')::int AS step_order
             FROM jsonb_array_elements(_orders) AS e
  LOOP
    UPDATE public.approval_steps
       SET step_order = -1 * (rec.step_order + 1)
     WHERE id = rec.id AND workflow_id = _workflow_id;
  END LOOP;

  -- Pass 2: write the final orders.
  FOR rec IN SELECT (e->>'id')::uuid AS id, (e->>'step_order')::int AS step_order
             FROM jsonb_array_elements(_orders) AS e
  LOOP
    UPDATE public.approval_steps
       SET step_order = rec.step_order
     WHERE id = rec.id AND workflow_id = _workflow_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_approval_steps(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.reorder_approval_steps(uuid, jsonb) TO authenticated;

-- 2) Tighten workflow_templates: only internal staff can read; admins manage.
DROP POLICY IF EXISTS "Authenticated can read workflow templates" ON public.workflow_templates;
CREATE POLICY "Internal users read workflow templates"
ON public.workflow_templates FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'supervisor'::app_role)
  OR public.has_role(auth.uid(),'licensing_officer'::app_role)
  OR public.has_role(auth.uid(),'analyst'::app_role)
);

-- Ensure expected grants exist (no-op if already present).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_templates TO authenticated;
GRANT ALL ON public.workflow_templates TO service_role;
