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
  const { data } = await (supabase.from(table) as any).select(columns).eq('id', id).maybeSingle();
  return (data as Row) ?? null;
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
      const app = await fetchOne('applications', root.id, 'id, licensee_id');
      if (app?.licensee_id) add({ kind: 'licensee', id: app.licensee_id });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lic } = await (supabase.from('licenses') as any).select('id').eq('application_id', root.id);
      (lic ?? []).forEach((l: Row) => add({ kind: 'license', id: l.id }));
    }
    if (root.kind === 'licensee') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: apps } = await (supabase.from('applications') as any).select('id').eq('licensee_id', root.id);
      (apps ?? []).forEach((a: Row) => add({ kind: 'application', id: a.id }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lics } = await (supabase.from('licenses') as any).select('id').eq('licensee_id', root.id);
      (lics ?? []).forEach((l: Row) => add({ kind: 'license', id: l.id }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cmp } = await (supabase.from('complaints') as any).select('id').eq('licensee_id', root.id).limit(200);
      (cmp ?? []).forEach((c: Row) => add({ kind: 'complaint', id: c.id }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: enf } = await (supabase.from('enforcement_actions') as any).select('id').eq('licensee_id', root.id).limit(200);
      (enf ?? []).forEach((e: Row) => add({ kind: 'enforcement_action', id: e.id }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rets } = await (supabase.from('returns_filed') as any).select('id').eq('entity_id', root.id).limit(200);
      (rets ?? []).forEach((r: Row) => add({ kind: 'return', id: r.id }));
    }
    if (root.kind === 'fp_individual') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: assess } = await (supabase.from('fp_assessments') as any).select('id, licensee_id').eq('individual_id', root.id);
      (assess ?? []).forEach((a: Row) => {
        add({ kind: 'fp_assessment', id: a.id });
        if (a.licensee_id) add({ kind: 'licensee', id: a.licensee_id });
      });
    }
    if (root.kind === 'complaint') {
      const c = await fetchOne('complaints', root.id, 'id, licensee_id');
      if (c?.licensee_id) add({ kind: 'licensee', id: c.licensee_id });
    }
    if (root.kind === 'enforcement_action') {
      const e = await fetchOne('enforcement_actions', root.id, 'id, licensee_id');
      if (e?.licensee_id) add({ kind: 'licensee', id: e.licensee_id });
    }
    if (root.kind === 'return') {
      const r = await fetchOne('returns_filed', root.id, 'id, entity_id');
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
  return: ['return', 'returns_filed', 'return_form_data'],
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

  // compliance_audit_logs (returns / compliance)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cal } = await (supabase.from('compliance_audit_logs') as any)
      .select('id, event_time, actor_id, actor_role, action_type, target_type, target_id, detail')
      .in('target_id', ids).order('event_time', { ascending: false }).limit(300);
    (cal ?? []).forEach((r: Row) => {
      const kind = (entities.find((e) => e.id === r.target_id)?.kind ?? 'system') as EntityKind | 'system';
      events.push({
        at: r.event_time, actor: r.actor_role ?? r.actor_id ?? null,
        action: r.action_type, entityKind: kind, entityId: r.target_id,
        module: 'compliance', detail: r.detail, source: 'compliance_audit_logs',
      });
    });
  } catch (_err) { /* table may differ across environments */ }

  // enforcement_case_events
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: enf } = await (supabase.from('enforcement_case_events') as any)
      .select('id, created_at, event_type, actor_id, enforcement_action_id, detail')
      .in('enforcement_action_id', ids).order('created_at', { ascending: false }).limit(200);
    (enf ?? []).forEach((r: Row) => {
      events.push({
        at: r.created_at, actor: r.actor_id ?? null,
        action: r.event_type, entityKind: 'enforcement_action',
        entityId: r.enforcement_action_id, module: 'enforcement',
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
