/**
 * Supervision Loop Dashboard (MCS-MON-002) — pure helpers.
 *
 * All aggregation happens server-side in the conduct_supervision_* RPCs;
 * this module only shapes RPC output for charts, and builds the printable
 * board-pack conduct report.
 */

export interface LoopFunnel {
  complaints_received: number;
  classified: number;
  investigated: number;
  enforcement: number;
  compliance: number;
  closed: number;
  monitoring: number;
  recurrences: number;
}

export interface LoopEffectiveness {
  time_to_enforcement_avg_days: number | null;
  time_to_enforcement_min_days: number | null;
  time_to_enforcement_max_days: number | null;
  time_to_compliance_avg_days: number | null;
  interventions: number;
  pre_intervention_avg: number | null;
  post_intervention_avg: number | null;
  improved_interventions: number;
  recurrence_rate: number;
}

export interface LoopSummary {
  entity_count: number;
  funnel: LoopFunnel;
  severity_mix: Record<string, number>;
  effectiveness: LoopEffectiveness;
  period: { from: string; to: string };
}

export interface LoopCase {
  id: string;
  ref: string | null;
  title: string | null;
  status: string | null;
  severity: string | null;
  entity: string | null;
  occurred_at: string;
  kind: string;
  href: string | null;
}

export interface TimelineEvent {
  kind: 'complaint' | 'investigation' | 'enforcement' | 'monitoring' | 'annotation';
  id: string;
  ref: string | null;
  label: string | null;
  severity: string | null;
  status: string | null;
  occurred_at: string;
  ended_at: string | null;
  note?: string | null;
  href: string | null;
}

export interface UnresolvedRisk {
  reason_code: string;
  reason: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  entity: string | null;
  entity_id: string;
  target_href: string;
  occurred_at: string | null;
}

export interface LearningItem {
  source: 'thematic_review' | 'investigation';
  id: string;
  ref: string | null;
  title: string | null;
  learning: string;
  occurred_at: string | null;
  href: string;
}

export const STAGES: { key: keyof LoopFunnel; label: string }[] = [
  { key: 'complaints_received', label: 'Complaints Received' },
  { key: 'classified', label: 'Classified' },
  { key: 'investigated', label: 'Investigated' },
  { key: 'enforcement', label: 'Enforcement Actions' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'closed', label: 'Closed' },
  { key: 'monitoring', label: 'Recurrence Monitoring' },
  { key: 'recurrences', label: 'Recurrences Detected' },
];

export const EMPTY_SUMMARY: LoopSummary = {
  entity_count: 0,
  funnel: {
    complaints_received: 0, classified: 0, investigated: 0, enforcement: 0,
    compliance: 0, closed: 0, monitoring: 0, recurrences: 0,
  },
  severity_mix: {},
  effectiveness: {
    time_to_enforcement_avg_days: null,
    time_to_enforcement_min_days: null,
    time_to_enforcement_max_days: null,
    time_to_compliance_avg_days: null,
    interventions: 0,
    pre_intervention_avg: null,
    post_intervention_avg: null,
    improved_interventions: 0,
    recurrence_rate: 0,
  },
  period: { from: '', to: '' },
};

/** Recharts Sankey input derived from the funnel counts. */
export function buildSankeyData(funnel: LoopFunnel) {
  const nodes = STAGES.map((s) => ({ name: s.label, stageKey: s.key, value: funnel[s.key] ?? 0 }));
  const links: { source: number; target: number; value: number }[] = [];
  for (let i = 0; i < STAGES.length - 1; i++) {
    // Sankey requires strictly positive link values; keep a hairline link so the
    // full supervision cycle stays visible even where a stage has no volume yet.
    const v = Math.max(funnel[STAGES[i + 1].key] ?? 0, 0);
    links.push({ source: i, target: i + 1, value: v > 0 ? v : 0.001 });
  }
  return { nodes, links };
}

/** Percentage change from pre- to post-intervention complaint volume. */
export function interventionDelta(e: LoopEffectiveness): number | null {
  const pre = e.pre_intervention_avg;
  const post = e.post_intervention_avg;
  if (pre === null || post === null || pre === 0) return null;
  return Math.round(((post - pre) / pre) * 1000) / 10;
}

/** Conversion rate between two funnel stages, guarded against divide-by-zero. */
export function stageRate(funnel: LoopFunnel, from: keyof LoopFunnel, to: keyof LoopFunnel): number | null {
  const a = funnel[from] ?? 0;
  if (!a) return null;
  return Math.round(((funnel[to] ?? 0) / a) * 1000) / 10;
}

/** Chronological merge/sort of timeline events, oldest first, stable by kind. */
export function sortTimeline(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => {
    const d = new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime();
    if (d !== 0) return d;
    return a.kind.localeCompare(b.kind);
  });
}

/** Group timeline events by year for banded rendering. */
export function groupTimelineByYear(events: TimelineEvent[]): { year: string; events: TimelineEvent[] }[] {
  const map = new Map<string, TimelineEvent[]>();
  for (const e of sortTimeline(events)) {
    const y = new Date(e.occurred_at).getFullYear().toString();
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push(e);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([year, evts]) => ({ year, events: evts }));
}

