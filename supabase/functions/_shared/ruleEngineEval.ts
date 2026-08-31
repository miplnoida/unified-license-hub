// Unified Rule Engine evaluator (ADM-RE-003 sandbox + scheduled execution).
//
// Pure-ish evaluation helpers: they only READ existing module data
// (calculated return ratios, complaints, licences, licence conditions,
// returns) and never mutate any pre-existing module table. Action execution
// lives in the calling function and writes only to engine_rule_* tables,
// notification queue, workflow_instances and entity_risk_scores.

// deno-lint-ignore no-explicit-any
export type Any = any;

export interface Candidate {
  entity_id: string | null;
  entity_label: string | null;
  matched: boolean;
  metrics: Record<string, unknown>;
  reason: string;
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? NaN : Number(v));

export function compare(left: number, op: string, right: number): boolean {
  switch (op) {
    case 'lt': return left < right;
    case 'lte': return left <= right;
    case 'gt': return left > right;
    case 'gte': return left >= right;
    case 'eq': return left === right;
    case 'neq': return left !== right;
    default: return false;
  }
}

const OP_TEXT: Record<string, string> = {
  lt: '<', lte: '≤', gt: '>', gte: '≥', eq: '=', neq: '≠',
};

interface MetricRow {
  entity_id: string;
  entity_name: string;
  sector_id: string | null;
  metric_key: string;
  value: number;
  period_end_date: string | null;
  recency_rank: number;
}

async function fetchMetricSeries(
  supa: Any,
  metricKey: string,
  sectorIds: string[],
  limitRanks = 8,
): Promise<MetricRow[]> {
  let q = supa
    .from('v_engine_metric_series')
    .select('entity_id, entity_name, sector_id, metric_key, value, period_end_date, recency_rank')
    .eq('metric_key', metricKey)
    .lte('recency_rank', limitRanks)
    .limit(5000);
  if (sectorIds.length) q = q.in('sector_id', sectorIds);
  const { data, error } = await q;
  if (error) throw new Error(`metric_series: ${error.message}`);
  return (data as MetricRow[]) || [];
}

async function resolveLicenseeNames(supa: Any, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const clean = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < clean.length; i += 200) {
    const { data } = await supa.from('licensees').select('id, name').in('id', clean.slice(i, i + 200));
    for (const r of (data as Any[]) || []) map.set(r.id, r.name);
  }
  return map;
}


function groupByEntity(rows: MetricRow[]): Map<string, MetricRow[]> {
  const m = new Map<string, MetricRow[]>();
  for (const r of rows) {
    const list = m.get(r.entity_id) || [];
    list.push(r);
    m.set(r.entity_id, list);
  }
  for (const list of m.values()) list.sort((a, b) => a.recency_rank - b.recency_rank);
  return m;
}

