import { describe, it, expect } from 'vitest';
import { mainNavSections } from '@/config/navigation';
import { INTERNAL_ROLES } from '@/types/platform';

/**
 * Regression guard: the three admin-navigation entries listed below are the
 * ones users flagged as broken when we relied on a hard-coded
 * `[super_admin, admin]` audience. They MUST stay gated by a dynamic
 * permission module (and, in the case of Permission Coverage, the exact
 * `view_coverage` action) so any internal user with the appropriate role
 * template sees them — without hand-editing the sidebar.
 *
 * A future change that reverts either the module or the audience will fail
 * this test in CI before it reaches production.
 */
type Item = ReturnType<typeof findItem>;

function findItem(label: string) {
  for (const s of mainNavSections) {
    for (const it of s.items) {
      if (it.label === label) return it;
    }
  }
  throw new Error(`Nav item not found: ${label}`);
}

function expectInternalAudience(item: Item) {
  // Every INTERNAL_ROLE must be able to reach the item if their dynamic role
  // grants the required permission. If the item lists only a subset of
  // internal roles, non-listed internal roles are silently invisible.
  for (const role of INTERNAL_ROLES) {
    expect(item.roles).toContain(role);
  }
}

describe('Admin navigation is gated dynamically (no static admin-only lockouts)', () => {
  it('Admin Control Panel is gated on admin_dashboard for all internal roles', () => {
    const item = findItem('Admin Control Panel');
    expect(item.module).toBe('admin_dashboard');
    expect(item.adminOnly).toBe(true);
    expectInternalAudience(item);
  });

  it('Role Management is gated on role_management for all internal roles', () => {
    const item = findItem('Role Management');
    expect(item.module).toBe('role_management');
    expect(item.adminOnly).toBe(true);
    expectInternalAudience(item);
  });

  it('Permission Coverage is gated on the exact view_coverage action', () => {
    const item = findItem('Permission Coverage');
    expect(item.module).toBe('role_management');
    expect(item.requiredAction).toBe('view_coverage');
    expect(item.adminOnly).toBe(true);
    expectInternalAudience(item);
  });
});