export function periodRange(preset: '6m' | '12m' | '24m', today = new Date()) {
  const months = preset === '6m' ? 6 : preset === '12m' ? 12 : 24;
  const from = new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
  return { from: iso(from), to: iso(today) };
}

export function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtNum(v: number | null | undefined, suffix = ''): string {
  if (v === null || v === undefined) return '—';
  return `${v}${suffix}`;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}

/** Full conduct report HTML (board pack). Printable / saveable as PDF. */
export function buildSupervisionLoopHtml(opts: {
  entityName: string;
  summary: LoopSummary;
  timeline: TimelineEvent[];
  risks: UnresolvedRisk[];
  learning: LearningItem[];
  generatedBy?: string;
}): string {
  const { entityName, summary, timeline, risks, learning } = opts;
  const f = summary.funnel;
  const e = summary.effectiveness;
  const delta = interventionDelta(e);

  const row = (k: string, v: string) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`;

  return `<!doctype html><html><head><meta charset="utf-8" />
<title>Conduct Supervision Report — ${esc(entityName)}</title>
<style>
  body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a;margin:32px;font-size:12px}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:22px 0 8px;border-bottom:2px solid #1E3A8A;padding-bottom:4px;color:#1E3A8A}
  .meta{color:#475569;font-size:11px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:left;vertical-align:top}
  th{background:#f1f5f9;font-weight:600}
  .kpi{display:flex;flex-wrap:wrap;gap:8px}
  .kpi div{border:1px solid #cbd5e1;border-radius:6px;padding:8px 10px;min-width:150px}
  .kpi span{display:block;color:#475569;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
  .kpi b{font-size:16px;font-family:'JetBrains Mono',monospace}
  .muted{color:#64748b}
  @media print{body{margin:12mm}}
</style></head><body>
<h1>Conduct Supervision Report</h1>
<div class="meta">${esc(entityName)} &middot; Period ${esc(summary.period.from)} to ${esc(summary.period.to)} &middot; Generated ${esc(new Date().toLocaleString('en-GB'))}${opts.generatedBy ? ` &middot; ${esc(opts.generatedBy)}` : ''}</div>

<h2>Supervision cycle summary</h2>
<table>
${STAGES.map((s) => row(s.label, String(f[s.key] ?? 0))).join('')}
</table>

<h2>Intervention effectiveness</h2>
<div class="kpi">
  <div><span>Interventions</span><b>${e.interventions}</b></div>
  <div><span>Pre-intervention avg complaints</span><b>${fmtNum(e.pre_intervention_avg)}</b></div>
  <div><span>Post-intervention avg complaints</span><b>${fmtNum(e.post_intervention_avg)}</b></div>
  <div><span>Change</span><b>${delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta}%`}</b></div>
  <div><span>Improved interventions</span><b>${e.improved_interventions}</b></div>
  <div><span>Avg time to enforcement</span><b>${fmtNum(e.time_to_enforcement_avg_days, 'd')}</b></div>
  <div><span>Avg time to compliance</span><b>${fmtNum(e.time_to_compliance_avg_days, 'd')}</b></div>
  <div><span>Recurrence rate</span><b>${e.recurrence_rate}%</b></div>
</div>

<h2>Conduct timeline (${timeline.length} events)</h2>
<table><tr><th>Date</th><th>Type</th><th>Reference</th><th>Detail</th><th>Status</th></tr>
${timeline.length === 0 ? '<tr><td colspan="5" class="muted">No events in period.</td></tr>' : sortTimeline(timeline).map((t) => `<tr><td>${esc(fmtDate(t.occurred_at))}</td><td>${esc(t.kind)}</td><td>${esc(t.ref ?? '—')}</td><td>${esc(t.label ?? '')}${t.note ? ` — ${esc(t.note)}` : ''}</td><td>${esc(t.status ?? '—')}</td></tr>`).join('')}
</table>

<h2>Unresolved supervisory risks (${risks.length})</h2>
<table><tr><th>Severity</th><th>Entity</th><th>Issue</th><th>Since</th></tr>
${risks.length === 0 ? '<tr><td colspan="4" class="muted">No unresolved risks.</td></tr>' : risks.map((r) => `<tr><td>${esc(r.severity)}</td><td>${esc(r.entity ?? '—')}</td><td>${esc(r.reason)}</td><td>${esc(fmtDate(r.occurred_at))}</td></tr>`).join('')}
</table>

<h2>Regulatory learning (${learning.length})</h2>
${learning.length === 0 ? '<p class="muted">No regulatory learning recorded.</p>' : learning.map((l) => `<p><b>${esc(l.ref ?? '')} — ${esc(l.title ?? '')}</b> <span class="muted">(${esc(l.source === 'thematic_review' ? 'Thematic review' : 'Investigation')}, ${esc(fmtDate(l.occurred_at))})</span><br/>${esc(l.learning)}</p>`).join('')}
</body></html>`;
}

export function printSupervisionReport(html: string) {
  const w = window.open('', '_blank', 'width=1100,height=800');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
  return true;
}
