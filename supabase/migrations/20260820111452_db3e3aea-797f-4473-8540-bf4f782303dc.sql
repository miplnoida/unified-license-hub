-- RDM-ENTITY-001 Wave C — privacy-safe onboarding resolution tokens (§19)
create table if not exists public.onboarding_resolution_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  purpose text not null check (purpose in ('resolution', 'candidate', 'membership_target')),
  entity_id uuid,
  candidate_id uuid,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour')
);

alter table public.onboarding_resolution_tokens enable row level security;

drop policy if exists onboarding_tokens_own_rows on public.onboarding_resolution_tokens;
create policy onboarding_tokens_own_rows on public.onboarding_resolution_tokens
  for all
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

grant select, insert on public.onboarding_resolution_tokens to authenticated;
grant all on public.onboarding_resolution_tokens to service_role;

create or replace function public.onboarding_mint_token(
  _purpose text,
  _entity_id uuid default null,
  _candidate_id uuid default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _token text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.onboarding_resolution_tokens (purpose, entity_id, candidate_id, created_by)
  values (_purpose, _entity_id, _candidate_id, auth.uid())
  returning token into _token;

  return _token;
end;
$$;

grant execute on function public.onboarding_mint_token(text, uuid, uuid) to authenticated;

create or replace function public.onboarding_resolve_token(
  _token text
) returns table (entity_id uuid, candidate_id uuid, purpose text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
    select t.entity_id, t.candidate_id, t.purpose
    from public.onboarding_resolution_tokens t
    where t.token = _token
      and t.created_by = auth.uid()
      and t.expires_at > now();
end;
$$;

grant execute on function public.onboarding_resolve_token(text) to authenticated;
