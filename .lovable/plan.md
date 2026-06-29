## Problem

On the Licensee Dashboard, the Renew/Continue Renewal button is decided by a direct query against `applications` from the browser:

```ts
supabase.from('applications').select('id, status, data')
  .in('status', ['draft','in_progress']).eq('data->>is_renewal','true')
```

Row-Level Security on `applications` is the combination of two policies:
- **Read policy** — allows licensee-linked users via `application_ids_for_licensee(user_licensee_id(auth.uid()))`.
- **External capability gate** — for external roles (applicant, pre_licensee, licensee_primary, licensee_secondary) it ANDs an extra check that requires `applicant_id = auth.uid()` OR `external_can_access_application(...)`.

Effect: a **secondary licensee user** (or any external user other than the original applicant) cannot read a renewal application started by another user in the same licensee. The dashboard sees an empty result and falls back to showing **"Renew"**, which is exactly what the user reported.

The earlier "in_progress vs draft" fix was correct but only helped the user who created the row.

## Fix

Add a small security-definer RPC that returns in-flight renewal applications scoped to the caller's licensee membership, and use it from the dashboard / license list places that today hit `applications` directly.

### 1. Migration — new RPC `get_in_flight_renewals(license_ids uuid[])`

- Language SQL, `security definer`, `stable`, `set search_path = public`.
- For the caller (`auth.uid()`), resolve their licensee scope (reuse the existing `user_licensee_id` / `ppoc_mapped_licensee_ids` / `application_ids_for_licensee` helpers, plus the user's own `applicant_id = auth.uid()` rows).
- Return rows `(application_id uuid, license_id uuid, status text, is_pending boolean, is_in_progress boolean)` for any `applications` where:
  - `data->>'is_renewal' = 'true'`
  - `(data->>'renewal_of_license_id')::uuid = ANY(license_ids)`
  - `status IN ('draft','in_progress','submitted','under_review','query_raised','resubmission_requested')`
  - AND the application is in the caller's scope (own + licensee-linked + PPOC-mapped).
- `GRANT EXECUTE ON FUNCTION public.get_in_flight_renewals(uuid[]) TO authenticated;`
- No table grants, no policy changes, no schema changes to `applications`.

### 2. Frontend — call the RPC from three places

Replace the existing direct `applications` queries in the renewal-detection effect:

- `src/components/dashboard/LicenseeDashboard.tsx`
- `src/components/dashboard/cards/LicenseStatusList.tsx` (used by ApplicantDashboard)
- `src/pages/licenses/LicenseDetail.tsx` (the `refreshPendingRenewal` / duplicate-guard fetch — same RLS blind spot, so the duplicate guard fails for secondary users too)

Each call becomes:

```ts
const { data } = await supabase.rpc('get_in_flight_renewals', { license_ids: licenseIds });
// Split rows into pendingRenewalByLicense (submitted/under_review/…) and
// inProgressRenewalByLicense (draft/in_progress) using is_pending / is_in_progress.
```

The downstream button logic (Renewal-in-progress link, Continue Renewal link, Renew fallback) and label constants stay exactly as they are.

### 3. Verification

- Sign in as the primary licensee user → start a renewal → leave it as draft.
- Sign in as a secondary licensee user of the same licensee → open the Licensee Dashboard.
- Expect: license row shows **"Continue Renewal"**, links to `/post-licensee/applications/<id>/forms?service=Renew`.
- On `/licenses/<id>` clicking Renew also reopens the existing form instead of inserting a duplicate row. Confirm no new `applications` row appears in the DB.
- Typecheck + run existing tests.

## Out of scope

No changes to: existing RLS policies, status enum, fee resolution, payment flow, workflow engine, AI assessment, non-renewal applications, or the admin `/admin/fees` UUID issue from earlier turns.
