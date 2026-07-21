# Edge Function Authorization

Every edge function under `supabase/functions/*/index.ts` MUST declare one
authorization kind. The CI script `scripts/verify-edge-authz.mjs` fails the
build when a function has none of the required markers.

## Kinds

| Kind | Marker | Purpose |
|------|--------|---------|
| `user` | `requireUserPermission(req, module, action, scope?)` | User-invoked; JWT + `has_permission(user, module, action)` enforced. Optional per-record scope for cross-tenant isolation. |
| `worker` | `requireWorkerInvocation(req)` | Scheduler / sweep / background job. Accepts `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (pg_cron) or `x-worker-token: <WORKER_INVOKE_TOKEN>` (ad-hoc admin invoke). |
| `public` | `markPublicFunction(reason)` | Explicitly public endpoint (OTP dispatch, public registry, developer-API path). The reason is required and documented. |
| `api_key` | (function-specific) | External developer API using its own bearer key path. Documented in the map with kind=`api_key`. |

## Where the map lives

The authoritative table is
[`docs/rbac/edge-function-permission-map.tsv`](edge-function-permission-map.tsv).
It lists every function with its kind, module, action, and scope. When adding
a new function:

1. Choose a kind and drop the corresponding marker in `index.ts`.
2. Add a row to the TSV in the same PR.
3. Run `node scripts/verify-edge-authz.mjs` locally — CI runs it too.

## User-invoked functions

```ts
import { requireUserPermission } from '../_shared/authz.ts';

const gate = await requireUserPermission(req, 'application_management', 'edit', {
  recordId: applicationId, // optional scope: RLS-enforced record lookup
});
if (!gate.ok) return gate.response;   // 401 or 403 with sanitized body
const { userId, adminClient, authClient } = gate;
```

`requireUserPermission` never trusts caller-supplied user ids. `userId` comes
from `getClaims()` on the bearer token. `has_permission` is the single
authority (Slice 1 catalog).

## Worker functions

```ts
import { requireWorkerInvocation } from '../_shared/workerAuth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const gate = requireWorkerInvocation(req);
  if (!gate.ok) return gate.response;
  // ... sweep logic ...
});
```

- pg_cron continues to invoke workers with the service-role bearer it
  already uses; no config change required.
- To invoke a worker manually (Ops, on-call), pass
  `x-worker-token: <WORKER_INVOKE_TOKEN>`. That secret is generated at
  project setup and rotates via `secrets--rotate` (not surfaced to end
  users).

## Public functions

```ts
import { markPublicFunction } from '../_shared/publicFunction.ts';
markPublicFunction('Public OTP dispatch for registration flow');
```

The reason string is required so audit reviewers see intent at a glance.

## Testing

The Deno test suite under `supabase/functions/*/*_test.ts` covers the
highest-risk mutating endpoints for the standard 401/403/200 triad. Run:

```
supabase--test_edge_functions
```

## Failure modes / observability

- Missing marker → `verify-edge-authz.mjs` fails CI.
- 401 → missing/invalid bearer.
- 403 → JWT valid but `has_permission` returned false, or scope enforcement
  denied the record.
- Function-level errors are logged via `logSecurityEvent` where appropriate;
  never surface RPC/SQL error strings to callers.
