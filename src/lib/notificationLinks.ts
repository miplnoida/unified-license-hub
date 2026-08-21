/**
 * Resolves a notification's source record into an in-app deep link.
 * Returns null when the notification has no navigable source record.
 */
const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  application: (id) => `/applications/${id}`,
  applications: (id) => `/applications/${id}`,
  registration: (id) => `/admin/registrations/${id}`,
  license: (id) => `/licenses/${id}`,
  licensee: (id) => `/entities/${id}`,
  return_filed: (id) => `/returns-mgmt/${id}`,
  return: (id) => `/returns-mgmt/${id}`,
  complaint: (id) => `/complaints/${id}`,
  correspondence_thread: (id) => `/correspondence/${id}`,
  correspondence: (id) => `/correspondence/${id}`,
  fp_individual: (id) => `/fpa/individuals/${id}`,
  fp_assessment: (id) => `/fpa/assessments/${id}`,
  fp_finding: (id) => `/fpa/findings/${id}`,
  fp_condition: (id) => `/fpa/entity/condition/${id}`,
  fp_appeal: (id) => `/fpa/entity/appeal/${id}`,
  fp_monitoring_event: (id) => `/fpa/entity/monitoring_event/${id}`,
  fp_determination: (id) => `/fpa/entity/determination/${id}`,
  prudential_assessment: (id) => `/prudential/assessments/${id}`,
  enforcement_action: (id) => `/enforcement/${id}`,
  inspection: (id) => `/inspections/${id}`,
  license_appeal: (id) => `/admin/license-appeals?appeal=${id}`,
  compliance_return: (id) => `/compliance/${id}`,
  payment: (id) => `/payments/${id}`,
  report: (id) => `/reports/${id}`,
  form_template: (id) => `/admin/forms/${id}`,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function notificationLink(
  entityType?: string | null,
  entityId?: string | null,
  metadata?: Record<string, unknown> | null,
): string | null {
  const explicit = metadata?.['link'] ?? metadata?.['url'];
  if (typeof explicit === 'string' && explicit.startsWith('/')) return explicit;

  if (!entityType || !entityId) return null;
  const resolver = ENTITY_ROUTES[entityType.toLowerCase()];
  if (!resolver) return null;
  // Only navigate on record identifiers we can trust as a route param.
  if (!UUID_RE.test(entityId) && !/^[A-Za-z0-9._-]+$/.test(entityId)) return null;
  return resolver(entityId);
}

export function hasNotificationLink(
  entityType?: string | null,
  entityId?: string | null,
  metadata?: Record<string, unknown> | null,
): boolean {
  return notificationLink(entityType, entityId, metadata) !== null;
}
