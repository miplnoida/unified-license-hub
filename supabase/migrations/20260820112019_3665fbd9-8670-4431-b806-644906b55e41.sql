-- RDM-ENTITY-001 Wave C closure: external Returns menu points at the canonical
-- filing workspace; the legacy returns_filed dashboard link is retired.
update public.sec_navigation_items
   set is_active = false, updated_at = now()
 where key = 'nav_returns_management_returns_dashboard';

update public.sec_navigation_items
   set label = 'Returns',
       description = 'Reporting obligations, periods and filings for your organisation',
       href_override = '/entity/returns',
       is_active = true,
       updated_at = now()
 where key = 'nav_returns_management_my_returns';
