/**
 * F1-B / GAP-F1-03 — governed configuration write surface.
 *
 * Every master-configuration create/update/retire/delete from the browser goes
 * through the canonical SECURITY DEFINER writers:
 *   public.config_save(table, payload, id, reason)
 *   public.config_retire(table, id, reason, reactivate)
 *   public.config_delete(table, id, reason)
 *
 * The writers enforce canonical RBAC (`config_governed_tables` registry) and
 * record a before/after entry in `public.config_change_log`. Direct DML on the
 * governed tables is revoked for `authenticated`, so a re-introduced
 * `.insert()/.update()/.delete()` fails at runtime — see
 * `src/test/config/governedConfigWrites.test.ts`.
 */
import { supabase } from '@/integrations/supabase/client';

export type GovernedConfigTable =
  | 'sectors'
  | 'sub_sectors'
  | 'categories'
  | 'services'
  | 'regulators'
  | 'master_data_types'
  | 'master_data_items'
  | 'fee_types'
  | 'fee_configurations'
  | 'fee_rules'
  | 'sla_configurations'
  | 'sla_escalation_tiers'
  | 'business_calendar_profiles'
  | 'business_calendar_holidays'
  | 'return_configurations'
  | 'return_types'
  | 'return_configs'
  | 'return_config_forms'
  | 'return_cutoff_config'
  | 'late_fee_structures'
  | 'late_fee_penalty_tiers'
  | 'return_notification_templates'
  | 'complaint_types'
  | 'registration_form_configs'
  | 'captcha_configurations'
  | 'notification_event_configs'
  | 'decision_authority_rules';

export interface ConfigChangeLogEntry {
  id: string;
  table_name: string;
  record_id: string | null;
  action: 'CREATE' | 'UPDATE' | 'RETIRE' | 'REACTIVATE' | 'DELETE';
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  reason: string | null;
  changed_by: string | null;
  changed_by_role: string | null;
  changed_at: string;
}

/** Translate the writer's structured failures into operator-facing messages. */
export function toConfigWriteError(error: unknown, entityLabel = 'configuration'): Error {
  const raw = (error as { message?: string })?.message ?? '';
  const code = (error as { code?: string })?.code ?? '';

  if (code === '42501' || raw.includes('not_authorised') || raw.includes('permission denied')) {
    return new Error(`You do not have permission to change ${entityLabel}.`);
  }
  if (raw.includes('config_table_not_governed')) {
    return new Error('This configuration area is not registered for governed writes.');
  }
  if (raw.includes('config_hard_delete_forbidden')) {
    return new Error(`${entityLabel} must be retired rather than deleted, because history references it.`);
  }
  if (raw.includes('config_record_not_found')) {
    return new Error(`That ${entityLabel} record no longer exists — refresh and try again.`);
  }
  if (raw.includes('config_payload_empty')) {
    return new Error('No changes were supplied.');
  }
  if (raw.includes('duplicate key') || raw.includes('unique constraint') || code === '23505') {
    return new Error(`A ${entityLabel} record with these details already exists.`);
  }
  return new Error(raw || `Could not save ${entityLabel}.`);
}

async function rpc<T>(fn: string, args: Record<string, unknown>, entityLabel: string): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw toConfigWriteError(error, entityLabel);
  return data as unknown as T;
}

/** Create (id omitted) or update (id supplied) a governed configuration row. */
export function configSave<T = Record<string, unknown>>(
  table: GovernedConfigTable,
  payload: Record<string, unknown>,
  options: { id?: string | null; reason?: string | null; entityLabel?: string } = {},
): Promise<T> {
  const clean: Record<string, unknown> = {};
  Object.entries(payload).forEach(([k, v]) => { if (v !== undefined) clean[k] = v; });
  return rpc<T>(
    'config_save',
    { _table_name: table, _payload: clean, _id: options.id ?? null, _reason: options.reason ?? null },
    options.entityLabel ?? table.replace(/_/g, ' '),
  );
}

/** Retire (soft delete) or reactivate a governed configuration row. */
export function configRetire<T = Record<string, unknown>>(
  table: GovernedConfigTable,
  id: string,
  options: { reason?: string | null; reactivate?: boolean; entityLabel?: string } = {},
): Promise<T> {
  return rpc<T>(
    'config_retire',
    { _table_name: table, _id: id, _reason: options.reason ?? null, _reactivate: options.reactivate ?? false },
    options.entityLabel ?? table.replace(/_/g, ' '),
  );
}

/** Hard delete — only permitted for registry rows flagged `allow_hard_delete`. */
export function configDelete<T = Record<string, unknown>>(
  table: GovernedConfigTable,
  id: string,
  options: { reason?: string | null; entityLabel?: string } = {},
): Promise<T> {
  return rpc<T>(
    'config_delete',
    { _table_name: table, _id: id, _reason: options.reason ?? null },
    options.entityLabel ?? table.replace(/_/g, ' '),
  );
}

/** Audit history for a governed configuration table (optionally one record). */
export function configChangeHistory(
  table: GovernedConfigTable,
  recordId?: string | null,
  limit = 100,
): Promise<ConfigChangeLogEntry[]> {
  return rpc<ConfigChangeLogEntry[]>(
    'config_change_history',
    { _table_name: table, _record_id: recordId ?? null, _limit: limit },
    table.replace(/_/g, ' '),
  );
}

/**
 * Governed writer for key/value site settings (branding, general, email/SMS,
 * review, licence expiry, captcha switches). Enforces `settings.edit` and
 * records masked before/after audit evidence.
 */
export async function siteSettingSave(key: string, value: unknown, reason?: string | null): Promise<void> {
  const { error } = await supabase.rpc('site_settings_save' as never, {
    _key: key, _value: value as never, _reason: reason ?? null,
  } as never);
  if (error) throw toConfigWriteError(error, 'site settings');
}
