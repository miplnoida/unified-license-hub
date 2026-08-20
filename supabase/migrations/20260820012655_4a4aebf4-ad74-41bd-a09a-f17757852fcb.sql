-- ============================================================
-- 1. Collapse level-4 configuration groups into level-3 hub links
-- ============================================================
UPDATE public.sec_navigation_items
SET item_type = 'link', href_override = '/admin/returns/config', route_id = NULL,
    label = 'Return Configuration', updated_at = now()
WHERE key = 'nav_returns_management_returns_admin';

UPDATE public.sec_navigation_items
SET item_type = 'link', href_override = '/admin/returns/prudential', route_id = NULL,
    label = 'Prudential Configuration', updated_at = now()
WHERE key = 'nav_sup_prud_config';

UPDATE public.sec_navigation_items
SET item_type = 'link', href_override = '/admin/masters', route_id = NULL,
    label = 'Master Configuration', updated_at = now()
WHERE key = 'nav_configuration_master_configuration';

-- Their children stay registered (routes + search) but leave the sidebar.
UPDATE public.sec_navigation_items c
SET show_in_sidebar = false, show_in_search = true, updated_at = now()
FROM public.sec_navigation_items p
WHERE c.parent_id = p.id
  AND p.key IN (
    'nav_returns_management_returns_admin',
    'nav_sup_prud_config',
    'nav_configuration_master_configuration'
  );

-- ============================================================
-- 2. Flatten Fit & Proper: drop the intermediate stage groups
-- ============================================================
UPDATE public.sec_navigation_items c
SET parent_id = (SELECT id FROM public.sec_navigation_items WHERE key = 'nav_lic_fitproper'),
    show_in_sidebar = false,
    show_in_search = true,
    updated_at = now()
FROM public.sec_navigation_items p
WHERE c.parent_id = p.id
  AND p.key IN (
    'nav_fit_proper_policy_initiation',
    'nav_fit_proper_declaration_evidence',
    'nav_fit_proper_verification_assessment',
    'nav_fit_proper_committee_determination',
    'nav_fit_proper_conditions_monitoring',
    'nav_fit_proper_appeals_notifications',
    'nav_fit_proper_reporting_training'
  );

DELETE FROM public.sec_navigation_items
WHERE key IN (
  'nav_fit_proper_policy_initiation',
  'nav_fit_proper_declaration_evidence',
  'nav_fit_proper_verification_assessment',
  'nav_fit_proper_committee_determination',
  'nav_fit_proper_conditions_monitoring',
  'nav_fit_proper_appeals_notifications',
  'nav_fit_proper_reporting_training'
);

-- ============================================================
-- 3. Search keywords for everything now hidden from the sidebar
-- ============================================================
UPDATE public.sec_navigation_items
SET keywords = (
      SELECT ARRAY(
        SELECT DISTINCT lower(w)
        FROM unnest(
          keywords || string_to_array(regexp_replace(label, '[^a-zA-Z0-9 ]', ' ', 'g'), ' ')
        ) AS t(w)
        WHERE length(trim(w)) > 2
      )
    ),
    updated_at = now()
WHERE show_in_sidebar = false AND is_active;