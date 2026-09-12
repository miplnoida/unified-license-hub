/**
 * Case-centric audit graph (Phase 6 · Gap 3).
 *
 * Given a starting entity (application / licensee / individual / complaint /
 * enforcement / return), discover the related entity IDs across modules so we
 * can pull a single chronological timeline from audit_logs + rule_overrides +
 * module-specific event tables.
 *
 * The graph is intentionally shallow (one hop) — every join here is RLS-safe
 * and driven by real foreign keys in the schema.
 */
import { supabase } from '@/integrations/supabase/client';

export type EntityKind =
  | 'application' | 'licensee' | 'license' | 'fp_individual'
  | 'fp_assessment' | 'complaint' | 'enforcement_action' | 'return';

export interface RelatedEntity { kind: EntityKind; id: string; label?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

async function fetchOne(table: string, id: string, columns: string): Promise<Row | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await ((supabase as any).from(table)).select(columns).eq('id', id).maybeSingle();
  return (data as Row) ?? null;
}

/**
 * Pulls an individual's fp_appeals/fp_determinations ids into the graph as
 * extra timeline-query targets, tagged with the existing `fp_assessment`
 * kind rather than new EntityKind values — KIND_TO_ENTITY_TYPE.fp_assessment
 * already includes 'fp_determination', and neither appeals nor
 * determinations are ever used as a standalone trace root, only reached from
 * an individual/assessment. This is what makes appeal/determination-authored
 * audit_logs/compliance_audit_logs rows (whose entity_id is the appeal's or
 * determination's own id) show up in the merged case timeline at all.
 */
async function addFpAppealsAndDeterminations(individualId: string, add: (e: RelatedEntity) => void): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: appeals } = await (supabase.from('fp_appeals') as any).select('id').eq('individual_id', individualId).limit(200);
  (appeals ?? []).forEach((a: Row) => add({ kind: 'fp_assessment', id: a.id }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dets } = await (supabase.from('fp_determinations') as any).select('id').eq('individual_id', individualId).limit(200);
  (dets ?? []).forEach((d: Row) => add({ kind: 'fp_assessment', id: d.id }));
}

