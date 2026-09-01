import { describe, it, expect } from 'vitest';

/**
 * Mirrors the `create_application_draft` handoff rule: a registration may be
 * linked to several licence attempts, and only an attempt that is still open
 * for editing is resumed. Closed attempts (withdrawn / rejected / cancelled /
 * approved / submitted-like) must never be handed back to the applicant.
 */
const OPEN_STATUSES = [
  'draft',
  'in_progress',
  'resubmission_requested',
  'resubmission_required',
  'query_raised',
  'returned_for_correction',
  'info_requested',
];

interface LinkedApplication {
  id: string;
  status: string;
  updated_at: string;
}

function resumeOrCreate(linked: LinkedApplication[]): { action: 'resume'; id: string } | { action: 'create_new' } {
  const open = linked
    .filter((a) => OPEN_STATUSES.includes(a.status.toLowerCase()))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  return open ? { action: 'resume', id: open.id } : { action: 'create_new' };
}

describe('registration → licensing handoff re-application', () => {
  it('creates a new attempt when the linked application was withdrawn', () => {
    expect(resumeOrCreate([{ id: 'withdrawn-1', status: 'withdrawn', updated_at: '2026-09-01T07:10:00Z' }]))
      .toEqual({ action: 'create_new' });
  });

  it('creates a new attempt for rejected, cancelled, approved and submitted links', () => {
    for (const status of ['rejected', 'cancelled', 'approved', 'submitted', 'under_review']) {
      expect(resumeOrCreate([{ id: 'x', status, updated_at: '2026-09-01T07:10:00Z' }]))
        .toEqual({ action: 'create_new' });
    }
  });

  it('resumes a genuinely open draft instead of creating a duplicate', () => {
    expect(resumeOrCreate([
      { id: 'withdrawn-1', status: 'withdrawn', updated_at: '2026-09-01T07:10:00Z' },
      { id: 'draft-2', status: 'draft', updated_at: '2026-09-01T10:30:00Z' },
    ])).toEqual({ action: 'resume', id: 'draft-2' });
  });

  it('resumes the most recently updated open attempt', () => {
    expect(resumeOrCreate([
      { id: 'a', status: 'query_raised', updated_at: '2026-08-01T00:00:00Z' },
      { id: 'b', status: 'in_progress', updated_at: '2026-08-20T00:00:00Z' },
    ])).toEqual({ action: 'resume', id: 'b' });
  });
});
