# 10 — Security Baseline

## AuthN
- Email + password (bcrypt via Supabase), Google OAuth, temp-password forced change on first login.
- Sessions: JWT in Supabase-managed storage key; auto-refresh enabled.
- Forgot password: 3-step email OTP (per memory).
- Password HIBP check to be enabled via `configure_auth` (`password_hibp_enabled: true`).

## AuthZ
- `user_roles` table (never on `profiles`) with `app_role` enum.
- `has_role(user, role)` SECURITY DEFINER function — used in RLS.
- Dynamic RBAC layered on top for internal staff (`user_dynamic_roles` → `roles` → `role_permissions` → `permissions`).
- **Gap (TD-010)**: `useUserDynamicPermissions` currently grants full access to admins with no dynamic mapping. Must be closed before EPIC 1.

## Row-Level Security
- Every `public.*` table has RLS ON.
- Every table has explicit `GRANT`s to `authenticated`/`service_role`; `anon` only for public tables.
- Policies use `has_role` / `can_current_user_access_licensee` — never inline recursion.

## Server-Side Enforcement
- Application submission gated by edge function (per memory: server-side submission enforcement).
- Payment verification server-side; UI never trusts client-declared payment state.
- Registration via atomic edge function using service role (bypasses RLS for signup only).

## Data Protection
- File uploads ≤ 20 MB; signed URLs ≤ 5 min.
- No PII in logs (enforce via logger scrubber).
- Storage buckets private by default; access via signed URLs.

## Session & Route Guards
- `PortalRoute`, `RouteGuards`, `PermissionGate` present. Coverage audit needed against `permissionRegistry`.

## Rate Limiting / Abuse
- OTP verifications table exists; rate-limit at EF layer needed (P1).

## Secrets
- All secrets injected via Lovable Cloud secret manager. No `.env` mutations. Never echo `SUPABASE_SERVICE_ROLE_KEY`.

## Threat Model (headline items)
| Threat | Mitigation | Status |
|--------|------------|--------|
| Privilege escalation via dynamic role gap | Enforce mapping for all non-super-admin | Open (TD-010) |
| Insecure direct object reference | RLS + `can_current_user_access_licensee` | Enforced |
| CSRF | SPA + JWT bearer; no cookie session | N/A |
| XSS in form calculations | `safeEval` arithmetic parser (per memory) | Enforced |
| Audit bypass via ad-hoc exports | Central export audit facade | Open (TD-006) |
| Secret leakage in logs | Logger scrubber + no `console.*` outside logger | Open (TD-003) |
| Supply-chain (npm) | Dependabot + CI audit | Partially |

## Compliance Hooks
- Data residency: single Supabase region — document in DR plan.
- Right-to-be-forgotten: needs a documented procedure per table.
- Audit export request: single query against `audit_events_v` once unified (§09).