export async function buildRelatedGraph(root: RelatedEntity): Promise<RelatedEntity[]> {
  const seen = new Set<string>();
  const out: RelatedEntity[] = [];
  const add = (e: RelatedEntity) => {
    const k = `${e.kind}:${e.id}`;
    if (seen.has(k)) return;
    seen.add(k); out.push(e);
  };
  add(root);

  try {
    if (root.kind === 'application') {
      // Canonical entity linkage is `applications.entity_id -> licensees.id`.
      const app = await fetchOne('applications', root.id, 'id, entity_id');
      if (app?.entity_id) add({ kind: 'licensee', id: app.entity_id });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lic } = await (supabase.from('licenses') as any).select('id').eq('application_id', root.id);
      (lic ?? []).forEach((l: Row) => add({ kind: 'license', id: l.id }));
    }
    if (root.kind === 'licensee') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: apps } = await (supabase.from('applications') as any).select('id').eq('entity_id', root.id);
      (apps ?? []).forEach((a: Row) => add({ kind: 'application', id: a.id }));
      // Licences carry no licensee FK: an entity's licences are those held
      // directly (`holder_id`) plus those issued from its applications.
      const appIds = ((apps ?? []) as Row[]).map((a) => a.id).filter(Boolean);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: heldLics } = await (supabase.from('licenses') as any).select('id').eq('holder_id', root.id);
      (heldLics ?? []).forEach((l: Row) => add({ kind: 'license', id: l.id }));
      if (appIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: appLics } = await (supabase.from('licenses') as any).select('id').in('application_id', appIds);
        (appLics ?? []).forEach((l: Row) => add({ kind: 'license', id: l.id }));
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cmp } = await (supabase.from('complaints') as any).select('id').eq('licensee_id', root.id).limit(200);
      (cmp ?? []).forEach((c: Row) => add({ kind: 'complaint', id: c.id }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: enf } = await (supabase.from('enforcement_actions') as any).select('id').eq('entity_id', root.id).limit(200);
      (enf ?? []).forEach((e: Row) => add({ kind: 'enforcement_action', id: e.id }));
       
      // EPR-01 — canonical filings are the Returns truth for the case graph.
      const { data: rets } = await (supabase.from('return_filings') as any).select('id').eq('entity_id', root.id).limit(200);
      (rets ?? []).forEach((r: Row) => add({ kind: 'return', id: r.id }));
      // Fit & Proper linkage: a licensee's assessments were never surfaced here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: fpa } = await (supabase.from('fp_assessments') as any).select('id').eq('licensee_id', root.id).limit(200);
      (fpa ?? []).forEach((f: Row) => add({ kind: 'fp_assessment', id: f.id }));
    }
    if (root.kind === 'fp_individual') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: assess } = await (supabase.from('fp_assessments') as any).select('id, licensee_id').eq('individual_id', root.id);
      (assess ?? []).forEach((a: Row) => {
        add({ kind: 'fp_assessment', id: a.id });
        if (a.licensee_id) add({ kind: 'licensee', id: a.licensee_id });
      });
      await addFpAppealsAndDeterminations(root.id, add);
    }
    if (root.kind === 'fp_assessment') {
      const a = await fetchOne('fp_assessments', root.id, 'id, individual_id, licensee_id');
      if (a?.individual_id) add({ kind: 'fp_individual', id: a.individual_id });
      if (a?.licensee_id) add({ kind: 'licensee', id: a.licensee_id });
      if (a?.individual_id) await addFpAppealsAndDeterminations(a.individual_id, add);
    }
    if (root.kind === 'complaint') {
      const c = await fetchOne('complaints', root.id, 'id, licensee_id');
      if (c?.licensee_id) add({ kind: 'licensee', id: c.licensee_id });
    }
    if (root.kind === 'enforcement_action') {
      const e = await fetchOne('enforcement_actions', root.id, 'id, entity_id');
      if (e?.entity_id) add({ kind: 'licensee', id: e.entity_id });
    }
    if (root.kind === 'return') {
      const r = await fetchOne('return_filings', root.id, 'id, entity_id');
      if (r?.entity_id) add({ kind: 'licensee', id: r.entity_id });
    }
  } catch (_err) {
    // best-effort — return whatever we found.
  }

  return out;
}

export interface TimelineEvent {
  at: string;
  actor: string | null;
  action: string;
  entityKind: EntityKind | 'system';
  entityId: string;
  module: string;
  detail?: unknown;
  before?: unknown;
  after?: unknown;
  source: 'audit_logs' | 'rule_overrides' | 'compliance_audit_logs' | 'return_audit_log' | 'enforcement_case_events' | 'security_event_logs';
}

const KIND_TO_ENTITY_TYPE: Record<EntityKind, string[]> = {
  application: ['application', 'applications'],
  licensee: ['licensee', 'licensees'],
  license: ['license', 'licenses'],
  fp_individual: ['fp_individual', 'fp_individuals'],
  fp_assessment: ['fp_assessment', 'fp_assessments', 'fp_determination', 'fp_committee_vote'],
  complaint: ['complaint', 'complaints'],
  enforcement_action: ['enforcement_action', 'enforcement_actions'],
  // Historical audit rows still carry legacy entity_type values, so keep them in
  // the read filter while all NEW linkage resolves canonical `return_filings`.
  return: ['return', 'return_filing', 'return_filings', 'returns_filed', 'return_form_data'],
};

