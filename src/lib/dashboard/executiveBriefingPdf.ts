/**
 * EXEC-04 — governed "Export briefing" for the Executive Supervisory Dashboard.
 *
 * The export is never an ungoverned DOM download:
 *   1. `authorizedExport('report_management', 'export', meta)` re-checks the
 *      caller's permission server-side immediately before the file is produced;
 *   2. the PDF is built only from the canonical snapshot the user is already
 *      permitted to see (no extra queries, so no scope expansion);
 *   3. `logExport` writes the export audit record (user, time, format, snapshot
 *      fingerprint, scope/filters, AI insight ids, AI review states, metric
 *      count, document identifier).
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { authorizedExport } from '@/lib/rbac/authorizedExport';
import { logExport } from '@/lib/exportAudit';
import { formatBaseMoney } from '@/lib/money';
import {
  KPI_LABELS,
  describeSnapshotScope,
  type ExecutiveSnapshot,
  type ExecutiveSnapshotComparison,
  type ExecutiveSnapshotKpis,
  type KpiMovement,
} from '@/lib/dashboard/executiveSnapshot';
import type { SupervisoryPayload } from '@/lib/ai/advisoryAi';
import type { ReviewState } from '@/components/dashboard/executive/ExecutiveAiWorkspace';

export type BriefingExportMode = 'facts' | 'draft' | 'approved';

export const DRAFT_WATERMARK = 'DRAFT — AI-ASSISTED CONTENT — NOT REVIEWED';
export const CONFIDENTIALITY = 'CONFIDENTIAL — SUPERVISORY USE ONLY';

export interface BriefingNarrative {
  analysisType: string;
  insightId: string | null;
  payload: SupervisoryPayload | null;
  humanPayload: SupervisoryPayload | null;
  reviewState: ReviewState;
  reviewerId: string | null;
  reviewedAt: string | null;
  generatedAt: string | null;
}

export interface BriefingExportInput {
  mode: BriefingExportMode;
  snapshot: ExecutiveSnapshot;
  comparison: ExecutiveSnapshotComparison | null;
  movements: KpiMovement[] | null;
  narrative?: BriefingNarrative | null;
  regulatorTitle?: string;
}

export interface BriefingExportResult {
  filename: string;
  documentId: string;
  classification: string;
  includedInsightIds: string[];
  reviewStates: string[];
}

const MONEY_KEYS: Array<keyof ExecutiveSnapshotKpis> = [
  'penalty_total',
  'penalty_collected',
  'penalty_outstanding',
];

const SECTION_KEYS: Array<{ title: string; keys: Array<keyof ExecutiveSnapshotKpis> }> = [
  { title: 'Prudential', keys: ['open_breaches', 'current_breaches', 'open_prudential_actions', 'open_prudential_escalations', 'critical_risk_entities', 'high_risk_entities'] },
  { title: 'Licensing and authorisation', keys: ['open_applications', 'total_applications', 'active_licences', 'issued_licences', 'fp_active'] },
  { title: 'Conduct and enforcement', keys: ['open_conduct_alerts', 'open_complaints', 'open_enforcement', 'penalty_total', 'penalty_collected', 'penalty_outstanding', 'upcoming_inspections'] },
  { title: 'Returns', keys: ['return_filings', 'returns_pending_review', 'returns_overdue'] },
];

function fmt(key: keyof ExecutiveSnapshotKpis, value: number): string {
  return MONEY_KEYS.includes(key) ? formatBaseMoney(Number(value || 0)) : String(value ?? 0);
}

/** Only current human-adopted output may be released in an approved pack. */
export function narrativeAllowed(mode: BriefingExportMode, narrative?: BriefingNarrative | null): boolean {
  if (mode === 'facts' || !narrative || !narrative.payload) return false;
  if (mode === 'approved') {
    return narrative.reviewState === 'accepted' || narrative.reviewState === 'modified_accepted';
  }
  return true; // draft pack may carry pending output, watermarked
}

export function documentIdFor(snapshot: ExecutiveSnapshot, mode: BriefingExportMode): string {
  const day = (snapshot.as_of || new Date().toISOString()).slice(0, 10).replace(/-/g, '');
  return `EXB-${day}-${mode.toUpperCase()}-${(snapshot.fingerprint || '').slice(0, 8).toUpperCase()}`;
}

