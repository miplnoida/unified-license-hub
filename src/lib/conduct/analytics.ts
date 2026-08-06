/**
 * Pure analytics helpers for the Market Conduct analytics hub.
 *
 * Everything here operates on rows the dashboard has already fetched under the
 * caller's RLS scope — no data access, no side effects, so it is unit-testable.
 */

export interface ComplaintRow {
  id: string;
  created_at: string;
  resolved_at?: string | null;
  sla_due_at?: string | null;
  severity?: string | null;
  status?: string | null;
  product_id?: string | null;
  channel_id?: string | null;
  conduct_risk_category_id?: string | null;
  licensee_id?: string | null;
  vulnerability_indicator?: boolean | null;
  repeat_complaint_count?: number | null;
}

export interface AlertRow {
  id: string;
  created_at: string;
  status?: string | null;
  severity?: string | null;
  licensee_id?: string | null;
}

export type Bucketing = 'week' | 'month';

export interface TrendPoint {
  key: string;
  label: string;
  raised: number;
  resolved: number;
  alerts: number;
  slaBreached: number;
  low: number;
  medium: number;
  high: number;
  critical: number;
}

/** Weekly buckets for short windows keep the trend readable. */
export function pickBucketing(days: number): Bucketing {
  return days <= 90 ? 'week' : 'month';
}

function startOfWeek(d: Date): Date {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = dt.getDay(); // 0 = Sunday
  dt.setDate(dt.getDate() - dow);
  return dt;
}

export function bucketKey(iso: string | Date, bucketing: Bucketing): string {
  const d = new Date(iso);
  if (bucketing === 'month') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  const s = startOfWeek(d);
  return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
}

export function bucketLabel(key: string, bucketing: Bucketing): string {
  if (bucketing === 'month') {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Ordered bucket keys covering [start, now], so gaps render as zero. */
export function bucketRange(days: number, bucketing: Bucketing, now = new Date()): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const start = new Date(now.getTime() - days * 86400000);
  const cursor = bucketing === 'month'
    ? new Date(start.getFullYear(), start.getMonth(), 1)
    : startOfWeek(start);
  while (cursor.getTime() <= now.getTime()) {
    const k = bucketKey(cursor, bucketing);
    if (!seen.has(k)) { seen.add(k); keys.push(k); }
    if (bucketing === 'month') cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 7);
  }
  return keys;
}

export function buildTrend(
  complaints: ComplaintRow[],
  alerts: AlertRow[],
  days: number,
  now = new Date(),
): { bucketing: Bucketing; points: TrendPoint[] } {
  const bucketing = pickBucketing(days);
  const keys = bucketRange(days, bucketing, now);
  const map = new Map<string, TrendPoint>(
    keys.map((k) => [k, {
      key: k, label: bucketLabel(k, bucketing),
      raised: 0, resolved: 0, alerts: 0, slaBreached: 0,
      low: 0, medium: 0, high: 0, critical: 0,
    }]),
  );

  for (const c of complaints) {
    const b = map.get(bucketKey(c.created_at, bucketing));
    if (b) {
      b.raised++;
      const sev = (c.severity || '').toLowerCase();
      if (sev === 'low' || sev === 'medium' || sev === 'high' || sev === 'critical') b[sev]++;
    }
    if (c.resolved_at) {
      const rb = map.get(bucketKey(c.resolved_at, bucketing));
      if (rb) rb.resolved++;
    }
    if (c.sla_due_at && (!c.resolved_at || new Date(c.resolved_at) > new Date(c.sla_due_at))) {
      const sb = map.get(bucketKey(c.sla_due_at, bucketing));
      if (sb && new Date(c.sla_due_at).getTime() <= now.getTime()) sb.slaBreached++;
    }
  }
  for (const a of alerts) {
    const b = map.get(bucketKey(a.created_at, bucketing));
    if (b) b.alerts++;
  }

  return { bucketing, points: keys.map((k) => map.get(k)!) };
}

export interface PatternSignal {
  id: string;
  kind: 'volume_spike' | 'severity_shift' | 'repeat_concentration' | 'vulnerable_concentration' | 'rising_pair';
  title: string;
  detail: string;
  tone: 'danger' | 'warn' | 'info';
  link?: string;
}

const SPIKE_THRESHOLD = 0.5;   // +50% period over period
const MIN_SPIKE_BASE = 3;      // ignore noise off tiny baselines

/**
 * Deterministic pattern detection over the filtered window. Only reports
 * signals that the data supports — never invents narrative.
 */
