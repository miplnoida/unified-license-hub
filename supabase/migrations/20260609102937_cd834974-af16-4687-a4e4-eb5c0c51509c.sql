
-- Tighten report_definitions: only admins/supervisors/analysts may read the catalog
DROP POLICY IF EXISTS "Authenticated read report definitions" ON public.report_definitions;
CREATE POLICY "Privileged users read report definitions"
  ON public.report_definitions FOR SELECT TO authenticated
  USING (
    is_active = true AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'supervisor'::app_role)
      OR has_role(auth.uid(), 'analyst'::app_role)
    )
  );

-- Tighten report_logs read: own logs OR admin
DROP POLICY IF EXISTS "Read report logs" ON public.report_logs;
CREATE POLICY "Read report logs"
  ON public.report_logs FOR SELECT TO authenticated
  USING (
    executed_by = auth.uid()
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Allow schedule-driven inserts where executed_by may be the schedule owner (still the caller)
-- (existing insert policy already enforces executed_by = auth.uid(); service role bypasses RLS)

-- Add sort_dir to report_schedules so schedules preserve sort direction
ALTER TABLE public.report_schedules ADD COLUMN IF NOT EXISTS sort_dir text;
