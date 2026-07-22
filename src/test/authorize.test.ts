import { describe, it, expect } from 'vitest';
import {
  authorize,
  authorizeModule,
  authorizeAnyView,
  isAllowed,
  normalizeModule,
  normalizeAction,
  type AuthorizationContext,
} from '@/lib/rbac/authorize';

const perms = [
  { module: 'application_management', name: 'view' },
  { module: 'application_management', name: 'approve' },
  { module: 'complaint_management', name: 'view' },
];

const base = (over: Partial<AuthorizationContext> = {}): AuthorizationContext => ({
  userPermissions: perms,
  isBypass: false,
  isAssignmentOnly: false,
  isLoading: false,
  ...over,
});

describe('rbac/authorize', () => {
  it('normalizes module and action', () => {
    expect(normalizeModule('  Application Management ')).toBe('application_management');
    expect(normalizeAction(' Approve ')).toBe('approve');
  });

  it('denies during loading', () => {
    const d = authorize(base({ isLoading: true }), 'application_management', 'view');
    expect(d).toEqual({ allowed: false, reason: 'loading' });
  });

  it('allows super_admin bypass', () => {
    const d = authorize(base({ isBypass: true, userPermissions: [] }), 'anything', 'delete');
    expect(d).toEqual({ allowed: true, reason: 'bypass' });
  });

  it('denies assignment-only regulator for every action (no bypass)', () => {
    const d = authorize(
      base({ isAssignmentOnly: true }),
      'application_management',
      'view',
    );
    expect(d).toEqual({ allowed: false, reason: 'assignment_only_denied' });
  });

  it('matches on exact tuple', () => {
    expect(authorize(base(), 'application_management', 'approve').reason).toBe('match');
    expect(isAllowed(base(), 'application_management', 'approve')).toBe(true);
  });

  it('reports missing on unknown tuple', () => {
    expect(authorize(base(), 'application_management', 'delete').reason).toBe('missing');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(isAllowed(base(), ' Application Management ', 'APPROVE')).toBe(true);
  });

  it('authorizeModule requires a view tuple', () => {
    expect(authorizeModule(base(), 'application_management').allowed).toBe(true);
    expect(
      authorizeModule(
        base({ userPermissions: [{ module: 'application_management', name: 'edit' }] }),
        'application_management',
      ).allowed,
    ).toBe(false);
  });

  it('authorizeAnyView bypasses super_admin and finds any view', () => {
    expect(authorizeAnyView(base({ isBypass: true, userPermissions: [] })).allowed).toBe(true);
    expect(authorizeAnyView(base()).allowed).toBe(true);
    expect(
      authorizeAnyView(base({ userPermissions: [{ module: 'x', name: 'edit' }] })).allowed,
    ).toBe(false);
  });

  it('assignment-only wins over match — never grants an action', () => {
    const d = authorize(
      base({ isAssignmentOnly: true, userPermissions: perms }),
      'application_management',
      'approve',
    );
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('assignment_only_denied');
  });

  it('never mutates the input permissions array', () => {
    const arr = [...perms];
    authorize(base({ userPermissions: arr }), 'application_management', 'view');
    expect(arr).toEqual(perms);
  });
});