export function derivePatternSignals(
  points: TrendPoint[],
  complaints: ComplaintRow[],
  labels: {
    product: (id?: string | null) => string;
    channel: (id?: string | null) => string;
    category: (id?: string | null) => string;
    licensee: (id?: string | null) => string;
  },
): PatternSignal[] {
  const out: PatternSignal[] = [];
  if (points.length >= 2) {
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    if (prev.raised >= MIN_SPIKE_BASE && last.raised > prev.raised * (1 + SPIKE_THRESHOLD)) {
      const pct = Math.round(((last.raised - prev.raised) / prev.raised) * 100);
      out.push({
        id: 'volume_spike',
        kind: 'volume_spike',
        tone: 'danger',
        title: `Complaint volume up ${pct}% in ${last.label}`,
        detail: `${last.raised} complaints vs ${prev.raised} in ${prev.label}.`,
        link: '/complaints',
      });
    }
    const lastSevere = last.high + last.critical;
    const prevSevere = prev.high + prev.critical;
    if (prevSevere >= MIN_SPIKE_BASE && lastSevere > prevSevere * (1 + SPIKE_THRESHOLD)) {
      out.push({
        id: 'severity_shift',
        kind: 'severity_shift',
        tone: 'danger',
        title: `High/critical severity mix worsening in ${last.label}`,
        detail: `${lastSevere} high or critical complaints vs ${prevSevere} in ${prev.label}.`,
        link: '/complaints?severity=critical',
      });
    }
  }

  const total = complaints.length;
  if (total > 0) {
    const repeat = complaints.filter((c) => (c.repeat_complaint_count ?? 0) >= 3);
    if (repeat.length / total >= 0.2 && repeat.length >= 3) {
      out.push({
        id: 'repeat_concentration',
        kind: 'repeat_concentration',
        tone: 'warn',
        title: `${Math.round((repeat.length / total) * 100)}% of complaints are repeat cases`,
        detail: `${repeat.length} of ${total} complaints have 3 or more prior related complaints.`,
        link: '/complaints',
      });
    }
    const vulnerable = complaints.filter((c) => c.vulnerability_indicator);
    if (vulnerable.length / total >= 0.2 && vulnerable.length >= 3) {
      out.push({
        id: 'vulnerable_concentration',
        kind: 'vulnerable_concentration',
        tone: 'warn',
        title: `${Math.round((vulnerable.length / total) * 100)}% involve vulnerable customers`,
        detail: `${vulnerable.length} of ${total} complaints carry a vulnerability indicator.`,
        link: '/complaints',
      });
    }

    // Rising product × category pairs: latest bucket vs the rest of the window.
    const latestKey = points.length ? points[points.length - 1].key : null;
    if (latestKey) {
      const bucketing: Bucketing = latestKey.split('-').length === 3 ? 'week' : 'month';
      const pairLatest = new Map<string, number>();
      const pairEarlier = new Map<string, number>();
      for (const c of complaints) {
        const key = `${c.product_id ?? 'none'}|${c.conduct_risk_category_id ?? 'none'}`;
        const target = bucketKey(c.created_at, bucketing) === latestKey ? pairLatest : pairEarlier;
        target.set(key, (target.get(key) || 0) + 1);
      }
      const earlierBuckets = Math.max(points.length - 1, 1);
      let best: { key: string; latest: number; avg: number } | null = null;
      for (const [key, latest] of pairLatest) {
        const avg = (pairEarlier.get(key) || 0) / earlierBuckets;
        if (latest >= 3 && latest > avg * (1 + SPIKE_THRESHOLD) && (!best || latest - avg > best.latest - best.avg)) {
          best = { key, latest, avg };
        }
      }
      if (best) {
        const [pid, cid] = best.key.split('|');
        out.push({
          id: `rising_pair_${best.key}`,
          kind: 'rising_pair',
          tone: 'info',
          title: `Rising: ${labels.product(pid === 'none' ? null : pid)} / ${labels.category(cid === 'none' ? null : cid)}`,
          detail: `${best.latest} complaints in the latest period vs an average of ${best.avg.toFixed(1)} before.`,
        });
      }
    }
  }

  return out;
}

export interface MatrixCell {
  rowKey: string;
  colKey: string;
  count: number;
  critical: number;
  breached: number;
}

export interface Matrix {
  rows: { key: string; label: string }[];
  cols: { key: string; label: string }[];
  cells: Map<string, MatrixCell>;
  rowTotals: Map<string, number>;
  colTotals: Map<string, number>;
  max: number;
}

