/**
 * DCI-01 — cross-screen metric consistency contract.
 *
 * These tests lock the shared "open" predicates so a screen cannot drift back
 * to a hand-written status allow-list (the defect that made the executive
 * dashboard disagree with the work queues).
 */
import { describe, it, expect } from 'vitest';
import {
  COMPLAINT_TERMINAL_STATUSES,
  PRUDENTIAL_ACTION_TERMINAL_STATUSES,
  isOpenComplaint,
  isOpenPrudentialAction,
  isOpenPrudentialEscalation,
  isOverduePrudentialAction,
} from '@/lib/supervision/canonicalStatusPredicates';

describe('canonical open predicates', () => {
  it('treats prudential actions as open unless terminal', () => {
    for (const s of ['open', 'in_progress', 'awaiting_evidence', 'overdue', 'breached']) {
      expect(isOpenPrudentialAction(s)).toBe(true);
    }
    for (const s of PRUDENTIAL_ACTION_TERMINAL_STATUSES) {
      expect(isOpenPrudentialAction(s)).toBe(false);
    }
    expect(isOpenPrudentialAction(null)).toBe(false);
  });

  it('flags only overdue/breached actions as overdue', () => {
    expect(isOverduePrudentialAction('overdue')).toBe(true);
    expect(isOverduePrudentialAction('breached')).toBe(true);
    expect(isOverduePrudentialAction('in_progress')).toBe(false);
  });

  it('matches the canonical escalation open set', () => {
    expect(isOpenPrudentialEscalation('open')).toBe(true);
    expect(isOpenPrudentialEscalation('under_review')).toBe(true);
    expect(isOpenPrudentialEscalation('closed')).toBe(false);
  });

  it('treats complaints as open unless closed/resolved', () => {
    for (const s of ['open', 'investigating', 'under_investigation', 'pending', 'triage', 'escalated']) {
      expect(isOpenComplaint(s)).toBe(true);
    }
    for (const s of COMPLAINT_TERMINAL_STATUSES) {
      expect(isOpenComplaint(s)).toBe(false);
    }
  });

  it('is case and whitespace insensitive', () => {
    expect(isOpenPrudentialAction(' Completed ')).toBe(false);
    expect(isOpenComplaint(' RESOLVED')).toBe(false);
  });
});
