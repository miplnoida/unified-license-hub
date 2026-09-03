-- W5-A2: canonical enterprise navigation for the supervisory portfolio
insert into public.sec_navigation_items
  (key, parent_id, label, description, item_type, href_override, icon_key, sort_order, audience,
   is_active, show_in_sidebar, show_in_search, keywords, is_system, admin_only)
select 'nav_sup_portfolio',
       (select id from public.sec_navigation_items where key='grp_nav_supervision'),
       'Portfolio & Sector Supervision',
       'Enterprise supervisory portfolio: entity and sector supervision across all domains.',
       'link', '/supervision/portfolio', 'Building2', 10, 'internal', true, true, true,
       array['portfolio','sector supervision','enterprise supervision','supervisory portfolio','risk distribution','multi-domain'],
       true, false
on conflict (key) do update set
  parent_id = excluded.parent_id, label = excluded.label, description = excluded.description,
  item_type = 'link', href_override = excluded.href_override, icon_key = excluded.icon_key,
  sort_order = excluded.sort_order, audience = 'internal', is_active = true,
  show_in_sidebar = true, show_in_search = true, keywords = excluded.keywords, updated_at = now();

-- Domain discoverability without duplicate sidebar destinations: search-only aliases
insert into public.sec_navigation_items
  (key, parent_id, label, description, item_type, href_override, icon_key, sort_order, audience,
   is_active, show_in_sidebar, show_in_search, keywords, is_system, admin_only)
select v.key,
       (select id from public.sec_navigation_items where key = v.parent_key),
       v.label,
       'Opens the enterprise Portfolio & Sector Supervision page filtered to this domain.',
       'link', v.href, 'Building2', v.sort_order, 'internal', true, false, true,
       array['portfolio','sector supervision','enterprise supervision'], true, false
from (values
  ('nav_sup_prudential_portfolio','nav_sup_prudential','Portfolio & Sector Supervision (Prudential)','/supervision/portfolio?domain=PRUDENTIAL',96),
  ('nav_sup_aml_portfolio','nav_sup_aml','Portfolio & Sector Supervision (AML/CFT)','/supervision/portfolio?domain=AML_CFT',80),
  ('nav_sup_conduct_portfolio','nav_sup_conduct','Portfolio & Sector Supervision (Market Conduct)','/supervision/portfolio?domain=MARKET_CONDUCT',95)
) as v(key, parent_key, label, href, sort_order)
on conflict (key) do update set
  parent_id = excluded.parent_id, label = excluded.label, item_type = 'link',
  href_override = excluded.href_override, sort_order = excluded.sort_order, audience = 'internal',
  is_active = true, show_in_sidebar = false, show_in_search = true, updated_at = now();

-- PFMI discoverability: regulator-clear label for the payment systems oversight surface
update public.sec_navigation_items
   set label = 'Payment Systems & FMI Oversight',
       keywords = array['pfmi','fmi','payment systems','observance','systemically important','incidents','retail payments'],
       updated_at = now()
 where key = 'nav_prudential_supervision_payment_systems';