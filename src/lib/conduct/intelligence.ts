import { formatMoney as canonicalFormatMoney } from '@/lib/money';
/**
 * Conduct Intelligence — Published Reports (MCS-ANA-003).
 *
 * Section catalogue, metric shaping and export helpers. All persistence and
 * authorisation happens server-side through the conduct_intel_* RPCs; this
 * module only shapes what the builder and the printable report render.
 */

export type IntelligenceStatus =
  | 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'published' | 'superseded';

export interface SectionDef {
  key: string;
  label: string;
  /** Metric block in the aggregated payload this section narrates, if any. */
  metricKey?: string;
  hint: string;
}

export const SECTION_CATALOGUE: SectionDef[] = [
  {
    key: 'executive_summary',
    label: 'Executive Summary',
    hint: 'Mandatory. Summarise the period for executive readers — this must be completed before approval.',
  },
  {
    key: 'complaint_volume',
    label: 'Complaint Volume Analysis',
    metricKey: 'complaint_volume',
    hint: 'Explain the movement in complaint volumes, resolution rates and SLA performance.',
  },
  {
    key: 'top_issues',
    label: 'Top Conduct Issues',
    metricKey: 'top_issues',
    hint: 'Comment on the dominant risk categories, products, channels and entities.',
  },
  {
    key: 'pattern_alerts',
    label: 'Pattern Alerts Summary',
    metricKey: 'pattern_alerts',
    hint: 'Describe the alerts raised in the period and how they were dispositioned.',
  },
  {
    key: 'thematic_reviews',
    label: 'Thematic Review Outcomes',
    metricKey: 'thematic_reviews',
    hint: 'Summarise thematic reviews concluded in the period and their key findings.',
  },
  {
    key: 'enforcement',
    label: 'Enforcement Actions',
    metricKey: 'enforcement',
    hint: 'Set out enforcement activity, outcomes and penalties.',
  },
  {
    key: 'emerging_risks',
    label: 'Emerging Risks',
    hint: 'Forward-looking conduct risks the sector should be alert to.',
  },
  {
    key: 'recommendations',
    label: 'Recommendations',
    hint: 'Supervisory expectations and recommended actions for regulated entities.',
  },
];

export const SECTION_LABEL: Record<string, string> = SECTION_CATALOGUE.reduce(
  (acc, s) => ({ ...acc, [s.key]: s.label }), {},
);

export function sectionDef(key: string): SectionDef {
  return SECTION_CATALOGUE.find((s) => s.key === key)
    ?? { key, label: key.replace(/_/g, ' '), hint: '' };
}

export interface TemplateRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sections: { key: string; label: string }[];
  recommended_period_days: number;
  is_active: boolean;
  sort_order: number;
}

export interface SectionValue { narrative?: string }
export type SectionMap = Record<string, SectionValue>;

export interface ReportRow {
  id: string;
  template_id: string | null;
  template_code: string;
  title: string;
  period_start: string;
  period_end: string;
  regulator_id: string | null;
  sector_id: string | null;
  status: IntelligenceStatus;
  current_version: number;
  publish_to_sector: boolean;
  submitted_at: string | null;
  submitted_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  published_at: string | null;
  published_by: string | null;
  supersedes_report_id: string | null;
  superseded_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VersionRow {
  id: string;
  report_id: string;
  version: number;
  sections: SectionMap;
  metrics: Record<string, any>;
  ai_draft: Record<string, string>;
  change_note: string | null;
  generated_by: string | null;
  created_at: string;
}

export const STATUS_LABEL: Record<IntelligenceStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  published: 'Published',
  superseded: 'Superseded',
};

export const STATUS_VARIANT: Record<IntelligenceStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  pending_approval: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  published: 'default',
  superseded: 'outline',
};

/** Executive Summary must carry narrative text before approval (FRD validation). */
export function executiveSummaryComplete(sections: SectionMap | undefined | null): boolean {
  return Boolean((sections?.executive_summary?.narrative ?? '').trim());
}

export function missingRequiredSections(sections: SectionMap | undefined | null): string[] {
  return executiveSummaryComplete(sections) ? [] : ['Executive Summary'];
}

