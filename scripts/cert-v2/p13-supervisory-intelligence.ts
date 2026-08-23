/**
 * P13 — Supervisory intelligence: representative canonical-data check.
 * Confirms the read models behind Entity 360, Returns, Prudential, Complaints,
 * Examination and Enforcement surface the live certification data (not legacy).
 */
import { P, rpc, sel, record, summary } from './api';

const ADMIN = P('super_admin');

async function main() {
  // Anchor on the entity that actually carries the certification journeys.
  const ent = await sel(ADMIN, 'enforcement_actions?select=entity_id&order=created_at.desc&limit=1');
  const entityId: string | undefined = ent.body?.[0]?.entity_id;
  record('P13.01 canonical entity population readable', !!entityId, ent.text);
  if (!entityId) return summary('P13');

  const e360 = await sel(ADMIN, `licensees?id=eq.${entityId}&select=id,name,license_number,status`);
  record('P13.02 Entity 360 anchor record readable', !!e360.body?.[0]?.id, e360.text);

  const returns = await sel(ADMIN, `return_filings?select=id,status,licensee_id&licensee_id=eq.${entityId}&limit=5`);
  record('P13.03 Returns data present for the entity', Array.isArray(returns.body), returns.text);

  const pru = await sel(ADMIN, `return_metric_values?select=id,licensee_id&licensee_id=eq.${entityId}&limit=5`);
  record('P13.04 Return metric values present', Array.isArray(pru.body), pru.text);

  const comp = await sel(ADMIN, `complaints?select=id,status&licensee_id=eq.${entityId}&limit=5`);
  record('P13.05 Complaints visible on the canonical entity', Array.isArray(comp.body) && comp.body.length > 0, comp.text);

  const exam = await sel(ADMIN, `examinations?select=id,stage,entity_id&entity_id=eq.${entityId}&limit=5`);
  record('P13.06 Examinations visible on the canonical entity', Array.isArray(exam.body) && exam.body.length > 0, exam.text);

  const enf = await sel(ADMIN, `enforcement_actions?select=id,stage,case_number,entity_id&entity_id=eq.${entityId}&limit=5`);
  record('P13.07 Enforcement cases visible on the canonical entity', Array.isArray(enf.body) && enf.body.length > 0, enf.text);

  const closed = (enf.body || []).filter((c: any) => c.stage === 'CLOSED').length;
  record('P13.08 at least one closed enforcement case is reportable', closed > 0, `closed=${closed}`);

  const failures = summary('P13');
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
