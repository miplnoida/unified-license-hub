/**
 * Document Register — the single governed listing of canonical documents.
 *
 * Rows, totals, filtering and paging are server authority (`dms_search_documents`).
 * Each canonical document is one row: two files uploaded through the same
 * multi-file form field remain two distinct documents with their own reference,
 * classification and status.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EnterpriseDataGrid } from '@/components/data-grid/EnterpriseDataGrid';
import { emptyGridState, type GridColumn, type GridState } from '@/components/data-grid/types';
import { DmsBadge } from '@/components/documents/dms/DmsBadges';
import { useDmsRegister, useDmsTaxonomy, type DmsRowSupplement } from '@/hooks/useDmsDocuments';
import type { DmsDocumentRow } from '@/services/dms';
import {
  DOCUMENT_STATUS_OPTIONS, formatDocumentSize, presentAcceptance, presentConfidentiality,
  presentContextType, presentDocumentStatus, presentLegalHold, presentPublication, presentScan,
  presentVerification,
} from '@/lib/presentation/dmsLabels';
import { formatDateTime } from '@/lib/datetime';
import { Search } from 'lucide-react';

const ALL = 'all';

export default function DocumentRegister() {
  const navigate = useNavigate();
  const [grid, setGrid] = useState<GridState>(emptyGridState(25));
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [includeArchived, setIncludeArchived] = useState(false);

  const { data: taxonomy } = useDmsTaxonomy();
  const filters = useMemo(() => ({
    search: search || undefined,
    categoryCode: category === ALL ? undefined : category,
    documentStatus: status === ALL ? undefined : status,
    includeArchived,
  }), [search, category, status, includeArchived]);

  const { data, isLoading, error, refetch } = useDmsRegister(filters, grid.pageIndex, grid.pageSize);
  const rows = data?.rows ?? [];
  const supplement = data?.supplement ?? {};
  const sup = (id: string): DmsRowSupplement => supplement[id] ?? {
    legalHoldStatus: 'none', scanStatus: 'unknown', isQuarantined: false, released: false,
    isDeleted: false, archivedAt: null, ownerName: null, entityName: null,
  };


  const columns: Array<GridColumn<DmsDocumentRow>> = useMemo(() => [
    {
      id: 'reference', header: 'Reference', mandatory: true, priority: 1, width: '160px',
      accessor: (r) => r.document_reference ?? '',
      cell: (r) => (
        <Link to={`/documents/registry/${r.id}`} className="font-mono text-xs text-primary hover:underline">
          {r.document_reference ?? 'Not referenced'}
        </Link>
      ),
    },
    {
      id: 'name', header: 'Document', priority: 1, minWidth: '240px', truncate: true,
      accessor: (r) => r.display_name ?? r.file_name ?? '',
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{r.display_name || r.file_name || 'Untitled document'}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {r.file_name || '—'} · {formatDocumentSize(r.file_size)}
            {r.current_version ? ` · version ${r.current_version}` : ''}
          </div>
        </div>
      ),
    },
    {
      id: 'type', header: 'Type', priority: 2, minWidth: '170px',
      accessor: (r) => r.category_name ?? r.document_type ?? '',
      cell: (r) => (
        <div className="min-w-0 text-sm">
          <div className="truncate">{r.category_name || 'Unclassified'}</div>
          {r.type_code && <div className="truncate text-[11px] text-muted-foreground">{r.type_code}</div>}
        </div>
      ),
    },
    {
      id: 'context', header: 'Linked to', priority: 2, minWidth: '190px',
      accessor: (r) => sup(r.id).entityName ?? r.source_record_type ?? '',
      cell: (r) => (
        <div className="min-w-0 text-sm">
          <div className="truncate">{sup(r.id).entityName || 'No owning entity'}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {presentContextType(r.source_record_type)}
          </div>
        </div>
      ),
    },
    {
      id: 'classification', header: 'Sensitivity', priority: 2, minWidth: '150px',
      accessor: (r) => r.confidentiality_classification ?? '',
      cell: (r) => <DmsBadge presented={presentConfidentiality(r.confidentiality_classification)} />,
    },
    {
      id: 'publication', header: 'Publication', priority: 3, minWidth: '150px', defaultVisible: false,
      accessor: (r) => r.publication_eligibility ?? '',
      cell: (r) => <DmsBadge presented={presentPublication(r.publication_eligibility)} />,
    },
    {
      id: 'verification', header: 'Verification', priority: 2, minWidth: '150px',
      accessor: (r) => r.verification_status ?? '',
      cell: (r) => <DmsBadge presented={presentVerification(r.verification_status)} />,
    },
    {
      id: 'acceptance', header: 'Acceptance', priority: 2, minWidth: '150px',
      accessor: (r) => r.acceptance_status ?? '',
      cell: (r) => <DmsBadge presented={presentAcceptance(r.acceptance_status)} />,
    },
    {
      id: 'scan', header: 'File safety', priority: 3, minWidth: '150px',
      accessor: (r) => sup(r.id).scanStatus,
      cell: (r) => <DmsBadge presented={presentScan(sup(r.id).scanStatus)} />,
    },
    {
      id: 'hold', header: 'Legal hold', priority: 3, minWidth: '130px',
      accessor: (r) => sup(r.id).legalHoldStatus,
      cell: (r) => <DmsBadge presented={presentLegalHold(sup(r.id).legalHoldStatus)} />,
    },
    {
      id: 'owner', header: 'Owner / uploader', priority: 3, minWidth: '180px', truncate: true,
      accessor: (r) => sup(r.id).ownerName ?? '',
      cell: (r) => <span className="text-sm">{sup(r.id).ownerName || 'Not recorded'}</span>,
    },
    {
      id: 'updated', header: 'Last updated', priority: 2, minWidth: '160px',
      accessor: (r) => r.updated_at ?? '',
      cell: (r) => <span className="text-xs text-muted-foreground">{r.updated_at ? formatDateTime(r.updated_at) : '—'}</span>,
    },
    {
      id: 'status', header: 'Record status', priority: 2, minWidth: '140px',
      accessor: (r) => r.document_status ?? '',
      cell: (r) => (
        <DmsBadge
          presented={presentDocumentStatus(
            sup(r.id).isDeleted ? 'deleted' : r.document_status ?? 'available',
          )}
        />
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [supplement]);

  return (
    <DashboardLayout>
      <PageHeader
        title="Document Register"
        description="Every canonical regulatory document, its classification, its assurance status and the record it belongs to."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Search</Label>
          <div className="flex gap-2">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(searchInput); setGrid({ ...grid, pageIndex: 0 }); } }}
              placeholder="Name or reference"
            />
            <Button variant="outline" onClick={() => { setSearch(searchInput); setGrid({ ...grid, pageIndex: 0 }); }}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={(v) => { setCategory(v); setGrid({ ...grid, pageIndex: 0 }); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {(taxonomy?.categories ?? []).map((c) => (
                <SelectItem key={c.id} value={c.code}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Record status</Label>
          <Select value={status} onValueChange={(v) => { setStatus(v); setGrid({ ...grid, pageIndex: 0 }); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {DOCUMENT_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2 pb-1">
          <Switch
            id="dms-archived"
            checked={includeArchived}
            onCheckedChange={(v) => { setIncludeArchived(v); setGrid({ ...grid, pageIndex: 0 }); }}
          />
          <Label htmlFor="dms-archived" className="cursor-pointer">Include archived and deleted</Label>
        </div>
      </div>

      <EnterpriseDataGrid
        gridId="dms-document-register"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        mode="server"
        totalCount={data?.total ?? 0}
        state={grid}
        onStateChange={setGrid}
        isLoading={isLoading}
        error={error ? 'The document register could not be loaded.' : null}
        onRefresh={() => refetch()}
        onRowClick={(r) => navigate(`/documents/registry/${r.id}`)}
        emptyTitle="No documents found"
        emptyDescription="No documents match these filters, or you do not have access to them."
        enableGlobalSearch={false}
        stickyHeader
        density="compact"
      />
    </DashboardLayout>
  );
}