export async function evaluateRule(supa: Any, rule: Any): Promise<Candidate[]> {
  const c = rule.conditions || {};
  const preds: Any[] = c.predicates || [];
  const p0 = preds[0] || {};
  const sectorIds: string[] = c.sector_ids || [];

  switch (rule.rule_type) {
    case 'threshold': {
      if (!p0.metric_key) return [];
      const rows = await fetchMetricSeries(supa, p0.metric_key, sectorIds, 1);
      return rows.map((r) => {
        const matched = compare(num(r.value), p0.operator, num(p0.value));
        return {
          entity_id: r.entity_id,
          entity_label: r.entity_name,
          matched,
          metrics: { [p0.metric_key]: r.value, threshold: p0.value, period_end: r.period_end_date },
          reason: `${p0.metric_key} = ${r.value} ${OP_TEXT[p0.operator] || '?'} ${p0.value} → ${matched ? 'breach' : 'within limit'}`,
        };
      });
    }

    case 'trend': {
      if (!p0.metric_key) return [];
      const periods = Math.max(2, Number(c.periods || 3));
      const rows = await fetchMetricSeries(supa, p0.metric_key, sectorIds, periods);
      const out: Candidate[] = [];
      for (const [entityId, list] of groupByEntity(rows)) {
        if (list.length < periods) continue;
        const seq = list.slice(0, periods).map((r) => num(r.value)); // newest first
        let consistent = true;
        for (let i = 0; i < seq.length - 1; i++) {
          const newer = seq[i], older = seq[i + 1];
          if (c.direction === 'increasing' ? !(newer > older) : !(newer < older)) { consistent = false; break; }
        }
        let magnitudeOk = true;
        if (consistent && c.magnitude_pct) {
          const first = seq[seq.length - 1], last = seq[0];
          const pct = first === 0 ? 0 : Math.abs((last - first) / Math.abs(first)) * 100;
          magnitudeOk = pct >= Number(c.magnitude_pct);
        }
        const matched = consistent && magnitudeOk;
        out.push({
          entity_id: entityId,
          entity_label: list[0].entity_name,
          matched,
          metrics: { series: seq, periods, direction: c.direction },
          reason: matched
            ? `${p0.metric_key} ${c.direction} across ${periods} consecutive periods (${seq.slice().reverse().join(' → ')})`
            : `${p0.metric_key} does not show a ${c.direction} run over ${periods} periods (${seq.slice().reverse().join(' → ')})`,
        });
      }
      return out;
    }

    case 'peer_comparison':
    case 'group_contagion': {
      if (!p0.metric_key) return [];
      const rows = await fetchMetricSeries(supa, p0.metric_key, sectorIds, 1);
      if (!rows.length) return [];
      const bySector = new Map<string, MetricRow[]>();
      for (const r of rows) {
        const k = r.sector_id || 'none';
        bySector.set(k, [...(bySector.get(k) || []), r]);
      }
      const out: Candidate[] = [];
      for (const [, list] of bySector) {
        const avg = list.reduce((s, r) => s + num(r.value), 0) / list.length;
        const deviating = list.filter((r) => avg !== 0 && Math.abs((num(r.value) - avg) / Math.abs(avg)) * 100 >= Number(c.peer_deviation_pct || 0));
        const groupTriggered = rule.rule_type === 'group_contagion'
          ? deviating.length >= Number(c.min_group_members || 2)
          : true;
        for (const r of list) {
          const dev = avg === 0 ? 0 : ((num(r.value) - avg) / Math.abs(avg)) * 100;
          const isDeviating = Math.abs(dev) >= Number(c.peer_deviation_pct || 0);
          out.push({
            entity_id: r.entity_id,
            entity_label: r.entity_name,
            matched: isDeviating && groupTriggered,
            metrics: { value: r.value, peer_average: Number(avg.toFixed(4)), deviation_pct: Number(dev.toFixed(2)), peers_deviating: deviating.length },
            reason: `${p0.metric_key} = ${r.value} vs peer average ${avg.toFixed(4)} (${dev.toFixed(1)}% deviation, threshold ${c.peer_deviation_pct}%)${rule.rule_type === 'group_contagion' ? `; ${deviating.length} group members deviating` : ''}`,
          });
        }
      }
      return out;
    }

    case 'macro_overlay': {
      if (!p0.metric_key) return [];
      const rows = await fetchMetricSeries(supa, p0.metric_key, sectorIds, 2);
      const latest = rows.filter((r) => r.recency_rank === 1);
      const prev = rows.filter((r) => r.recency_rank === 2);
      if (!latest.length || !prev.length) return [];
      const avgNow = latest.reduce((s, r) => s + num(r.value), 0) / latest.length;
      const avgPrev = prev.reduce((s, r) => s + num(r.value), 0) / prev.length;
      const move = avgPrev === 0 ? 0 : ((avgNow - avgPrev) / Math.abs(avgPrev)) * 100;
      const matched = Math.abs(move) >= Number(c.peer_deviation_pct || 0);
      return [{
        entity_id: null,
        entity_label: 'Sector aggregate',
        matched,
        metrics: { sector_average_now: Number(avgNow.toFixed(4)), sector_average_previous: Number(avgPrev.toFixed(4)), movement_pct: Number(move.toFixed(2)) },
        reason: `Sector average for ${p0.metric_key} moved ${move.toFixed(1)}% (threshold ${c.peer_deviation_pct}%)`,
      }];
    }

    case 'cross_field_validation': {
      if (!p0.metric_key || !p0.compare_metric_key) return [];
      const [aRows, bRows] = await Promise.all([
        fetchMetricSeries(supa, p0.metric_key, sectorIds, 1),
        fetchMetricSeries(supa, p0.compare_metric_key, sectorIds, 1),
      ]);
      const bMap = new Map(bRows.map((r) => [r.entity_id, r]));
      const out: Candidate[] = [];
      for (const a of aRows) {
        const b = bMap.get(a.entity_id);
        if (!b) continue;
        const holds = compare(num(a.value), p0.operator, num(b.value));
        out.push({
          entity_id: a.entity_id,
          entity_label: a.entity_name,
          matched: !holds, // a validation rule matches when the relationship is violated
          metrics: { [p0.metric_key]: a.value, [p0.compare_metric_key]: b.value },
          reason: `${p0.metric_key} (${a.value}) ${OP_TEXT[p0.operator]} ${p0.compare_metric_key} (${b.value}) → ${holds ? 'valid' : 'violation'}`,
        });
      }
      return out;
    }

    case 'pattern_detection':
    case 'recurrence': {
      const windowDays = Number(c.window_days || 30);
      const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
      const threshold = Number(c.count_threshold || 2);
      const eventType = c.event_type || 'complaint';
      const counts = new Map<string, { count: number; label: string }>();

      if (eventType === 'late_return') {
        const { data, error } = await supa.from('returns_filed')
          .select('entity_id, ontime_status, submit_date')
          .gte('submit_date', since).eq('ontime_status', 'LATE').limit(5000);
        if (error) throw new Error(error.message);
        for (const r of (data as Any[]) || []) {
          if (!r.entity_id) continue;
          const cur = counts.get(r.entity_id) || { count: 0, label: '' };
          cur.count++; counts.set(r.entity_id, cur);
        }
      } else if (eventType === 'threshold_breach') {
        const { data, error } = await supa.from('v_prudential_current_breaches')
          .select('metric_key, detected_at, return_id')
          .gte('detected_at', since).limit(5000);
        if (error) throw new Error(error.message);
        const returnIds = [...new Set(((data as Any[]) || []).map((r) => r.return_id).filter(Boolean))];
        const entityByReturn = new Map<string, string>();
        for (let i = 0; i < returnIds.length; i += 200) {
          const { data: rf } = await supa.from('returns_filed')
            .select('id, entity_id').in('id', returnIds.slice(i, i + 200));
          for (const r of (rf as Any[]) || []) if (r.entity_id) entityByReturn.set(r.id, r.entity_id);
        }
        for (const r of (data as Any[]) || []) {
          const id = entityByReturn.get(r.return_id);
          if (!id) continue;
          const cur = counts.get(id) || { count: 0, label: '' };
          cur.count++; counts.set(id, cur);
        }
      } else {
        let q = supa.from('complaints')
          .select('licensee_id, status, created_at, product_id, conduct_risk_category_id')
          .gte('created_at', since).limit(5000);
        if (eventType === 'complaint_upheld') q = q.in('status', ['upheld', 'resolved', 'closed']);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        for (const r of (data as Any[]) || []) {
          const key = c.group_by === 'product'
            ? r.product_id
            : c.group_by === 'conduct_category'
              ? r.conduct_risk_category_id
              : r.licensee_id;
          if (!key) continue;
          const cur = counts.get(key) || { count: 0, label: '' };
          cur.count++; counts.set(key, cur);
        }
      }

      if (c.group_by === 'entity' || !c.group_by || rule.rule_type === 'recurrence') {
        const labels = await resolveLicenseeNames(supa, [...counts.keys()]);
        for (const [id, v] of counts) v.label = labels.get(id) || 'Entity';
      } else {
        for (const [, v] of counts) v.label = c.group_by === 'product' ? 'Product group' : 'Conduct category';
      }


      const values = [...counts.values()].map((v) => v.count);
      const sectorAvg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
      const effective = c.comparison === 'sector_average' ? Math.max(threshold, sectorAvg) : threshold;

      return [...counts.entries()].map(([id, v]) => ({
        entity_id: c.group_by === 'entity' || rule.rule_type === 'recurrence' ? id : null,
        entity_label: v.label,
        matched: v.count >= effective,
        metrics: { count: v.count, threshold: effective, window_days: windowDays, event_type: eventType },
        reason: `${v.count} ${eventType} events in ${windowDays} days (threshold ${effective.toFixed(0)})`,
      }));
    }

    case 'condition_monitoring': {
      const days = Number(c.days_before || 14);
      const until = new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
      const { data, error } = await supa.from('license_conditions')
        .select('id, description, due_date, status, licenses:license_id(holder_id, license_number)')
        .lte('due_date', until).neq('status', 'satisfied').limit(2000);
      if (error) throw new Error(error.message);
      return ((data as Any[]) || []).map((r) => ({
        entity_id: r.licenses?.holder_id ?? null,
        entity_label: r.licenses?.license_number ?? 'Licence condition',
        matched: true,
        metrics: { condition_id: r.id, due_date: r.due_date, status: r.status },
        reason: `Licence condition due ${r.due_date} is still ${r.status} (within ${days} days)`,
      }));
    }

    case 'sla': {
      const hours = Number(c.duration_hours || 72);
      const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
      let q = supa.from('workflow_instances')
        .select('id, entity_type, entity_id, current_step_key, status, started_at, due_at')
        .eq('status', 'active').lte('started_at', cutoff).limit(2000);
      if (c.workflow_id) q = q.eq('workflow_id', c.workflow_id);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return ((data as Any[]) || [])
        .filter((r) => !c.stage || r.current_step_key === c.stage)
        .map((r) => ({
          entity_id: r.entity_id,
          entity_label: `${r.entity_type} ${String(r.entity_id || '').slice(0, 8)}`,
          matched: true,
          metrics: { instance_id: r.id, stage: r.current_step_key, started_at: r.started_at, limit_hours: hours },
          reason: `Case has been in ${r.current_step_key || 'the current stage'} since ${r.started_at} (limit ${hours}h)`,
        }));
    }

    case 'routing': {
      const { data, error } = await supa.from('complaints')
        .select('id, complaint_number, severity, priority, assigned_team, investigator_id, licensee_id')
        .is('investigator_id', null).limit(2000);

      if (error) throw new Error(error.message);
      const logic = (c.logic || 'AND').toUpperCase();
      return ((data as Any[]) || []).map((r) => {
        const results = preds.map((p) => {
          const left = String(r[p.field as string] ?? '').toLowerCase();
          const right = String(p.value ?? '').toLowerCase();
          const asNum = num(left), rNum = num(right);
          if (!Number.isNaN(asNum) && !Number.isNaN(rNum)) return compare(asNum, p.operator, rNum);
          return p.operator === 'neq' ? left !== right : left === right;
        });
        const matched = logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
        return {
          entity_id: r.licensee_id,
          entity_label: r.complaint_number || 'Record',
          matched,
          metrics: { record_id: r.id, evaluated: preds.map((p, i) => ({ field: p.field, passed: results[i] })) },
          reason: matched
            ? `Record ${r.complaint_number} matches the routing conditions → ${c.destination_type}: ${c.destination}`
            : `Record ${r.complaint_number} does not match the routing conditions`,
        };
      });
    }

    case 'scheduling': {
      if (c.schedule_mode === 'event' && c.event === 'licence_expiring') {
        const days = Number(c.days_before || 30);
        const until = new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
        const { data, error } = await supa.from('licenses')
          .select('id, license_number, valid_until, holder_id, status')
          .not('valid_until', 'is', null).lte('valid_until', until).eq('status', 'active').limit(2000);
        if (error) throw new Error(error.message);
        return ((data as Any[]) || []).map((r) => ({
          entity_id: r.holder_id,
          entity_label: r.license_number,
          matched: true,
          metrics: { license_id: r.id, valid_until: r.valid_until, days_before: days },
          reason: `Licence ${r.license_number} expires ${r.valid_until} (within ${days} days)`,
        }));
      }
      if (c.schedule_mode === 'event' && c.event === 'condition_deadline') {
        return await evaluateRule(supa, { ...rule, rule_type: 'condition_monitoring' });
      }
      if (c.schedule_mode === 'event' && c.event === 'return_submitted') {
        const since = new Date(Date.now() - 86400_000).toISOString();
        const { data, error } = await supa.from('returns_filed')
          .select('id, unique_id, entity_id, submit_date')
          .gte('submit_date', since).limit(1000);
        if (error) throw new Error(error.message);
        return ((data as Any[]) || []).map((r) => ({
          entity_id: r.entity_id,
          entity_label: r.unique_id,

          matched: true,
          metrics: { return_id: r.id, submit_date: r.submit_date },
          reason: `Return ${r.unique_id} submitted ${r.submit_date}`,
        }));
      }
      // Calendar schedule: fires on its own cadence, evaluated against today.
      const today = new Date();
      const dom = today.getUTCDate();
      const month = today.getUTCMonth() + 1;
      const offset = Number(c.day_offset || 0);
      const targetDay = 1 + offset;
      let due = false;
      switch (c.frequency) {
        case 'daily': due = true; break;
        case 'weekly': due = today.getUTCDay() === (offset % 7); break;
        case 'monthly': due = dom === targetDay; break;
        case 'quarterly': due = dom === targetDay && [1, 4, 7, 10].includes(month); break;
        case 'annual': due = dom === targetDay && month === 1; break;
        default: due = false;
      }
      return [{
        entity_id: null,
        entity_label: 'Scheduled run',
        matched: due,
        metrics: { frequency: c.frequency, day_offset: offset, evaluated_on: today.toISOString().slice(0, 10) },
        reason: due
          ? `${c.frequency} schedule is due today`
          : `${c.frequency} schedule is not due today`,
      }];
    }

    default:
      return [{
        entity_id: null,
        entity_label: null,
        matched: false,
        metrics: {},
        reason: `Rule type ${rule.rule_type} has no evaluator.`,
      }];
  }
}

