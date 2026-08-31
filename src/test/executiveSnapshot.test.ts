import { describe, it, expect } from 'vitest';
import {
  KPI_LABELS,
  describeSnapshotScope,
  snapshotMovements,
  type ExecutiveSnapshot,
} from '@/lib/dashboard/executiveSnapshot';
import {
  CONFIDENTIALITY,
  DRAFT_WATERMARK,
  documentIdFor,
  narrativeAllowed,
  type BriefingNarrative,
} from '@/lib/dashboard/executiveBriefingPdf';

const kpis = {
  open_applications: 4,
  total_applications: 12,
  active_licences: 9,
  issued_licences: 9,
  open_breaches: 2,
  current_breaches: 3,
  open_enforcement: 1,
  penalty_total: 50000,
  penalty_collected: 20000,
  penalty_outstanding: 30000,
  upcoming_inspections: 2,
  open_complaints: 5,
  fp_active: 7,
  critical_risk_entities: 1,
  high_risk_entities: 2,
  open_prudential_actions: 3,
  open_prudential_escalations: 0,
  open_conduct_alerts: 1,
  return_filings: 30,
  returns_pending_review: 6,
  returns_overdue: 2,
};

const snapshot = {
  as_of: '2026-09-01T10:00:00Z',
  fingerprint: 'abc123def456789',
  window: { days: 30, since: '2026-08-02T10:00:00Z' },
  filters: { sector_id: null },
  kpis,
  charts: {
    risk_bands: { critical: 1, high: 2, medium: 3, low: 4 },
    application_pipeline: { under_review: 3, submitted: 1 },
    application_sla: { breached: 1, due_soon: 2, unassigned: 0 },
    returns: { sla_breached: 1, overdue: 2, pending_review: 6 },
  },
  unavailable_sources: [],
} as unknown as ExecutiveSnapshot;

describe('executive snapshot contract', () => {
  it('labels every KPI the snapshot exposes, so no figure can render unlabelled', () => {
    for (const key of Object.keys(kpis)) {
      expect(KPI_LABELS[key as keyof typeof kpis]).toBeTruthy();
    }
    expect(Object.keys(KPI_LABELS).sort()).toEqual(Object.keys(kpis).sort());
  });

  it('refuses to invent movement when no prior snapshot exists', () => {
    expect(snapshotMovements(snapshot, null)).toBeNull();
  });

  it('reports movement only for figures that actually changed', () => {
    const movements = snapshotMovements(snapshot, {
      as_of: '2026-08-02T10:00:00Z',
      fingerprint: 'prior',
      kpis: { ...kpis, open_complaints: 2, open_breaches: 2 },
    } as any);
    expect(movements?.map((m) => m.key)).toEqual(['open_complaints']);
    expect(movements?.[0]).toMatchObject({ current: 5, previous: 2, delta: 3 });
  });

  it('states the scope and window applied to the figures', () => {
    expect(describeSnapshotScope(snapshot)).toBe('all permitted sectors · 30-day window');
  });
});

describe('governed executive briefing export', () => {
  const draft: BriefingNarrative = {
    analysisType: 'executive_briefing',
    insightId: 'i1',
    payload: { summary: 'draft prose' },
    reviewState: 'pending',
  } as BriefingNarrative;

  const approved: BriefingNarrative = {
    ...draft,
    reviewState: 'accepted',
    reviewerId: 'u1',
    reviewedAt: '2026-09-01T11:00:00Z',
  } as BriefingNarrative;

  it('never places narrative in a facts-only export', () => {
    expect(narrativeAllowed('facts', approved)).toBe(false);
    expect(narrativeAllowed('facts', draft)).toBe(false);
  });

  it('only allows an approved pack once a human has adopted the narrative', () => {
    expect(narrativeAllowed('approved', draft)).toBe(false);
    expect(narrativeAllowed('approved', null)).toBe(false);
    expect(narrativeAllowed('approved', approved)).toBe(true);
  });

  it('allows unreviewed narrative only in the draft mode that watermarks it', () => {
    expect(narrativeAllowed('draft', draft)).toBe(true);
    expect(DRAFT_WATERMARK).toMatch(/NOT REVIEWED/);
    expect(CONFIDENTIALITY).toMatch(/SUPERVISORY USE ONLY/);
  });

  it('binds every exported document to the snapshot fingerprint it was built from', () => {
    const id = documentIdFor(snapshot, 'approved');
    expect(id).toContain(snapshot.fingerprint.slice(0, 8).toUpperCase());
    expect(documentIdFor(snapshot, 'facts')).not.toBe(id);
  });
});
