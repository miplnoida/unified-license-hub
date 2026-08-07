import { supabase } from '@/integrations/supabase/client';

export type ComplianceAuditAction =
  | 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'OVERRIDE'
  | 'EXPORT' | 'ACCESS_DENIED' | 'WORKFLOW_TRANSITION' | 'NOTIFICATION_SENT'
  | 'INTEGRATION_EVENT' | 'LOGIN' | 'LOGOUT';

export type SecurityEventType =
  | 'ACCESS_DENIED' | 'AUTH_FAILED' | 'PERMISSION_ESCALATION' | 'INTEGRATION_FAILURE';

export interface ComplianceAuditInput {
  action_type: ComplianceAuditAction;
  object_type: string;
  object_id?: string | null;
  before_value?: Record<string, unknown> | unknown[] | null;
  after_value?: Record<string, unknown> | unknown[] | null;
  justification?: string | null;
  ai_model_version?: string | null;
  ip_address?: string | null;
  metadata?: Record<string, unknown> | null;
}

let cachedIp: string | null = null;
async function resolveIp(): Promise<string | null> {
  if (cachedIp !== null) return cachedIp;
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    if (!res.ok) return (cachedIp = '');
    const j = await res.json();
    cachedIp = j?.ip || '';
    return cachedIp;
  } catch {
    cachedIp = '';
    return cachedIp;
  }
}

function baseMetadata(extra?: Record<string, unknown> | null): Record<string, unknown> {
  return {
    ...(extra ?? {}),
    route: typeof window !== 'undefined' ? window.location.pathname + window.location.search : null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    logged_at: new Date().toISOString(),
  };
}

export async function logComplianceAudit(entry: ComplianceAuditInput): Promise<void> {
  if (entry.action_type === 'OVERRIDE' && (!entry.justification || entry.justification.trim().length < 10)) {
    throw new Error('Override requires a written justification (min 10 characters).');
  }
  const ip = entry.ip_address ?? (await resolveIp());
  const metadata = baseMetadata(entry.metadata);
  const { error } = await supabase.rpc('log_compliance_audit' as any, {
    _action_type: entry.action_type,
    _object_type: entry.object_type,
    _object_id: entry.object_id ?? null,
    _before_value: (entry.before_value ?? null) as any,
    _after_value: (entry.after_value ?? null) as any,
    _justification: entry.justification ?? null,
    _ai_model_version: entry.ai_model_version ?? null,
    _ip_address: ip || null,
    _metadata: metadata as any,
  });
  if (error && import.meta.env.DEV) {
    console.warn('[logComplianceAudit] failed:', error.message);
  }
}

export async function logSecurityEvent(
  event_type: SecurityEventType,
  opts: {
    target_resource?: string;
    detail?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    severity?: 'critical' | 'high' | 'medium' | 'low';
    module?: string;
    action?: string;
    object_type?: string;
    object_id?: string;
    correlation_id?: string;
  } = {},
): Promise<void> {
  const ip = await resolveIp();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null;
  const metadata = baseMetadata(opts.metadata);
  const { error } = await supabase.rpc('log_security_event' as any, {
    _event_type: event_type,
    _target_resource: opts.target_resource ?? null,
    _ip_address: ip || null,
    _user_agent: ua,
    _detail: (opts.detail ?? null) as any,
    _metadata: metadata as any,
    _severity: opts.severity ?? 'medium',
    _module: opts.module ?? null,
    _action: opts.action ?? null,
    _object_type: opts.object_type ?? null,
    _object_id: opts.object_id ?? null,
    _correlation_id: opts.correlation_id ?? null,
  });
  if (error && import.meta.env.DEV) {
    console.warn('[logSecurityEvent] failed:', error.message);
  }
}


export async function logExport(args: {
  object_type: string;
  format: 'CSV' | 'PDF' | 'JSON' | 'XLSX' | string;
  criteria?: Record<string, unknown>;
  record_ids?: Array<string | number>;
  record_count?: number;
}): Promise<void> {
  await logComplianceAudit({
    action_type: 'EXPORT',
    object_type: args.object_type,
    after_value: {
      format: args.format,
      criteria: args.criteria ?? {},
      record_count: args.record_count ?? args.record_ids?.length ?? 0,
      record_ids: args.record_ids ?? [],
    },
  });
}

export async function logLogin(email?: string): Promise<void> {
  await logComplianceAudit({
    action_type: 'LOGIN',
    object_type: 'auth.session',
    after_value: { email: email ?? null },
  });
}

export async function logLogout(userId?: string): Promise<void> {
  await logComplianceAudit({
    action_type: 'LOGOUT',
    object_type: 'auth.session',
    object_id: userId ?? null,
  });
}

export async function logNotificationDispatch(args: {
  event_key: string;
  entity_type?: string;
  entity_id?: string;
  recipients?: number;
  channel?: string;
}): Promise<void> {
  await logComplianceAudit({
    action_type: 'NOTIFICATION_SENT',
    object_type: args.entity_type ?? 'notification',
    object_id: args.entity_id ?? null,
    after_value: {
      event_key: args.event_key,
      recipients: args.recipients ?? null,
      channel: args.channel ?? null,
    },
  });
}

export async function logIntegrationFailure(args: {
  integration: string;
  target_resource?: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await logSecurityEvent('INTEGRATION_FAILURE', {
    target_resource: args.target_resource ?? args.integration,
    detail: { integration: args.integration, ...(args.detail ?? {}) },
  });
}
