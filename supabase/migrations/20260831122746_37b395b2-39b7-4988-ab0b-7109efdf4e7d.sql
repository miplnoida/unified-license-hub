GRANT SELECT, INSERT ON public.executive_dashboard_snapshots TO authenticated;
GRANT ALL ON public.executive_dashboard_snapshots TO service_role;

CREATE POLICY "exec snapshots captured by dashboard viewers"
ON public.executive_dashboard_snapshots
FOR INSERT
TO authenticated
WITH CHECK (
  captured_by = auth.uid()
  AND public.has_permission(auth.uid(), 'admin_dashboard', 'view')
);