export function buildMatrix(
  complaints: ComplaintRow[],
  rowOf: (c: ComplaintRow) => string | null | undefined,
  colOf: (c: ComplaintRow) => string | null | undefined,
  labelRow: (key: string) => string,
  labelCol: (key: string) => string,
  now = new Date(),
): Matrix {
  const cells = new Map<string, MatrixCell>();
  const rowTotals = new Map<string, number>();
  const colTotals = new Map<string, number>();
  for (const c of complaints) {
    const rowKey = rowOf(c) || 'none';
    const colKey = colOf(c) || 'none';
    const k = `${rowKey}|${colKey}`;
    const cell = cells.get(k) || { rowKey, colKey, count: 0, critical: 0, breached: 0 };
    cell.count++;
    if ((c.severity || '').toLowerCase() === 'critical') cell.critical++;
    if (!c.resolved_at && c.sla_due_at && new Date(c.sla_due_at).getTime() < now.getTime()) cell.breached++;
    cells.set(k, cell);
    rowTotals.set(rowKey, (rowTotals.get(rowKey) || 0) + 1);
    colTotals.set(colKey, (colTotals.get(colKey) || 0) + 1);
  }
  const rows = Array.from(rowTotals.keys())
    .sort((a, b) => (rowTotals.get(b) || 0) - (rowTotals.get(a) || 0))
    .map((key) => ({ key, label: labelRow(key) }));
  const cols = Array.from(colTotals.keys())
    .sort((a, b) => (colTotals.get(b) || 0) - (colTotals.get(a) || 0))
    .map((key) => ({ key, label: labelCol(key) }));
  const max = Math.max(0, ...Array.from(cells.values()).map((c) => c.count));
  return { rows, cols, cells, rowTotals, colTotals, max };
}

/** Percentile position of `value` within `dist` (0-100, 2dp). */
export function percentile(value: number, dist: number[]): number {
  if (!dist.length) return 50;
  const below = dist.filter((d) => d < value).length;
  return Math.round((below / dist.length) * 10000) / 100;
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface EntityMetrics {
  licenseeId: string;
  complaints: number;
  critical: number;
  criticalShare: number;
  slaBreachRate: number;
  repeatRate: number;
  vulnerableShare: number;
  openAlerts: number;
}

export function entityMetrics(
  licenseeId: string,
  complaints: ComplaintRow[],
  alerts: AlertRow[],
  now = new Date(),
): EntityMetrics {
  const rows = complaints.filter((c) => c.licensee_id === licenseeId);
  const total = rows.length;
  const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  const critical = rows.filter((c) => (c.severity || '').toLowerCase() === 'critical').length;
  const breached = rows.filter((c) => !c.resolved_at && c.sla_due_at && new Date(c.sla_due_at).getTime() < now.getTime()).length;
  const repeat = rows.filter((c) => (c.repeat_complaint_count ?? 0) >= 3).length;
  const vulnerable = rows.filter((c) => c.vulnerability_indicator).length;
  return {
    licenseeId,
    complaints: total,
    critical,
    criticalShare: pct(critical),
    slaBreachRate: pct(breached),
    repeatRate: pct(repeat),
    vulnerableShare: pct(vulnerable),
    openAlerts: alerts.filter((a) => a.licensee_id === licenseeId && a.status === 'open').length,
  };
}

export interface PeerComparisonMetric {
  key: keyof Omit<EntityMetrics, 'licenseeId'>;
  label: string;
  suffix: string;
  entityValue: number;
  median: number;
  p75: number;
  p90: number;
  percentile: number;
}

export const PEER_METRICS: { key: PeerComparisonMetric['key']; label: string; suffix: string }[] = [
  { key: 'complaints', label: 'Complaints in window', suffix: '' },
  { key: 'criticalShare', label: 'Critical share', suffix: '%' },
  { key: 'slaBreachRate', label: 'SLA breach rate', suffix: '%' },
  { key: 'repeatRate', label: 'Repeat complaint rate', suffix: '%' },
  { key: 'vulnerableShare', label: 'Vulnerable customer share', suffix: '%' },
  { key: 'openAlerts', label: 'Open conduct alerts', suffix: '' },
];

export function comparePeers(
  entity: EntityMetrics,
  peers: EntityMetrics[],
): PeerComparisonMetric[] {
  return PEER_METRICS.map(({ key, label, suffix }) => {
    const dist = peers.map((p) => p[key] as number).sort((a, b) => a - b);
    return {
      key, label, suffix,
      entityValue: entity[key] as number,
      median: Math.round(quantile(dist, 0.5) * 10) / 10,
      p75: Math.round(quantile(dist, 0.75) * 10) / 10,
      p90: Math.round(quantile(dist, 0.9) * 10) / 10,
      percentile: percentile(entity[key] as number, dist),
    };
  });
}