export function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return (template || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? `{{${key}}}` : String(v);
  });
}

export function bandToScore(band: string): number {
  switch ((band || '').toLowerCase()) {
    case 'critical': return 90;
    case 'high': return 75;
    case 'medium': return 50;
    case 'low': return 25;
    default: return 50;
  }
}

export function currentPeriodKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/* ============================================================
 * ADM-RE-003 — condition-level explanation and override runs
 * ============================================================ */

export interface ConditionResult {
  index: number;
  metric: string;
  operator: string;
  operator_symbol: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
  reason: string;
}

/**
 * Re-states every configured predicate against the metric values a candidate
 * carried, so the tester can show metric / actual / operator / expected /
 * pass-fail / reason per condition rather than a single reason string.
 */
export function explainConditions(rule: Any, metrics: Record<string, unknown>): ConditionResult[] {
  const c = rule?.conditions || {};
  const preds: Any[] = c.predicates || [];
  return preds.map((p, index) => {
    const key = String(p.metric_key || p.field || '');
    const actual = metrics?.[key] ?? metrics?.[`${key}`] ?? null;
    const expected = p.compare_metric_key ? (metrics?.[p.compare_metric_key] ?? p.compare_metric_key) : p.value;
    const op = String(p.operator || 'eq');
    let passed = false;
    const l = Number(actual);
    const r = Number(expected);
    if (Number.isFinite(l) && Number.isFinite(r)) passed = compare(l, op, r);
    else if (op === 'eq') passed = String(actual ?? '') === String(expected ?? '');
    else if (op === 'neq') passed = String(actual ?? '') !== String(expected ?? '');
    const sym = OP_TEXT[op] ?? op;
    return {
      index,
      metric: key || '(unset)',
      operator: op,
      operator_symbol: sym,
      expected: expected ?? null,
      actual: actual ?? null,
      passed,
      reason: actual === null || actual === undefined
        ? `no value available for ${key || 'the configured metric'}`
        : `${key} = ${actual} ${sym} ${expected ?? '—'} → ${passed ? 'pass' : 'fail'}`,
    };
  });
}

/**
 * Builds a single candidate purely from manual metric overrides. Used by the
 * tester's override mode so a rule can be exercised without waiting for real
 * data to reach the threshold. Never touches production data.
 */
export function overrideCandidate(
  rule: Any,
  overrides: Record<string, unknown>,
  entityLabel = 'Manual override',
): Candidate {
  const conds = explainConditions(rule, overrides);
  const logic = String(rule?.conditions?.logic || 'AND').toUpperCase();
  const matched = conds.length === 0
    ? false
    : logic === 'OR' ? conds.some((x) => x.passed) : conds.every((x) => x.passed);
  return {
    entity_id: null,
    entity_label: entityLabel,
    matched,
    metrics: { ...overrides },
    reason: conds.map((x) => x.reason).join(logic === 'OR' ? ' OR ' : ' AND ') || 'no conditions configured',
  };
}