export function sectionKeys(template: TemplateRow | undefined, sections: SectionMap | undefined): string[] {
  const fromTemplate = (template?.sections || []).map((s) => s.key);
  const fromSections = Object.keys(sections || {});
  const merged = fromTemplate.length ? fromTemplate : fromSections;
  const ordered = SECTION_CATALOGUE.map((s) => s.key).filter((k) => merged.includes(k));
  const extras = merged.filter((k) => !ordered.includes(k));
  return [...ordered, ...extras];
}

export function periodForTemplate(template: TemplateRow | undefined, today = new Date()) {
  const days = template?.recommended_period_days ?? 30;
  const end = new Date(today);
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/* ------------------------------------------------------------------ */
/* Metric shaping                                                      */
/* ------------------------------------------------------------------ */

export interface MetricStat { label: string; value: string }
export interface MetricSeries { label: string; rows: { label: string; count: number }[] }

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

function fromObject(obj: any): { label: string; count: number }[] {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj).map(([label, count]) => ({ label, count: num(count) }))
    .sort((a, b) => b.count - a.count);
}

function fromArray(arr: any): { label: string; count: number }[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((r: any) => ({ label: String(r?.label ?? r?.bucket ?? '—'), count: num(r?.count) }));
}

export function sectionMetrics(metricKey: string | undefined, metrics: Record<string, any> | undefined) {
  const stats: MetricStat[] = [];
  const series: MetricSeries[] = [];
  const notes: string[] = [];
  const m = metricKey ? metrics?.[metricKey] : undefined;
  if (!metricKey || !m) return { stats, series, notes };

  if (metricKey === 'complaint_volume') {
    stats.push(
      { label: 'Complaints received', value: String(num(m.total)) },
      { label: 'Resolved', value: String(num(m.resolved)) },
      { label: 'Still open', value: String(num(m.open)) },
      { label: 'SLA breached', value: String(num(m.sla_breached)) },
      { label: 'Vulnerable customers', value: String(num(m.vulnerable)) },
      { label: 'Repeat complaints', value: String(num(m.repeat)) },
    );
    series.push({ label: 'By severity', rows: fromObject(m.by_severity) });
    series.push({ label: 'By month', rows: fromArray(m.by_month) });
  } else if (metricKey === 'top_issues') {
    series.push({ label: 'By risk category', rows: fromArray(m.by_category) });
    series.push({ label: 'By product', rows: fromArray(m.by_product) });
    series.push({ label: 'By channel', rows: fromArray(m.by_channel) });
    series.push({ label: 'By entity', rows: fromArray(m.by_entity) });
  } else if (metricKey === 'pattern_alerts') {
    stats.push(
      { label: 'Alerts raised', value: String(num(m.total)) },
      { label: 'Open', value: String(num(m.open)) },
      { label: 'Closed / dismissed', value: String(num(m.closed)) },
    );
    series.push({ label: 'By severity', rows: fromObject(m.by_severity) });
    series.push({ label: 'By type', rows: fromArray(m.by_kind) });
  } else if (metricKey === 'thematic_reviews') {
    stats.push({ label: 'Reviews concluded', value: String(num(m.closed)) });
    (Array.isArray(m.items) ? m.items : []).forEach((it: any) => {
      notes.push(`${it.code ? `[${it.code}] ` : ''}${it.title || 'Review'} — ${num(it.findings)} finding(s)${it.summary ? `: ${it.summary}` : ''}`);
    });
  } else if (metricKey === 'enforcement') {
    stats.push(
      { label: 'Actions opened', value: String(num(m.total)) },
      { label: 'Penalties imposed', value: formatMoney(num(m.penalty_total), m.penalty_currency ?? null) },
    );
    series.push({ label: 'By type', rows: fromArray(m.by_type) });
    series.push({ label: 'By status', rows: fromObject(m.by_status) });
  }

  return { stats, series: series.filter((s) => s.rows.length > 0), notes };
}

/**
 * F6-X: there is no default currency. An amount without an authoritative
 * currency is presented as unavailable, never assumed.
 */
export function formatMoney(v: number, currency: string | null | undefined) {
  return canonicalFormatMoney(v, currency ?? undefined);
}

