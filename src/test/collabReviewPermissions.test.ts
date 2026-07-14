import { describe, it, expect } from 'vitest';

// Mirror of the perms folding in useCollabReview.ts. Keep in sync.
type Row = {
  role_id: string;
  enabled: boolean;
  can_view: boolean;
  can_comment: boolean;
  can_reply: boolean;
  can_suggest: boolean;
  can_accept: boolean;
  can_reject: boolean;
  can_resolve: boolean;
  can_mark_blocking: boolean;
  block_approval_on_unresolved_blocking: boolean;
};

function fold(rows: Row[], myRoleIds: string[], userRole: string) {
  const myRoleIdSet = new Set(myRoleIds);
  const isPlatformAdmin = userRole === 'super_admin' || userRole === 'admin';
  const mine = rows.filter(r => (myRoleIdSet.has(r.role_id) || isPlatformAdmin) && r.enabled);
  const p = {
    enabled: rows.some(r => r.enabled),
    can_view: false, can_comment: false, can_reply: false, can_suggest: false,
    can_accept: false, can_reject: false, can_resolve: false, can_mark_blocking: false,
    block_on_unresolved: rows.some(r => r.enabled && r.block_approval_on_unresolved_blocking),
  };
  for (const r of mine) {
    p.can_view ||= r.can_view;
    p.can_comment ||= r.can_comment;
    p.can_reply ||= r.can_reply;
    p.can_suggest ||= r.can_suggest;
    p.can_accept ||= r.can_accept;
    p.can_reject ||= r.can_reject;
    p.can_resolve ||= r.can_resolve;
    p.can_mark_blocking ||= r.can_mark_blocking;
  }
  return p;
}

const mkRow = (partial: Partial<Row> & { role_id: string }): Row => ({
  enabled: false, can_view: false, can_comment: false, can_reply: false,
  can_suggest: false, can_accept: false, can_reject: false, can_resolve: false,
  can_mark_blocking: false, block_approval_on_unresolved_blocking: false,
  ...partial,
});

describe('collab review perms folding', () => {
  it('denies comment when user dynamic role is not in step rows and user is not a platform admin', () => {
    const rows = [mkRow({ role_id: 'role-A', enabled: true, can_view: true, can_comment: true })];
    const p = fold(rows, ['role-Z'], 'analyst');
    expect(p.enabled).toBe(true);
    expect(p.can_view).toBe(false);
    expect(p.can_comment).toBe(false);
  });

  it('allows comment when a matching row is enabled and can_comment', () => {
    const rows = [mkRow({ role_id: 'role-A', enabled: true, can_view: true, can_comment: true })];
    const p = fold(rows, ['role-A'], 'analyst');
    expect(p.can_view).toBe(true);
    expect(p.can_comment).toBe(true);
    expect(p.can_mark_blocking).toBe(false);
  });

  it('separates can_comment from can_mark_blocking so a normal comment is allowed without blocking rights', () => {
    const rows = [mkRow({ role_id: 'role-A', enabled: true, can_view: true, can_comment: true, can_mark_blocking: false })];
    const p = fold(rows, ['role-A'], 'analyst');
    expect(p.can_comment).toBe(true);
    expect(p.can_mark_blocking).toBe(false);
  });

  it('platform admin inherits any enabled row on the step', () => {
    const rows = [mkRow({ role_id: 'role-A', enabled: true, can_view: true, can_comment: true })];
    const p = fold(rows, [], 'super_admin');
    expect(p.can_comment).toBe(true);
  });

  it('a row with enabled=false does not grant anything even if can_comment=true (legacy row)', () => {
    // The DB trigger normalises this on write, but the client fold must also be safe.
    const rows = [mkRow({ role_id: 'role-A', enabled: false, can_view: true, can_comment: true })];
    const p = fold(rows, ['role-A'], 'analyst');
    expect(p.can_comment).toBe(false);
  });
});
