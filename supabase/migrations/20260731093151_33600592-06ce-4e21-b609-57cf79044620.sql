
DROP POLICY IF EXISTS "correspondence_read" ON storage.objects;
CREATE POLICY "correspondence_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'correspondence'
  AND (
    public.is_internal_staff(auth.uid())
    OR public.correspondence_thread_visible(NULLIF((storage.foldername(name))[1], '')::uuid, auth.uid())
  )
);

DROP POLICY IF EXISTS "correspondence_write" ON storage.objects;
CREATE POLICY "correspondence_write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'correspondence'
  AND (
    public.is_internal_staff(auth.uid())
    OR public.correspondence_thread_visible(NULLIF((storage.foldername(name))[1], '')::uuid, auth.uid())
  )
);

DROP POLICY IF EXISTS "correspondence_delete" ON storage.objects;
CREATE POLICY "correspondence_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'correspondence' AND public.is_internal_staff(auth.uid()));

INSERT INTO public.correspondence_routing_rules (name, match_type, match_value, assign_unit, assign_officer, priority, sla_days, sort_order)
SELECT * FROM (VALUES
  ('Regulatory filings to Prudential Supervision', 'category', 'Regulatory Filing', 'Prudential Supervision', NULL::text, 'high', 5, 1),
  ('Consumer complaints to Market Conduct', 'category', 'Consumer Complaint', 'Market Conduct', NULL::text, 'urgent', 2, 2),
  ('Licensing queries to Licensing Unit', 'category', 'Licensing Query', 'Licensing', NULL::text, 'normal', 7, 3),
  ('Legal notices to Legal & Compliance', 'category', 'Legal Notice', 'Legal & Compliance', NULL::text, 'high', 5, 4),
  ('General enquiries to Registry', 'category', 'General', 'Registry', NULL::text, 'normal', 10, 5)
) AS v(name, match_type, match_value, assign_unit, assign_officer, priority, sla_days, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.correspondence_routing_rules);
