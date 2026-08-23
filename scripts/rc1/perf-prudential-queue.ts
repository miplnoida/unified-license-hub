/**
 * RC1 §2 — GAP-3E-002 re-test.
 * Measures the prudential work queue through the real PostgREST path with
 * authenticated persona tokens (RLS + scoped-permission checks applied).
 * No fixture mutation: read-only.
 */
import { rpc, P } from '../cert-v2/api';

interface Sample { label: string; persona: string; status: number; rows: number; ms: number[] }

const REPS = 5;

async function measure(label: string, persona: string, args: Record<string, unknown>): Promise<Sample> {
  const ms: number[] = [];
  let status = 0;
  let rows = 0;
  for (let i = 0; i < REPS; i++) {
    const t = Date.now();
    const res = await rpc(persona, 'prudential_work_queue', args);
    ms.push(Date.now() - t);
    status = res.status;
    rows = Array.isArray(res.body) ? res.body.length : 0;
    if (!res.ok) break;
  }
  return { label, persona, status, rows, ms };
}

async function measureCounts(persona: string): Promise<Sample> {
  const ms: number[] = [];
  let status = 0;
  for (let i = 0; i < REPS; i++) {
    const t = Date.now();
    const res = await rpc(persona, 'prudential_work_queue_counts', {});
    ms.push(Date.now() - t);
    status = res.status;
    if (!res.ok) break;
  }
  return { label: 'counts/supervisor', persona, status, rows: 0, ms };
}


const pct = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

async function main() {
  const analyst = P('prudential_analyst');
  const supervisor = P('prudential_supervisor');

  const entity = await rpc(supervisor, 'prudential_work_queue', { _limit: 1 });
  const entityId = Array.isArray(entity.body) && entity.body[0]?.entity_id ? entity.body[0].entity_id : null;

  const samples: Sample[] = [];
  samples.push(await measure('unfiltered/supervisor/limit50', supervisor, {}));
  samples.push(await measure('unfiltered/analyst/limit50', analyst, {}));
  samples.push(await measure('unfiltered/supervisor/limit200', supervisor, { _limit: 200 }));
  samples.push(await measure('page2/supervisor/limit50', supervisor, { _limit: 50, _offset: 50 }));
  if (entityId) samples.push(await measure('entity-filtered/supervisor', supervisor, { _entity_id: entityId }));
  samples.push(await measureCounts(supervisor));

  let timeouts = 0;
  let errors = 0;
  for (const s of samples) {
    if (s.status === 504 || s.status === 544 || s.status === 408) timeouts++;
    if (s.status >= 400) errors++;
    console.log(
      `${s.status === 200 ? 'PASS' : 'FAIL'} ${s.label} persona=${s.persona.split('@')[0]} http=${s.status} rows=${s.rows} p50=${pct(s.ms, 50)}ms p95=${pct(s.ms, 95)}ms max=${Math.max(...s.ms)}ms`,
    );
  }

  // semantic parity: page1+page2 must be disjoint and ordered subset of limit=200
  const p1 = await rpc(supervisor, 'prudential_work_queue', { _limit: 50 });
  const p2 = await rpc(supervisor, 'prudential_work_queue', { _limit: 50, _offset: 50 });
  const full = await rpc(supervisor, 'prudential_work_queue', { _limit: 200 });
  const key = (r: any) => `${r.work_item_type}:${r.work_item_id}`;
  const ids1 = (p1.body as any[]).map(key);
  const ids2 = (p2.body as any[]).map(key);
  const idsF = (full.body as any[]).map(key);
  const overlap = ids1.filter((k) => ids2.includes(k)).length;
  const parity = ids1.concat(ids2).every((k, i) => idsF[i] === k);
  console.log(`${overlap === 0 ? 'PASS' : 'FAIL'} pagination-disjoint overlap=${overlap}`);
  console.log(`${parity ? 'PASS' : 'FAIL'} pagination-order-parity`);

  console.log(`PRUDENTIAL_QUEUE_TIMEOUTS = ${timeouts}`);
  console.log(`PRUDENTIAL_QUEUE_ERRORS = ${errors}`);
  if (timeouts || errors || overlap || !parity) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
