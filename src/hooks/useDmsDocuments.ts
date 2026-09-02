/**
 * Read hooks for the Document Register and Document Detail screens.
 *
 * Authoritative reads come from the governed DMS RPCs (`dms_search_documents`,
 * `dms_get_document`). A small, strictly read-only supplement resolves display
 * names (owning entity, uploader) and safety state (security scan, legal hold)
 * for the rows on the current page so the register never shows a raw id. The
 * supplement degrades silently: unknown safety state is presented as unknown,
 * never as safe.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  getDocument, searchDocuments, type DmsDocumentDetail, type DmsDocumentRow,
} from '@/services/dms';
import { isFileQuarantined, isFileReleased } from '@/lib/presentation/dmsLabels';


export interface DmsRegisterFilters {
  search?: string;
  categoryCode?: string;
  documentStatus?: string;
  includeArchived?: boolean;
  entityId?: string;
  typeCode?: string;
  sourceModule?: string;
  confidentiality?: string;
  verificationStatus?: string;
  acceptanceStatus?: string;
  /** pending / retry_required documents whose canonical context is incomplete. */
  contextStatus?: string;
}

export interface DmsRowSupplement {
  legalHoldStatus: string;
  /** Authoritative scan verdict of the current file (never a version status). */
  scanStatus: string;
  isQuarantined: boolean;
  /** True only when the file has passed security release (mirrors the server rule). */
  released: boolean;
  isDeleted: boolean;
  archivedAt: string | null;
  ownerName: string | null;
  entityName: string | null;
}

export interface DmsRegisterResult {
  rows: DmsDocumentRow[];
  total: number;
  supplement: Record<string, DmsRowSupplement>;
}

const EMPTY_SUPPLEMENT: DmsRowSupplement = {
  legalHoldStatus: 'none', scanStatus: 'unknown', isQuarantined: false, released: false,
  isDeleted: false, archivedAt: null, ownerName: null, entityName: null,
};


async function buildSupplement(rows: DmsDocumentRow[]): Promise<Record<string, DmsRowSupplement>> {
  const out: Record<string, DmsRowSupplement> = {};
  rows.forEach((r) => { out[r.id] = { ...EMPTY_SUPPLEMENT }; });
  if (!rows.length) return out;

  const ids = rows.map((r) => r.id);
  try {
    const [{ data: groups }, { data: versions }] = await Promise.all([
      supabase.from('document_groups')
        .select('id, legal_hold_status, is_deleted, archived_at, owner_id, primary_entity_id, current_version_id')
        .in('id', ids),
      supabase.from('document_versions').select('id, group_id, file_upload_id').in('group_id', ids),
    ]);

    const fileIdByVersion = new Map((versions ?? []).map((v: any) => [v.id as string, v.file_upload_id as string]));
    const fileIds = [...new Set((versions ?? []).map((v: any) => v.file_upload_id).filter(Boolean))] as string[];
    const ownerIds = [...new Set((groups ?? []).map((g: any) => g.owner_id).filter(Boolean))] as string[];
    const entityIds = [...new Set((groups ?? []).map((g: any) => g.primary_entity_id).filter(Boolean))] as string[];

    const [{ data: files }, { data: owners }, { data: entities }] = await Promise.all([
      fileIds.length
        ? supabase.from('file_uploads').select('id, scan_status, is_quarantined').in('id', fileIds)
        : Promise.resolve({ data: [] as any[] }),
      ownerIds.length
        ? supabase.from('profiles').select('id, email').in('id', ownerIds)
        : Promise.resolve({ data: [] as any[] }),
      entityIds.length
        ? supabase.from('licensees').select('id, name').in('id', entityIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const fileById = new Map((files ?? []).map((f: any) => [f.id as string, f]));
    const ownerByid = new Map((owners ?? []).map((p: any) => [p.id as string, p.email as string]));
    const entityById = new Map((entities ?? []).map((e: any) => [e.id as string, e.name as string]));

    (groups ?? []).forEach((g: any) => {
      const fileId = g.current_version_id ? fileIdByVersion.get(g.current_version_id) : undefined;
      const file = fileId ? fileById.get(fileId) : undefined;
      out[g.id] = {
        legalHoldStatus: g.legal_hold_status ?? 'none',
        scanStatus: file?.scan_status || 'unknown',
        isQuarantined: isFileQuarantined(file),
        released: isFileReleased(file),
        isDeleted: !!g.is_deleted,
        archivedAt: g.archived_at ?? null,
        ownerName: ownerByid.get(g.owner_id) ?? null,
        entityName: g.primary_entity_id ? entityById.get(g.primary_entity_id) ?? null : null,
      };
    });

  } catch {
    // Supplement is best-effort presentation only — keep the conservative defaults.
  }
  return out;
}

export function useDmsRegister(filters: DmsRegisterFilters, pageIndex: number, pageSize: number) {
  return useQuery<DmsRegisterResult>({
    queryKey: ['dms', 'register', filters, pageIndex, pageSize],
    queryFn: async () => {
      const res = await searchDocuments({
        search: filters.search || null,
        categoryCode: filters.categoryCode || null,
        documentStatus: filters.documentStatus || null,
        includeArchived: !!filters.includeArchived,
        entityId: filters.entityId || null,
        typeCode: filters.typeCode || null,
        sourceModule: filters.sourceModule || null,
        confidentiality: filters.confidentiality || null,
        verificationStatus: filters.verificationStatus || null,
        acceptanceStatus: filters.acceptanceStatus || null,
        contextStatus: filters.contextStatus || null,
        limit: pageSize,
        offset: pageIndex * pageSize,
      });
      if ('error' in res) throw new Error(res.error);
      const supplement = await buildSupplement(res.data.rows);
      return { rows: res.data.rows, total: res.data.total, supplement };
    },
    staleTime: 30_000,
  });
}

export function useDmsDocument(groupId: string | undefined) {
  return useQuery<DmsDocumentDetail>({
    queryKey: ['dms', 'document', groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const res = await getDocument(groupId!);
      if ('error' in res) throw new Error(res.error);
      return res.data;
    },
  });
}

export interface DmsCategoryOption {
  id: string; code: string; name: string; domain: string | null;
  requires_verification: boolean; requires_acceptance: boolean;
}
export interface DmsTypeOption { id: string; code: string; name: string; category_id: string | null }

export function useDmsTaxonomy() {
  return useQuery<{ categories: DmsCategoryOption[]; types: DmsTypeOption[] }>({
    queryKey: ['dms', 'taxonomy'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const [{ data: categories }, { data: types }] = await Promise.all([
        supabase.from('document_categories')
          .select('id, code, name, domain, requires_verification, requires_acceptance')
          .eq('is_active', true).order('sort_order'),
        supabase.from('document_types').select('id, code, name, category_id').order('name'),
      ]);
      return {
        categories: (categories ?? []) as DmsCategoryOption[],
        types: (types ?? []) as DmsTypeOption[],
      };
    },
  });
}

export interface DmsRetentionOption { id: string; code: string; name: string }

export function useDmsRetentionPolicies() {
  return useQuery<DmsRetentionOption[]>({
    queryKey: ['dms', 'retention-policies'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('document_retention_policies').select('id, code, name').order('name');
      return (data ?? []) as DmsRetentionOption[];
    },
  });
}
