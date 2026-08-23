/**
 * Business labels for id-bearing routes.
 *
 * Breadcrumbs must never show a UUID. Each resolver is a small declarative
 * descriptor (table + id column + label columns) so adding a detail route needs
 * one registry line and, at most, one descriptor here.
 *
 * Failure is never fatal: if the record is not readable (RLS) or missing, the
 * caller keeps the static fallback label. Breadcrumbs are presentation only.
 */
import { supabase } from '@/integrations/supabase/client';

export interface LabelResolverDescriptor {
  /** Source table. */
  table: string;
  /** Primary key column. */
  idColumn: string;
  /** First non-empty column wins. */
  labelColumns: string[];
  /** Optional prefix, e.g. `Filing`. */
  prefix?: string;
  /** Static fallback when nothing resolves. */
  fallback: string;
}

export const labelResolvers: Record<string, LabelResolverDescriptor> = {
  entity: { table: 'licensees', idColumn: 'id', labelColumns: ['name'], fallback: 'Entity' },
  application: { table: 'applications', idColumn: 'id', labelColumns: ['application_number'], fallback: 'Application' },
  license: { table: 'licenses', idColumn: 'id', labelColumns: ['license_number'], fallback: 'Licence' },
  complaint: { table: 'complaints', idColumn: 'id', labelColumns: ['complaint_number', 'subject'], fallback: 'Complaint' },
  correspondence: { table: 'correspondence_threads', idColumn: 'id', labelColumns: ['reference', 'subject'], fallback: 'Correspondence' },
  filing: { table: 'return_filings', idColumn: 'id', labelColumns: ['filing_reference'], fallback: 'Filing' },
  legacyReturn: { table: 'returns_filed', idColumn: 'id', labelColumns: ['unique_id'], fallback: 'Return' },
  registration: { table: 'registrations', idColumn: 'id', labelColumns: ['registration_reference', 'registration_number', 'applicant_name'], fallback: 'Registration' },
  investigation: { table: 'conduct_investigations', idColumn: 'id', labelColumns: ['code'], fallback: 'Investigation' },
  thematicReview: { table: 'thematic_reviews', idColumn: 'id', labelColumns: ['code', 'title'], fallback: 'Thematic review' },
  fpIndividual: { table: 'fp_individuals', idColumn: 'id', labelColumns: ['full_name'], fallback: 'Individual' },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Static child segments (e.g. `/licenses/lifecycle`) can occupy the same
 * position as an id in the route registry. Resolving them would send a
 * non-uuid to a uuid column and produce a 400 from the data API, so the
 * resolver only runs for real uuid keys.
 */
export function isResolvableId(id: string | undefined): boolean {
  return !!id && UUID_RE.test(id);
}

/** Resolve a single business label. Returns null when nothing is readable. */
export async function resolveLabel(resolverKey: string, id: string): Promise<string | null> {
  const descriptor = labelResolvers[resolverKey];
  if (!descriptor || !id) return null;
  if (!isResolvableId(id)) return null;
  const { data, error } = await (supabase as any)
    .from(descriptor.table)
    .select(descriptor.labelColumns.join(', '))
    .eq(descriptor.idColumn, id)
    .maybeSingle();
  if (error || !data) return null;
  for (const column of descriptor.labelColumns) {
    const value = (data as Record<string, unknown>)[column];
    if (typeof value === 'string' && value.trim()) {
      const label = value.trim();
      return descriptor.prefix ? `${descriptor.prefix} ${label}` : label;
    }
  }
  return null;
}

export function resolverFallback(resolverKey: string | undefined): string | null {
  if (!resolverKey) return null;
  return labelResolvers[resolverKey]?.fallback ?? null;
}
