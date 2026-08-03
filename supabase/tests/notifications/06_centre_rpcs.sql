-- NOT-CEN-001: Notification Centre RPC surface
begin;
select plan(11);

-- Functions exist ---------------------------------------------------------
select has_function('public', 'notification_feed');
select has_function('public', 'notification_delivery_for');
select has_function('public', 'notification_export');
select has_function('public', 'notification_forward');
select has_function('public', 'notification_history');

-- All are SECURITY DEFINER with a pinned search_path -----------------------
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('notification_feed', 'notification_delivery_for',
                        'notification_export', 'notification_forward',
                        'notification_history')
      and p.prosecdef
      and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path%'),
  5,
  'all notification centre RPCs are SECURITY DEFINER with a pinned search_path'
);

-- anon must not be able to execute any of them -----------------------------
select ok(
  not has_function_privilege('anon', p.oid, 'EXECUTE'),
  'anon cannot execute ' || p.proname
)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('notification_feed', 'notification_delivery_for',
                    'notification_export', 'notification_forward',
                    'notification_history');

select finish();
rollback;
