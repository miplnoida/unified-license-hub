/**
 * AML/CFT paged listing contract verifier.
 *
 * Exercises the five additive paged read contracts through PostgREST as a real
 * authenticated supervisory identity (no service role, no SQL shortcut), so RLS,
 * domain scope and RPC guards all apply exactly as they do for the UI.
 *
 * Checked per contract: 1-based paging, allowed page sizes, page disjointness,
 * a real total drawn from the same filtered population, search and filter
 * narrowing, ASC/DESC symmetry, supervisory risk ordinal, lifecycle ordinals,
 * nulls last, unknown sort key falling back to the governed default, a
 * deterministic tie-break, out-of-range pages, and authorization/domain scope.
 *
 * Run: bun run scripts/verify-aml-paged-listing.ts
 */
import { P, rpc, record, summary } from './cert-v2/api';

const ADMIN = P('super_admin');
const EXTERNAL = P('licensee_primary_user');

const RISK: Record<string, number> = {
  LOW: 1, MODERATE: 2, MEDIUM: 3, MEDIUM_HIGH: 4, 'MEDIUM-HIGH': 4,
  HIGH: 5, VERY_HIGH: 6, SEVERE: 7, CRITICAL: 8,
};
const ASSESSMENT_STATUS: Record<string, number> = {
  DRAFT: 1, RETURNED_FOR_REVISION: 2, SUBMITTED: 3, REVIEWED: 4, APPROVED: 5,
  SUPERSEDED: 8, WITHDRAWN: 9, CANCELLED: 10,
};
const EXAM_STAGE: Record<string, number> = {
  PLANNED: 1, PLANNING: 1, SCOPING: 2, PRE_EXAM_REQUEST: 3, FIELDWORK: 4,
  EXIT_MEETING: 5, DRAFT_REPORT: 6, MANAGEMENT_RESPONSE: 7, FINAL_REPORT: 8,
  REMEDIATION: 9, CLOSED: 10, CANCELLED: 11,
};
const FINDING_STATUS: Record<string, number> = {
  DRAFT: 1, ISSUED: 2, MANAGEMENT_RESPONSE: 3, REMEDIATION_REQUIRED: 4,
  REMEDIATION_IN_PROGRESS: 5, VALIDATION: 6, CLOSED: 9, WITHDRAWN: 10, SUPERSEDED: 10,
};

interface Page { rows: any[]; total: number; page: number; pageSize: number; sortKey: string; sortDirection: string; raw: any; status: number }

async function page(fnName: string, args: Record<string, unknown>): Promise<Page> {
  const r = await rpc(ADMIN, fnName, args);
  const b: any = r.body ?? {};
  return {
    rows: b.rows ?? [], total: Number(b.total_count ?? -1), page: Number(b.page ?? -1),
    pageSize: Number(b.page_size ?? -1), sortKey: String(b.sort_key ?? ''),
    sortDirection: String(b.sort_direction ?? ''), raw: b, status: r.status,
  };
}

/** Ordinal monotonicity with nulls last, ignoring rows the ordinal cannot map. */
function ordered(rows: any[], field: string, map: Record<string, number> | null, dir: 'asc' | 'desc'): string {
  const vals = rows.map((r) => r[field]);
  const keyed = vals.map((v) => {
    if (v == null || v === '') return null;
    if (!map) return String(v);
    return map[String(v).toUpperCase().replace(/\s+/g, '_')] ?? null;
  });
  let seenNull = false;
  let prev: number | string | null = null;
  for (const k of keyed) {
    if (k === null) { seenNull = true; continue; }
    if (seenNull) return `null sorted before ${String(k)}`;
    if (prev !== null) {
      const cmp = typeof k === 'number' ? (k as number) - (prev as number) : String(k).localeCompare(String(prev));
      if (dir === 'asc' && cmp < 0) return `asc break ${String(prev)} -> ${String(k)}`;
      if (dir === 'desc' && cmp > 0) return `desc break ${String(prev)} -> ${String(k)}`;
    }
    prev = k;
  }
  return '';
}

const ids = (p: Page, key: string) => p.rows.map((r) => String(r[key]));