export async function fetchCaseTimeline(entities: RelatedEntity[]): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];
  const ids = entities.map((e) => e.id);
  if (ids.length === 0) return events;

  // audit_logs (main source of truth)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: audits } = await (supabase.from('audit_logs') as any)
    .select('id, created_at, action, user_id, user_role, entity_type, entity_id, old_value, new_value, metadata')
    .in('entity_id', ids).order('created_at', { ascending: false }).limit(500);
  (audits ?? []).forEach((a: Row) => {
    const kind = (entities.find((e) => e.id === a.entity_id)?.kind ?? 'system') as EntityKind | 'system';
    events.push({
      at: a.created_at, actor: a.user_role ?? a.user_id ?? null,
      action: a.action, entityKind: kind, entityId: a.entity_id,
      module: 'audit', before: a.old_value, after: a.new_value, detail: a.metadata,
      source: 'audit_logs',
    });
  });

  // rule overrides
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: overrides } = await (supabase.from('rule_overrides') as any)
    .select('id, created_at, rule_key, module, user_id, user_role, reason, original_value, overridden_value, entity_id, entity_type')
    .in('entity_id', ids).order('created_at', { ascending: false }).limit(200);
  (overrides ?? []).forEach((o: Row) => {
    const kind = (entities.find((e) => e.id === o.entity_id)?.kind ?? 'system') as EntityKind | 'system';
    events.push({
      at: o.created_at, actor: o.user_role ?? o.user_id ?? null,
      action: `OVERRIDE ${o.rule_key}`, entityKind: kind, entityId: o.entity_id,
      module: o.module ?? 'override', before: o.original_value, after: o.overridden_value,
      detail: { reason: o.reason }, source: 'rule_overrides',
    });
  });

  // compliance_audit_logs (generic auto-audit trigger on applications/licenses/
  // enforcement_actions/etc., plus prudential actions/escalations and conduct
  // investigations, which log EXCLUSIVELY here — never to audit_logs). Real
  // columns are entry_id/timestamp/user_id/user_role/object_id/before_value/
  // after_value/metadata (confirmed against the generated Supabase types) —
  // this previously queried a schema (event_time/actor_id/target_id/detail...)
  // that never existed, so it silently returned nothing for every case, ever.
  // Matched on object_id alone (not object_type): object_id is a UUID with no
  // realistic cross-table collision, whereas object_type strings vary by
  // writer (raw table names from the trigger vs. ad hoc strings like
  // 'conduct_investigation'/'fp_appeal' from manual instrumentation).
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cal } = await (supabase.from('compliance_audit_logs') as any)
      .select('entry_id, timestamp, user_id, user_role, action_type, object_id, before_value, after_value, metadata')
      .in('object_id', ids).order('timestamp', { ascending: false }).limit(300);
    (cal ?? []).forEach((r: Row) => {
      const kind = (entities.find((e) => e.id === r.object_id)?.kind ?? 'system') as EntityKind | 'system';
      events.push({
        at: r.timestamp, actor: r.user_role ?? r.user_id ?? null,
        action: r.action_type, entityKind: kind, entityId: r.object_id,
        module: 'compliance', before: r.before_value, after: r.after_value, detail: r.metadata,
        source: 'compliance_audit_logs',
      });
    });
  } catch (_err) { /* table may differ across environments */ }

  // enforcement_case_events
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: enf } = await (supabase.from('enforcement_case_events') as any)
      // `enforcement_case_events.case_id -> enforcement_actions.id` is the
      // canonical linkage; there is no `enforcement_action_id` column.
      .select('id, created_at, event_type, actor_id, case_id, detail')
      .in('case_id', ids).order('created_at', { ascending: false }).limit(200);
    (enf ?? []).forEach((r: Row) => {
      events.push({
        at: r.created_at, actor: r.actor_id ?? null,
        action: r.event_type, entityKind: 'enforcement_action',
        entityId: r.case_id, module: 'enforcement',
        detail: r.detail, source: 'enforcement_case_events',
      });
    });
  } catch (_err) { /* noop */ }

  return events.sort((a, b) => b.at.localeCompare(a.at));
}

export const ENTITY_KIND_LABELS: Record<EntityKind | 'system', string> = {
  application: 'Application',
  licensee: 'Licensee',
  license: 'License',
  fp_individual: 'F&P Individual',
  fp_assessment: 'F&P Assessment',
  complaint: 'Complaint',
  enforcement_action: 'Enforcement',
  return: 'Return',
  system: 'System',
};

export function isKind(k: string): k is EntityKind {
  return Object.keys(KIND_TO_ENTITY_TYPE).includes(k);
}
