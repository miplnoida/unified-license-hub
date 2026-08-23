delete from public.registrations r
where r.id = 'd4ddee8d-8e5f-4bd3-8c28-95d2231a1ef2';

create unique index if not exists registrations_live_unique_applicant
  on public.registrations (user_id, lower(applicant_name))
  where status not in ('rejected', 'withdrawn', 'cancelled');