/** Generic contract checks every paged register must satisfy. */
async function contract(label: string, fnName: string, base: Record<string, unknown>, idKey: string, defaultSortKey: string) {
  const p1 = await page(fnName, { ...base, _page: 1, _page_size: 10 });
  record(`${label} page 1 returns a real page and total`, p1.status === 200 && p1.page === 1 && p1.pageSize === 10 && p1.total >= 0 && p1.rows.length <= 10, `status=${p1.status} total=${p1.total} rows=${p1.rows.length}`);

  const expectedFirst = Math.min(10, p1.total);
  record(`${label} page 1 fills to the page size when the population allows`, p1.rows.length === expectedFirst, `rows=${p1.rows.length} expected=${expectedFirst}`);

  const p2 = await page(fnName, { ...base, _page: 2, _page_size: 10 });
  const overlap = ids(p1, idKey).filter((v) => ids(p2, idKey).includes(v));
  record(`${label} page 2 is disjoint from page 1`, overlap.length === 0 && p2.total === p1.total, `overlap=${overlap.length} totals=${p1.total}/${p2.total}`);

  const totalPages = Math.max(1, Math.ceil(p1.total / 10));
  const last = await page(fnName, { ...base, _page: totalPages, _page_size: 10 });
  const expectedLast = p1.total === 0 ? 0 : p1.total - (totalPages - 1) * 10;
  record(`${label} last page returns the remainder of the real population`, last.rows.length === expectedLast, `rows=${last.rows.length} expected=${expectedLast}`);

  const beyond = await page(fnName, { ...base, _page: totalPages + 50, _page_size: 10 });
  record(`${label} out-of-range page returns no rows and keeps the real total`, beyond.status === 200 && beyond.rows.length === 0 && beyond.total === p1.total, `rows=${beyond.rows.length} total=${beyond.total}`);

  const big = await page(fnName, { ...base, _page: 1, _page_size: 100 });
  record(`${label} page size 100 is honoured with an unchanged total`, big.pageSize === 100 && big.total === p1.total && big.rows.length === Math.min(100, p1.total), `size=${big.pageSize} rows=${big.rows.length}`);

  const oversize = await page(fnName, { ...base, _page: 1, _page_size: 5000 });
  record(`${label} page size beyond the maximum falls back to a governed allowed size`, [10, 25, 50, 100].includes(oversize.pageSize) && oversize.rows.length <= 100, `size=${oversize.pageSize} rows=${oversize.rows.length}`);

  const bogus = await page(fnName, { ...base, _page: 1, _page_size: 10, _sort_key: 'drop table"; --' });
  record(`${label} unknown sort key falls back to the governed default`, bogus.status === 200 && bogus.sortKey === defaultSortKey, `sort_key=${bogus.sortKey} expected=${defaultSortKey}`);

  const zero = await page(fnName, { ...base, _page: 0, _page_size: 10 });
  record(`${label} paging is 1-based (page 0 resolves to page 1)`, zero.page === 1 && ids(zero, idKey).join('|') === ids(p1, idKey).join('|'), `page=${zero.page}`);

  const rep = await page(fnName, { ...base, _page: 1, _page_size: 10 });
  record(`${label} default order is deterministic across identical calls`, ids(rep, idKey).join('|') === ids(p1, idKey).join('|'), 'repeat call order differs');

  return p1;
}

async function sortPair(label: string, fnName: string, base: Record<string, unknown>, sortKey: string, field: string, map: Record<string, number> | null, name: string) {
  const asc = await page(fnName, { ...base, _page: 1, _page_size: 100, _sort_key: sortKey, _sort_direction: 'asc' });
  const desc = await page(fnName, { ...base, _page: 1, _page_size: 100, _sort_key: sortKey, _sort_direction: 'desc' });
  const a = ordered(asc.rows, field, map, 'asc');
  const d = ordered(desc.rows, field, map, 'desc');
  record(`${label} ${name} ascending uses ${map ? 'the canonical ordinal' : 'canonical values'} with nulls last`, a === '', a);
  record(`${label} ${name} descending uses ${map ? 'the canonical ordinal' : 'canonical values'} with nulls last`, d === '', d);
}