export async function exportExecutiveBriefing(
  input: BriefingExportInput,
): Promise<BriefingExportResult> {
  const { mode, snapshot, comparison, movements } = input;
  const narrative = narrativeAllowed(mode, input.narrative) ? input.narrative! : null;

  if (mode === 'approved' && !narrative) {
    throw new Error(
      'An approved executive pack can only include AI narrative that a reviewer has accepted for the current snapshot.',
    );
  }

  const documentId = documentIdFor(snapshot, mode);
  const kpiKeys = Object.keys(snapshot.kpis) as Array<keyof ExecutiveSnapshotKpis>;
  const insightIds = narrative?.insightId ? [narrative.insightId] : [];
  const reviewStates = narrative ? [narrative.reviewState] : [];

  // 1. Server-side authorisation immediately before producing the file.
  await authorizedExport('report_management', 'export', {
    surface: 'executive_supervisory_briefing',
    mode,
    document_id: documentId,
    snapshot_fingerprint: snapshot.fingerprint,
    snapshot_as_of: snapshot.as_of,
    scope: snapshot.scope,
    filters: snapshot.filters,
    ai_insight_ids: insightIds,
    ai_review_states: reviewStates,
    metric_count: kpiKeys.length,
  });

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const generatedAt = new Date().toISOString();
  const needsWatermark = mode === 'draft' && narrative?.reviewState !== 'accepted' && narrative?.reviewState !== 'modified_accepted';

  doc.setFontSize(16);
  doc.text(input.regulatorTitle ?? 'Financial Services Regulatory Authority', 40, 50);
  doc.setFontSize(13);
  doc.text('Executive Supervisory Briefing', 40, 70);
  doc.setFontSize(9);
  doc.text(
    [
      `Document: ${documentId}`,
      `Generated: ${generatedAt}`,
      `Figures as of: ${snapshot.as_of}`,
      `Scope: ${describeSnapshotScope(snapshot)}`,
      `Filters: sector=${snapshot.filters?.sector_id ?? 'all permitted'}; window=${snapshot.window?.days ?? 30} days`,
      `Snapshot fingerprint: ${snapshot.fingerprint}`,
      CONFIDENTIALITY,
    ].join('\n'),
    40,
    90,
  );

  let cursor = 190;

  autoTable(doc, {
    startY: cursor,
    head: [['Recorded fact (system-calculated)', 'Value']],
    body: kpiKeys.map((k) => [KPI_LABELS[k], fmt(k, Number(snapshot.kpis[k]))]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 58, 138] },
  });
  cursor = (doc as any).lastAutoTable.finalY + 20;

  // Risk distribution
  autoTable(doc, {
    startY: cursor,
    head: [['Risk band (current ratings only)', 'Entities']],
    body: Object.entries(snapshot.charts?.risk_bands ?? {}).map(([b, n]) => [b, String(n)]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 58, 138] },
  });
  cursor = (doc as any).lastAutoTable.finalY + 20;

  // Application pipeline
  autoTable(doc, {
    startY: cursor,
    head: [['Application pipeline stage', 'Open cases']],
    body: Object.entries(snapshot.charts?.application_pipeline ?? {}).map(([s, n]) => [
      s.replace(/_/g, ' '),
      String(n),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 58, 138] },
  });
  cursor = (doc as any).lastAutoTable.finalY + 20;

  // Domain sections
  for (const section of SECTION_KEYS) {
    autoTable(doc, {
      startY: cursor,
      head: [[section.title, 'Value']],
      body: section.keys.map((k) => [KPI_LABELS[k], fmt(k, Number(snapshot.kpis[k]))]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 138] },
    });
    cursor = (doc as any).lastAutoTable.finalY + 16;
  }

  // Deterministic movement (only from two real snapshots)
  autoTable(doc, {
    startY: cursor,
    head: [['Movement since previous snapshot', 'Previous', 'Current', 'Change']],
    body: comparison && movements?.length
      ? movements.map((m) => [KPI_LABELS[m.key], String(m.previous), String(m.current), `${m.delta > 0 ? '+' : ''}${m.delta}`])
      : [['Comparison unavailable — no second comparable canonical snapshot', '—', '—', '—']],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [217, 119, 6] },
  });
  cursor = (doc as any).lastAutoTable.finalY + 20;

  if (narrative?.payload) {
    const shown =
      narrative.reviewState === 'modified_accepted' && narrative.humanPayload
        ? narrative.humanPayload
        : narrative.payload;
    doc.addPage();
    doc.setFontSize(12);
    doc.text('AI-assisted narrative (advisory — not a regulatory decision)', 40, 50);
    doc.setFontSize(9);
    const lines = [
      `Analysis: ${narrative.analysisType}`,
      `AI review state: ${narrative.reviewState}`,
      narrative.reviewedAt ? `Reviewed at: ${narrative.reviewedAt}` : 'Reviewed at: not reviewed',
      narrative.reviewerId ? `Reviewer: ${narrative.reviewerId}` : 'Reviewer: none recorded',
      `Produced: ${narrative.generatedAt ?? 'unknown'}`,
      `Written over snapshot: ${snapshot.fingerprint}`,
    ];
    doc.text(lines.join('\n'), 40, 70);
    const body = doc.splitTextToSize(String(shown?.summary ?? '—'), pageWidth - 80);
    doc.text(body, 40, 160);

    let y = 160 + body.length * 12 + 16;
    for (const s of shown?.draft_sections ?? []) {
      const chunk = doc.splitTextToSize(`${s.heading}: ${s.text}`, pageWidth - 80);
      if (y + chunk.length * 12 > 760) {
        doc.addPage();
        y = 60;
      }
      doc.text(chunk, 40, y);
      y += chunk.length * 12 + 10;
    }

    const limits = shown?.limitations ?? [];
    if (limits.length) {
      if (y > 700) {
        doc.addPage();
        y = 60;
      }
      doc.text(['Limitations:', ...limits.map((l) => `- ${l}`)].join('\n'), 40, y);
    }
  }

  // Provenance appendix
  doc.addPage();
  doc.setFontSize(12);
  doc.text('Source and provenance appendix', 40, 50);
  autoTable(doc, {
    startY: 70,
    head: [['Figure group', 'Canonical source']],
    body: Object.entries(snapshot.sources ?? {}).map(([k, v]) => [k.replace(/_/g, ' '), v]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 58, 138] },
  });
  const appendixEnd = (doc as any).lastAutoTable.finalY + 16;
  doc.setFontSize(8);
  doc.text(
    [
      `Snapshot version: ${snapshot.snapshot_version}`,
      `Unavailable sources: ${(snapshot.unavailable_sources ?? []).join(', ') || 'none'}`,
      'All figures are calculated by the platform from the canonical sources listed above.',
      'AI content is advisory narrative only and creates no supervisory action, priority or decision.',
    ].join('\n'),
    40,
    appendixEnd,
  );

  // Footers, confidentiality and the draft watermark on every relevant page.
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.text(`${documentId}  ·  ${CONFIDENTIALITY}  ·  Page ${p} of ${total}`, 40, doc.internal.pageSize.getHeight() - 20);
    if (needsWatermark) {
      doc.setFontSize(11);
      doc.setTextColor(190, 30, 45);
      doc.text(DRAFT_WATERMARK, 40, 32);
      doc.setTextColor(0, 0, 0);
    }
  }

  const filename = `${documentId}.pdf`;
  doc.save(filename);

  // 3. Export audit record.
  await logExport({
    dataset: 'executive_supervisory_briefing',
    format: 'pdf',
    rowCount: kpiKeys.length,
    moduleKey: 'report_management',
    justification: `Executive supervisory briefing export (${mode}) over snapshot ${snapshot.fingerprint}`,
    filters: {
      mode,
      document_id: documentId,
      snapshot_fingerprint: snapshot.fingerprint,
      snapshot_as_of: snapshot.as_of,
      scope: snapshot.scope,
      filters: snapshot.filters,
      ai_insight_ids: insightIds,
      ai_review_states: reviewStates,
      metric_count: kpiKeys.length,
      watermarked_draft: needsWatermark,
    },
    payload: JSON.stringify({ snapshot: snapshot.kpis, insightIds, reviewStates, documentId }),
  });

  return {
    filename,
    documentId,
    classification:
      mode === 'facts'
        ? 'Facts only — no AI content'
        : mode === 'approved'
          ? `Approved executive pack — AI ${narrative?.reviewState}`
          : `Draft AI-assisted briefing — AI ${narrative?.reviewState ?? 'none'}`,
    includedInsightIds: insightIds,
    reviewStates,
  };
}