export function formatPeriod(start: string, end: string) {
  const f = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  return `${f(start)} – ${f(end)}`;
}

/* ------------------------------------------------------------------ */
/* Export                                                             */
/* ------------------------------------------------------------------ */

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Builds a self-contained HTML document for the report. Saved with a .doc
 * extension it opens as an editable Word document; printed from the preview it
 * produces the branded PDF.
 */
export function buildReportHtml(opts: {
  report: ReportRow;
  version: VersionRow;
  template?: TemplateRow;
  organisationName?: string;
  logoUrl?: string | null;
}): string {
  const { report, version, template, organisationName, logoUrl } = opts;
  const keys = sectionKeys(template, version.sections);

  const body = keys.map((key) => {
    const def = sectionDef(key);
    const narrative = (version.sections?.[key]?.narrative ?? '').trim();
    const { stats, series, notes } = sectionMetrics(def.metricKey, version.metrics);
    const statsHtml = stats.length
      ? `<table class="stats"><tbody>${stats.map((s) =>
          `<tr><th>${escapeHtml(s.label)}</th><td>${escapeHtml(s.value)}</td></tr>`).join('')}</tbody></table>`
      : '';
    const seriesHtml = series.map((s) =>
      `<table class="series"><caption>${escapeHtml(s.label)}</caption><tbody>${s.rows.map((r) =>
        `<tr><th>${escapeHtml(r.label)}</th><td>${r.count}</td></tr>`).join('')}</tbody></table>`).join('');
    const notesHtml = notes.length
      ? `<ul>${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : '';
    const narrativeHtml = narrative
      ? narrative.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`).join('')
      : '<p class="muted">No commentary recorded.</p>';
    return `<section><h2>${escapeHtml(def.label)}</h2>${narrativeHtml}${statsHtml}${seriesHtml}${notesHtml}</section>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(report.title)}</title>
<style>
 body{font-family:Georgia,'Times New Roman',serif;color:#111827;margin:32px;line-height:1.5}
 header{border-bottom:3px solid #1E3A8A;padding-bottom:12px;margin-bottom:24px;display:flex;gap:16px;align-items:center}
 header img{height:56px}
 h1{font-size:22px;margin:0 0 4px;color:#1E3A8A}
 .meta{font-size:12px;color:#4b5563}
 h2{font-size:16px;color:#1E3A8A;border-bottom:1px solid #e5e7eb;padding-bottom:4px;margin-top:28px}
 table{border-collapse:collapse;margin:12px 0;font-size:12px;width:100%}
 caption{text-align:left;font-weight:bold;font-size:12px;padding-bottom:4px}
 th,td{border:1px solid #d1d5db;padding:6px 8px;text-align:left}
 th{background:#f3f4f6;width:60%}
 .muted{color:#6b7280;font-style:italic}
 footer{margin-top:32px;border-top:1px solid #e5e7eb;padding-top:8px;font-size:11px;color:#6b7280}
</style></head><body>
<header>${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt=""/>` : ''}
<div><h1>${escapeHtml(report.title)}</h1>
<div class="meta">${escapeHtml(organisationName || 'Regulatory Authority')} &middot; ${escapeHtml(template?.name || report.template_code)}</div>
<div class="meta">Reporting period: ${escapeHtml(formatPeriod(report.period_start, report.period_end))} &middot; Version ${version.version} &middot; ${escapeHtml(STATUS_LABEL[report.status] || report.status)}</div>
</div></header>
${body}
<footer>Generated from supervisory data on ${new Date().toLocaleString()}. ${report.published_at ? `Published ${new Date(report.published_at).toLocaleDateString()}.` : 'Not yet published.'}</footer>
</body></html>`;
}

export function downloadReportDoc(html: string, filename: string) {
  const blob = new Blob([html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.doc') ? filename : `${filename}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function printReportHtml(html: string) {
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) { frame.remove(); return; }
  doc.open();
  doc.write(html);
  doc.close();
  frame.contentWindow?.focus();
  setTimeout(() => {
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  }, 250);
}

export function slugifyFilename(title: string, period: string) {
  return `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${period}`;
}