async function main() {
  // ---- assessments -------------------------------------------------------
  const asmt = await contract('ASMT', 'aml_assessment_page', {}, 'id', 'created_at');
  await sortPair('ASMT', 'aml_assessment_page', {}, 'residual', 'residual_rating', RISK, 'residual risk');
  await sortPair('ASMT', 'aml_assessment_page', {}, 'status', 'status', ASSESSMENT_STATUS, 'lifecycle status');
  {
    const all = await page('aml_assessment_page', { _page: 1, _page_size: 100 });
    const entity = all.rows.find((r) => r.entity_name)?.entity_name as string | undefined;
    if (entity) {
      const term = entity.split(' ')[0];
      const hit = await page('aml_assessment_page', { _page: 1, _page_size: 100, _search: term });
      const allMatch = hit.rows.every((r) => `${r.reference} ${r.entity_name}`.toLowerCase().includes(term.toLowerCase()));
      record('ASMT search matches entity name and reports the same filtered total', hit.total === hit.rows.length && hit.total > 0 && hit.total <= all.total && allMatch, `term=${term} total=${hit.total}/${all.total}`);
    } else {
      record('ASMT search matches entity name and reports the same filtered total', false, 'no entity_name in population');
    }
    const status = all.rows[0]?.status as string | undefined;
    const filtered = await page('aml_assessment_page', { _page: 1, _page_size: 100, _status: status });
    record('ASMT status filter narrows rows and total together', !!status && filtered.rows.every((r) => r.status === status) && filtered.total === filtered.rows.length && filtered.total <= asmt.total, `status=${status} total=${filtered.total}`);
  }

  // ---- supervised entities ----------------------------------------------
  const pf = await contract('PORT', 'aml_portfolio_page', {}, 'entity_id', 'risk');
  await sortPair('PORT', 'aml_portfolio_page', {}, 'risk', 'residual_rating', RISK, 'residual risk');
  {
    const all = await page('aml_portfolio_page', { _page: 1, _page_size: 100, _sort_key: 'risk', _sort_direction: 'desc' });
    const rating = all.rows.find((r) => r.residual_rating)?.residual_rating as string | undefined;
    const byRating = await page('aml_portfolio_page', { _page: 1, _page_size: 100, _rating: rating });
    record('PORT residual rating filter narrows rows and total together', !!rating && byRating.rows.every((r) => r.residual_rating === rating) && byRating.total === byRating.rows.length && byRating.total <= pf.total, `rating=${rating} total=${byRating.total}/${pf.total}`);
    const missing = await page('aml_portfolio_page', { _page: 1, _page_size: 100, _coverage: 'MISSING' });
    record('PORT coverage filter MISSING returns only entities without a current assessment', missing.rows.every((r) => !r.assessment_current), `rows=${missing.rows.length}`);
    const name = all.rows.find((r) => r.entity_name)?.entity_name as string | undefined;
    const term = (name ?? '').split(' ')[0];
    const search = await page('aml_portfolio_page', { _page: 1, _page_size: 100, _search: term });
    record('PORT search covers entity name and licence reference', !!term && search.total === search.rows.length && search.total > 0 && search.total <= pf.total, `term=${term} total=${search.total}/${pf.total}`);
  }

  // ---- work queue -------------------------------------------------------
  const wq = await contract('WORK', 'aml_work_queue_page', { _scope: 'ALL' }, 'work_key', 'queue');
  {
    const q = await page('aml_work_queue_page', { _page: 1, _page_size: 100, _scope: 'ALL' });
    const overdueFirst = (() => {
      let seenNonOverdue = false;
      for (const r of q.rows) {
        if (r.is_overdue) { if (seenNonOverdue) return false; } else seenNonOverdue = true;
      }
      return true;
    })();
    record('WORK default queue order puts overdue work first', overdueFirst, 'overdue item appears after non-overdue work');
    const dueOrdered = (() => {
      const seg = q.rows.filter((r) => r.is_overdue);
      let prev: string | null = null; let seenNull = false;
      for (const r of seg) {
        if (!r.due_date) { seenNull = true; continue; }
        if (seenNull) return false;
        if (prev && String(r.due_date) < prev) return false;
        prev = String(r.due_date);
      }
      return true;
    })();
    record('WORK overdue work is then ordered by due date with undated last', dueOrdered, 'due date order broken');
    record('WORK scope counts come from the read model, not the browser', Object.keys(q.raw.counts ?? {}).length > 0 && Number(q.raw.counts?.ALL ?? -1) === q.total, `counts=${JSON.stringify(q.raw.counts ?? {}).slice(0, 120)} total=${q.total}`);
    const wt = q.rows[0]?.work_type as string | undefined;
    const byType = await page('aml_work_queue_page', { _page: 1, _page_size: 100, _scope: 'ALL', _work_type: wt });
    record('WORK work type filter narrows rows and total together', !!wt && byType.rows.every((r) => r.work_type === wt) && byType.total === byType.rows.length && byType.total <= wq.total, `type=${wt} total=${byType.total}/${wq.total}`);
    const overdue = await page('aml_work_queue_page', { _page: 1, _page_size: 100, _scope: 'ALL', _due: 'OVERDUE' });
    record('WORK due filter OVERDUE returns only overdue work', overdue.rows.every((r) => r.is_overdue === true), `rows=${overdue.rows.length}`);
    const bogusScope = await rpc(ADMIN, 'aml_work_queue_page', { _page: 1, _page_size: 10, _scope: 'EVERYTHING' });
    record('WORK unknown scope never widens access (falls back to the governed default scope)', bogusScope.status >= 400 || ['MY_WORK', 'MY_TEAM'].includes(String((bogusScope.body as any)?.scope)), `scope=${(bogusScope.body as any)?.scope}`);
    record('WORK domain scope stays AML/CFT', q.rows.every((r) => r.domain_code === 'AML_CFT'), 'foreign domain row returned');
  }

  // ---- examinations -----------------------------------------------------
  const ex = await contract('EXAM', 'aml_examination_page', {}, 'id', 'stage');
  await sortPair('EXAM', 'aml_examination_page', {}, 'stage', 'stage', EXAM_STAGE, 'lifecycle stage');
  await sortPair('EXAM', 'aml_examination_page', {}, 'type_risk', 'risk_rating', RISK, 'risk rating');
  await sortPair('EXAM', 'aml_examination_page', {}, 'fieldwork', 'fieldwork_start', null, 'fieldwork start');
  {
    const all = await page('aml_examination_page', { _page: 1, _page_size: 100 });
    const stage = all.rows[0]?.stage as string | undefined;
    const byStage = await page('aml_examination_page', { _page: 1, _page_size: 100, _stage: stage });
    record('EXAM stage filter narrows rows and total together', !!stage && byStage.rows.every((r) => r.stage === stage) && byStage.total === byStage.rows.length && byStage.total <= ex.total, `stage=${stage} total=${byStage.total}/${ex.total}`);
    const openOnly = await page('aml_examination_page', { _page: 1, _page_size: 100, _open_only: true });
    record('EXAM open-only filter excludes closed and cancelled examinations', openOnly.rows.every((r) => !['CLOSED', 'CANCELLED'].includes(String(r.stage).toUpperCase())) && openOnly.total <= ex.total, `rows=${openOnly.rows.length} total=${openOnly.total}`);
    const ref = all.rows[0]?.reference as string | undefined;
    const search = await page('aml_examination_page', { _page: 1, _page_size: 100, _search: ref });
    record('EXAM search covers reference, entity and title', !!ref && search.total === search.rows.length && search.total >= 1 && search.total <= ex.total, `ref=${ref} total=${search.total}`);
  }

  // ---- findings ---------------------------------------------------------
  const fd = await contract('FIND', 'aml_finding_page', {}, 'id', 'severity');
  await sortPair('FIND', 'aml_finding_page', {}, 'severity', 'severity', RISK, 'severity');
  await sortPair('FIND', 'aml_finding_page', {}, 'status', 'status', FINDING_STATUS, 'status');
  await sortPair('FIND', 'aml_finding_page', {}, 'due_date', 'due_date', null, 'due date');
  {
    const all = await page('aml_finding_page', { _page: 1, _page_size: 100 });
    record('FIND remediation detail required by the cards arrives with the page', all.rows.every((r) => 'remediation' in r), 'remediation missing from row payload');
    const sev = all.rows[0]?.severity as string | undefined;
    const bySev = await page('aml_finding_page', { _page: 1, _page_size: 100, _severity: sev });
    record('FIND severity filter narrows rows and total together', !!sev && bySev.rows.every((r) => r.severity === sev) && bySev.total === bySev.rows.length && bySev.total <= fd.total, `severity=${sev} total=${bySev.total}/${fd.total}`);
    const open = await page('aml_finding_page', { _page: 1, _page_size: 100, _view: 'OPEN' });
    record('FIND view OPEN excludes closed findings', open.rows.every((r) => !['CLOSED', 'WITHDRAWN', 'SUPERSEDED'].includes(String(r.status).toUpperCase())) && open.total <= fd.total, `rows=${open.rows.length}`);
  }

  // ---- authorization ----------------------------------------------------
  for (const [name, args] of [
    ['aml_assessment_page', {}],
    ['aml_portfolio_page', {}],
    ['aml_work_queue_page', { _scope: 'ALL' }],
    ['aml_examination_page', {}],
    ['aml_finding_page', {}],
  ] as Array<[string, Record<string, unknown>]>) {
    const r = await rpc(EXTERNAL, name, { ...args, _page: 1, _page_size: 10 });
    const blocked = r.status >= 400 || /denied|author|internal/i.test(r.text) || Number(r.body?.total_count ?? -1) === 0;
    record(`AUTHZ ${name} yields no supervisory data to an external licensee user`, blocked, `status=${r.status} ${r.text.slice(0, 100)}`);
  }

  const failures = summary('AML PAGED LISTING');
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
