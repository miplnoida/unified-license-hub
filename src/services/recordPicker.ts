/**
 * Record picker service.
 *
 * Officers must never be asked to type, paste or otherwise handle a database
 * identifier. When a document has to be linked to a regulatory record, the user
 * picks the *business record* — by its reference, title or entity — and the
 * internal identifier is resolved behind this service boundary.
 *
 * Reads go through the governed `record_picker_search` operation, which runs
 * with the caller's own privileges so row-level visibility of each domain is
 * enforced by the database. It is read-only, server-paged and returns a
 * `total_count` taken from the same filtered population.
 */
import { supabase } from '@/integrations/supabase/client';

export type RecordPickerType =
  | 'entity'
  | 'application'
  | 'license'
  | 'complaint'
  | 'investigation'
  | 'return'
  | 'correspondence'
  | 'fit_and_proper'
  | 'inspection'
  | 'assessment'
  | 'finding'
  | 'enforcement';

export interface RecordPickerOption {
  value: RecordPickerType;
  label: string;
  /** What the officer can search on, in business language. */
  searchHint: string;
}

/** Record types a document can be linked to, in business language. */
export const RECORD_PICKER_TYPES: RecordPickerOption[] = [
  { value: 'entity', label: 'Regulated entity', searchHint: 'Search by entity name' },
  { value: 'application', label: 'Licensing application', searchHint: 'Search by application reference or entity' },
  { value: 'license', label: 'Licence', searchHint: 'Search by licence number, type or entity' },
  { value: 'return', label: 'Regulatory return', searchHint: 'Search by return name, period or entity' },
  { value: 'complaint', label: 'Complaint', searchHint: 'Search by complaint reference, complainant or entity' },
  { value: 'investigation', label: 'Investigation', searchHint: 'Search by investigation reference or entity' },
  { value: 'inspection', label: 'Examination', searchHint: 'Search by examination reference, title or entity' },
  { value: 'assessment', label: 'Supervisory assessment', searchHint: 'Search by assessment reference or entity' },
  { value: 'finding', label: 'Supervisory finding', searchHint: 'Search by finding reference, title or entity' },
  { value: 'enforcement', label: 'Enforcement case', searchHint: 'Search by case or notice reference' },
  { value: 'fit_and_proper', label: 'Fit and proper assessment', searchHint: 'Search by individual or entity' },
  { value: 'correspondence', label: 'Correspondence', searchHint: 'Search by correspondence reference or sender' },

];

const TYPE_LABEL = new Map(RECORD_PICKER_TYPES.map((t) => [t.value, t.label]));

export function presentRecordType(type?: string | null): string {
  if (!type) return 'Record';
  return TYPE_LABEL.get(type as RecordPickerType) ?? type;
}

export interface RecordPickerRow {
  /** Internal identifier — used for the governed link call, never displayed. */
  recordId: string;
  recordType: RecordPickerType;
  reference: string | null;
  title: string | null;
  entityName: string | null;
  secondary: string | null;
  status: string | null;
  recordDate: string | null;
}

export interface RecordPickerResult {
  rows: RecordPickerRow[];
  total: number;
}

export interface RecordPickerQuery {
  recordType: RecordPickerType;
  search?: string | null;
  /** Context entity — matching records are ranked first, deterministically. */
  entityId?: string | null;
  /** 1-based. */
  page?: number;
  pageSize?: number;
}

export const RECORD_PICKER_PAGE_SIZES = [10, 25, 50, 100] as const;

/** Human-readable label for a picked record, with no technical identifier. */
export function describeRecord(row: RecordPickerRow): string {
  return row.reference || row.title || row.entityName || presentRecordType(row.recordType);
}

export async function searchRecords(
  q: RecordPickerQuery,
): Promise<{ data: RecordPickerResult } | { error: string }> {
  const pageSize = Math.min(Math.max(q.pageSize ?? 25, 1), 100);
  const page = Math.max(q.page ?? 1, 1);

  const { data, error } = await (supabase as any).rpc('record_picker_search', {
    _record_type: q.recordType,
    _search: q.search?.trim() || null,
    _entity_id: q.entityId || null,
    _page: page,
    _page_size: pageSize,
  });

  if (error) return { error: error.message };

  const raw = (data ?? []) as any[];
  return {
    data: {
      total: raw.length ? Number(raw[0].total_count ?? 0) : 0,
      rows: raw.map((r) => ({
        recordId: r.record_id as string,
        recordType: r.record_type as RecordPickerType,
        reference: r.reference ?? null,
        title: r.title ?? null,
        entityName: r.entity_name ?? null,
        secondary: r.secondary ?? null,
        status: r.record_status ?? null,
        recordDate: r.record_date ?? null,
      })),
    },
  };
}

export function describeRecordPickerError(message: string): string {
  if (message.includes('not_authenticated')) return 'You must be signed in to search records.';
  if (message.includes('unsupported_record_type')) return 'That record type cannot be linked.';
  return 'The record search could not be completed. Please try again.';
}
