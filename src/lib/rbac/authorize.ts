/**
 * Centralized authorization service (Batch 2 of the RBAC completion plan).
 *
 * Every frontend authorization decision — `useCan`, `GuardedButton`,
 * `PermissionGate`, `ModuleGate`, sidebar visibility, route guards — MUST
 * flow through this module. Ad-hoc `permissions.some(...)` array scans, hard
 * coded role-name comparisons, or bespoke normalization are forbidden and
 * blocked in CI by `scripts/verify-authz-centralized.mjs`.
 *
 * Design goals:
 * - Single decision function; single normalization contract.
 * - Pure (no React, no Supabase): trivially unit-testable and reusable in
 *   node scripts, tests, and any future SSR path.
 * - Explicit `reason` on every decision so audit tooling and tests can
 *   distinguish `bypass`, `match`, `missing`, and `loading` — never a bare
 *   boolean.
 *
 * Backend authority remains `public.has_permission(user, module, action)` in
 * Postgres and `requireUserPermission()` in `supabase/functions/_shared/authz.ts`.
 * This module is the UI mirror of that authority; it does NOT replace it.
 */
export interface UserPermission {
  module: string;
  name: string;
}

export type AuthorizationReason =
  | 'bypass'
  | 'match'
  | 'missing'
  | 'assignment_only_denied'
  | 'loading';

export interface AuthorizationDecision {
  allowed: boolean;
  reason: AuthorizationReason;
}

export interface AuthorizationContext {
  /** Canonicalized permission tuples the user carries. */
  userPermissions: readonly UserPermission[];
  /** True iff caller is `super_admin` (the ONLY bypass role, per hardening). */
  isBypass: boolean;
  /** True iff the caller is an assignment-only regulator (view-only). */
  isAssignmentOnly?: boolean;
  /** True while permissions are still being fetched. */
  isLoading?: boolean;
}

/** Canonical module key: lowercase, whitespace → underscore, trimmed. */
export function normalizeModule(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
}

/** Canonical action key: lowercase, trimmed. */
export function normalizeAction(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

/**
 * The single authorization entry point for `<module>.<action>` decisions.
 *
 * Precedence:
 *   1. `isLoading` → deny with `loading` so guards don't flash content.
 *   2. `isBypass` (super_admin) → allow with `bypass`.
 *   3. `isAssignmentOnly` → deny with `assignment_only_denied`. Assignment
 *      regulators are strictly view-only on their mapped Return Queue and
 *      MUST NOT be granted any action permission, ever.
 *   4. Exact tuple match in `userPermissions` → allow with `match`.
 *   5. Otherwise → deny with `missing`.
 */
export function authorize(
  ctx: AuthorizationContext,
  module: string,
  action: string,
): AuthorizationDecision {
  if (ctx.isLoading) return { allowed: false, reason: 'loading' };
  if (ctx.isBypass) return { allowed: true, reason: 'bypass' };
  if (ctx.isAssignmentOnly) return { allowed: false, reason: 'assignment_only_denied' };

  const moduleKey = normalizeModule(module);
  const actionKey = normalizeAction(action);
  for (const p of ctx.userPermissions) {
    if (p.module === moduleKey && p.name === actionKey) {
      return { allowed: true, reason: 'match' };
    }
  }
  return { allowed: false, reason: 'missing' };
}

/**
 * Module-level access: the user has at least one `view` permission on
 * `module`. Assignment-only regulators are deliberately denied here — their
 * Return Queue exception is a NARROW capability handled elsewhere and never
 * surfaces as generic module access.
 */
export function authorizeModule(
  ctx: AuthorizationContext,
  module: string,
): AuthorizationDecision {
  return authorize(ctx, module, 'view');
}

/**
 * "Does this user have any menu at all?" Used by dashboards to detect a
 * fully locked-out account. Assignment-only regulators are handled by the
 * caller (they see the Return Queue via a separate capability).
 */
export function authorizeAnyView(ctx: AuthorizationContext): AuthorizationDecision {
  if (ctx.isLoading) return { allowed: false, reason: 'loading' };
  if (ctx.isBypass) return { allowed: true, reason: 'bypass' };
  for (const p of ctx.userPermissions) {
    if (p.name === 'view') return { allowed: true, reason: 'match' };
  }
  return { allowed: false, reason: 'missing' };
}

/**
 * Convenience predicate — most call sites only care about the boolean. The
 * decision object remains available via `authorize()` for audit/logging.
 */
export function isAllowed(
  ctx: AuthorizationContext,
  module: string,
  action: string,
): boolean {
  return authorize(ctx, module, action).allowed;
}
