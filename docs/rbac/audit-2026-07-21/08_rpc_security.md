# 08 · RPC / Function Security

Evidence: [`rpc-functions.tsv`](./rpc-functions.tsv) — 381 rows, columns:
`proname`, `prosecdef`, `pins_search_path`, `uses_has_permission`, `acl`.

Re-run:

```sql
SELECT p.proname, p.prosecdef,
       (p.proconfig::text ILIKE '%search_path=%') AS pins_search_path,
       (pg_get_functiondef(p.oid) ILIKE '%has_permission%') AS uses_has_permission,
       array_to_string(p.proacl,'|') AS acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
ORDER BY p.prosecdef DESC, p.proname;
```

## Numbers

| Metric | Value |
|--------|-------|
| Functions in `public` | 381 |
| `SECURITY DEFINER` | 294 |
| DEFINER + pins `search_path` | 288 |
| **DEFINER missing `search_path`** | **6** |
| **DEFINER composing with `has_permission`** | **4** |

## Findings

| Severity | Function set | Issue | Recommendation |
|----------|--------------|-------|----------------|
| **Critical** | The 6 DEFINER functions with no pinned `search_path` | Schema-hijack risk: a malicious `search_path` on the invoking session can redirect an unqualified reference inside the function body. | Add `SET search_path = public` (or `public, extensions`) in every function. See `supabase--linter` output for the exact list. |
| **Critical** | The 290 DEFINER functions **not** composing with `has_permission` | These run bypassing RLS. Legacy checks (`has_role`, `profiles.role`) are used inconsistently. Anyone who can `EXECUTE` the function inherits admin-equivalent power. | Add `IF NOT public.has_permission(auth.uid(), '<module>', '<action>') THEN RAISE EXCEPTION 'permission denied'; END IF;` at the top of every mutating function. Trigger functions are exempt (called by the DB). |
| **High** | Function `EXECUTE` grants | Many DEFINER RPCs are granted to `PUBLIC` or `anon`. Once the body checks `auth.uid()`, an `anon` call sees `NULL` and any check on `has_permission(NULL, …)` returns false — good — but only if the check exists. | Revoke `EXECUTE … FROM PUBLIC` on every DEFINER function and grant only to the roles that need it (`authenticated`, `service_role`). |
| **Medium** | Trigger functions | Do not need `has_permission` (called internally), but must still pin `search_path`. | Same fix as Critical #1. |
| **Info** | `is_super_admin_by_email` breakglass | Keep. Log every truthy return to `security_event_logs`. | No action beyond logging. |

## Suggested guard template

```sql
CREATE OR REPLACE FUNCTION public.<name>(<args>)
RETURNS <ret>
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), '<module>', '<action>') THEN
    RAISE EXCEPTION 'permission denied: <module>.<action>'
      USING ERRCODE = '42501';
  END IF;

  -- body
END;
$$;

REVOKE EXECUTE ON FUNCTION public.<name>(<args>) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.<name>(<args>) TO authenticated;
```
