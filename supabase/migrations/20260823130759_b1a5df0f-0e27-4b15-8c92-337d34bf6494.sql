-- P06 policy gap: every existing entity membership role that can prepare a
-- filing also carries 'submit'. A prepare-only role is required so an entity
-- can let a secondary user complete a return without authorising them to make
-- the final regulatory submission.
INSERT INTO public.entity_membership_roles (key, label, description, is_primary_representative, sort_order, is_system, is_active)
VALUES ('PREPARER', 'Preparer',
        'May prepare filings and respond to information requests, but may not make the final submission.',
        false, 35, true, true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.entity_membership_role_permissions (membership_role_id, capability)
SELECT r.id, c.capability
  FROM public.entity_membership_roles r
  CROSS JOIN (VALUES ('view_status'), ('upload_documents'), ('respond_rfi')) AS c(capability)
 WHERE r.key = 'PREPARER'
   AND NOT EXISTS (
     SELECT 1 FROM public.entity_membership_role_permissions p
      WHERE p.membership_role_id = r.id AND p.capability = c.capability);