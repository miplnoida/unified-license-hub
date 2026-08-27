-- GAP-F0-02: register referenced-but-uncatalogued permission pairs.
-- Idempotent. NO role / template / user grants are created: authority is
-- preserved exactly (deny-by-default) — only catalogue truth changes.

INSERT INTO public.sec_modules (key, label, description, module_type, audience, sort_order, is_system, is_active)
SELECT 'employee_management', 'Employee Management',
       'Legacy compatibility module referenced by historic access rules on internal employee records.',
       'business', 'internal', 900, false, true
WHERE NOT EXISTS (SELECT 1 FROM public.sec_modules WHERE key = 'employee_management');

WITH wanted(module_key, action_key, label, description) AS (
  VALUES
    ('application_management','close','Close Application','Terminal close of an application record (historic access rule).'),
    ('application_management','configure','Configure Applications','Application module configuration (historic access rule).'),
    ('application_management','escalate','Escalate Application','Escalate an application (historic access rule).'),
    ('application_management','export','Export Applications','Export application data / listings.'),
    ('application_management','import','Import Applications','Bulk import of application data (historic access rule).'),
    ('application_management','review','Review Application','Review an application (historic access rule).'),
    ('compliance_management','export','Export Compliance Data','Export compliance records and audit extracts.'),
    ('correspondence_management','approve','Approve Correspondence','Approve outbound correspondence before dispatch (historic access rule).'),
    ('correspondence_management','edit','Edit Correspondence','Edit correspondence drafts (historic access rule).'),
    ('correspondence_management','export','Export Correspondence','Export correspondence records.'),
    ('employee_management','view','View Employees','Read internal employee records (historic access rule).'),
    ('fit_and_proper','view_confidential','View Confidential F&P Data','Read confidential fit and proper material (historic access rule).'),
    ('licensee_management','export','Export Licensees','Export licensee register data.'),
    ('market_conduct','export','Export Conduct Data','Export market-conduct evidence and records.'),
    ('prudential_supervision','export','Export Prudential Data','Export prudential supervision data.'),
    ('report_management','execute','Execute Reports','Trigger scheduled report execution.'),
    ('returns_management','export','Export Returns','Export return filings and data.'),
    ('returns_management','reject','Reject Return','Reject a submitted return (historic access rule).'),
    ('role_management','assign','Assign Roles','Legacy alias for role assignment (historic access rule).'),
    ('role_management','manage_config','Manage Role Configuration','Legacy alias for role catalogue configuration (historic access rule).'),
    ('settings','export','Export Settings Data','Export platform data from settings surfaces.'),
    ('user_management','delete','Delete User','Delete / deprovision an application user.')
)
INSERT INTO public.sec_permissions (module_id, key, label, description, sort_order, is_sensitive, is_enforced, is_system, is_active)
SELECT m.id, w.action_key, w.label, w.description, 500,
       w.action_key IN ('export','view_confidential','delete','assign','manage_config'),
       true, false, true
FROM wanted w
JOIN public.sec_modules m ON m.key = w.module_key
WHERE NOT EXISTS (
  SELECT 1 FROM public.sec_permissions p
  WHERE p.module_id = m.id AND p.key = w.action_key
);