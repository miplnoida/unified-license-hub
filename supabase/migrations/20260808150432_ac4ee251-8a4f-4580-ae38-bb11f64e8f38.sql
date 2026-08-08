DELETE FROM public.license_appeal_panel_members m
USING public.license_appeal_panels p
WHERE m.panel_id = p.id AND p.name = 'Panel B';

DELETE FROM public.license_appeal_panels WHERE name = 'Panel B';