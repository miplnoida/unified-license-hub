type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

function bestEffortMetadata(metadata?: Record<string, unknown> | null): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    logged_at: new Date().toISOString(),
    source_runtime: 'edge_function',
  };
}

export async function logComplianceAudit(
  client: RpcClient,
  args: {
    actorId: string;
    actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'OVERRIDE' | 'EXPORT' | 'ACCESS_DENIED' | 'WORKFLOW_TRANSITION' | 'NOTIFICATION_SENT' | 'INTEGRATION_EVENT' | 'LOGIN' | 'LOGOUT';
    objectType: string;
    objectId?: string | null;
    beforeValue?: Record<string, unknown> | unknown[] | null;
    afterValue?: Record<string, unknown> | unknown[] | null;
    justification?: string | null;
    aiModelVersion?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    const { error } = await client.rpc('log_compliance_audit_as_actor', {
      _actor_id: args.actorId,
      _action_type: args.actionType,
      _object_type: args.objectType,
      _object_id: args.objectId ?? null,
      _before_value: args.beforeValue ?? null,
      _after_value: args.afterValue ?? null,
      _justification: args.justification ?? null,
      _ai_model_version: args.aiModelVersion ?? null,
      _ip_address: args.ipAddress ?? null,
      _user_agent: args.userAgent ?? null,
      _metadata: bestEffortMetadata(args.metadata),
    });
    if (error) console.warn('[audit] compliance audit failed:', error.message ?? error);
  } catch (error) {
    console.warn('[audit] compliance audit failed:', error);
  }
}

export async function logSecurityEvent(
  client: RpcClient,
  args: {
    actorId: string;
    eventType: 'ACCESS_DENIED' | 'AUTH_FAILED' | 'PERMISSION_ESCALATION' | 'INTEGRATION_FAILURE';
    targetResource?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    detail?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
    severity?: 'critical' | 'high' | 'medium' | 'low';
    module?: string | null;
    action?: string | null;
    objectType?: string | null;
    objectId?: string | null;
    correlationId?: string | null;
  },
): Promise<void> {
  try {
    const { error } = await client.rpc('log_security_event_as_actor', {
      _actor_id: args.actorId,
      _event_type: args.eventType,
      _target_resource: args.targetResource ?? null,
      _ip_address: args.ipAddress ?? null,
      _user_agent: args.userAgent ?? null,
      _detail: args.detail ?? null,
      _metadata: bestEffortMetadata(args.metadata),
      _severity: args.severity ?? 'medium',
      _module: args.module ?? null,
      _action: args.action ?? null,
      _object_type: args.objectType ?? null,
      _object_id: args.objectId ?? null,
      _correlation_id: args.correlationId ?? null,
    });
    if (error) console.warn('[audit] security event failed:', error.message ?? error);
  } catch (error) {
    console.warn('[audit] security event failed:', error);
  }
}
