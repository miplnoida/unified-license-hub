/**
 * Canonical DMS context derivation.
 *
 * Every governed upload (registration, pre-licensing, post-licensing, generic
 * form submissions) is registered in the Central Document Register with the
 * module it originated from, the source record it is attached to, and a
 * conservative default classification taken from the taxonomy.
 *
 * The owning regulated entity is NEVER derived on the client — an application
 * id is not an entity id. The governed RPC resolves the entity server-side and
 * leaves the document deliberately unresolved (and reconcilable) when it
 * cannot.
 */
import type { DmsSourceContextInput } from '@/services/dms';

export interface DmsContextSource {
  /** Upload `entityType` used by the versioned document pipeline. */
  entityType: string;
  /** Upload `entityId` — an application / registration / submission id, not an entity id. */
  entityId?: string | null;
  submissionId?: string | null;
  /** Optional business reference (application number, registration reference). */
  sourceReference?: string | null;
  /** Explicit overrides where the caller knows better. */
  categoryCode?: string | null;
  typeCode?: string | null;
}

const REGISTRATION_TYPES = new Set(['registration', 'pre_registration', 'registration_form']);
const APPLICATION_TYPES = new Set([
  'application', 'pre_license_application', 'post_license_application', 'form_submission',
]);

/**
 * Map an upload call site onto the canonical DMS source context. Returns null
 * when there is nothing meaningful to register (no source record at all).
 */
export function deriveDmsContext(src: DmsContextSource): DmsSourceContextInput | null {
  const recordId = src.entityId || src.submissionId || null;
  if (!recordId) return null;

  if (REGISTRATION_TYPES.has(src.entityType)) {
    return {
      sourceModule: 'registration',
      sourceRecordType: 'registration',
      sourceRecordId: recordId,
      sourceReference: src.sourceReference ?? null,
      categoryCode: src.categoryCode ?? 'corporate_registration',
      typeCode: src.typeCode ?? 'application_supporting_document',
    };
  }

  if (APPLICATION_TYPES.has(src.entityType)) {
    return {
      sourceModule: 'licensing',
      sourceRecordType: 'application',
      sourceRecordId: recordId,
      sourceReference: src.sourceReference ?? null,
      categoryCode: src.categoryCode ?? 'licensing',
      typeCode: src.typeCode ?? 'application_supporting_document',
    };
  }

  if (src.entityType === 'entity' || src.entityType === 'licensee') {
    return {
      sourceModule: 'entity',
      sourceRecordType: 'entity',
      sourceRecordId: recordId,
      sourceReference: src.sourceReference ?? null,
      categoryCode: src.categoryCode ?? 'other',
      typeCode: src.typeCode ?? 'general_document',
    };
  }

  return {
    sourceModule: src.entityType,
    sourceRecordType: src.entityType,
    sourceRecordId: recordId,
    sourceReference: src.sourceReference ?? null,
    categoryCode: src.categoryCode ?? 'other',
    typeCode: src.typeCode ?? 'general_document',
  };
}
