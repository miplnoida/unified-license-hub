/**
 * Entity → Documents workspace.
 *
 * A reusable, read-mostly view of every canonical document owned by (or linked
 * to) one regulated entity. Rows, totals and visibility are server authority
 * (`dms_search_documents` via the governed service layer) — this component adds
 * no client-side access logic and never queries document tables directly.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddDocumentDialog } from '@/components/documents/AddDocumentDialog';
import { Card, CardContent } from '@/components/ui/card';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EnterpriseDataGrid } from '@/components/data-grid/EnterpriseDataGrid';
import { emptyGridState, type GridColumn, type GridState } from '@/components/data-grid/types';
import { DmsBadge } from '@/components/documents/dms/DmsBadges';
import { useDmsTaxonomy } from '@/hooks/useDmsDocuments';
import { listEntityDocuments, type DmsDocumentRow } from '@/services/dms';
import {
  CONFIDENTIALITY_OPTIONS, DOCUMENT_STATUS_OPTIONS, formatDocumentSize, presentAcceptance,
  presentConfidentiality, presentContextType, presentDocumentStatus, presentPublication,
  presentVerification,
} from '@/lib/presentation/dmsLabels';
import { formatDate, formatDateTime } from '@/lib/datetime';

const ALL = 'all';

const SOURCE_MODULES = [
  { value: 'registration', label: 'Registration' },
  { value: 'licensing', label: 'Licensing' },
  { value: 'returns', label: 'Returns' },
  { value: 'entity', label: 'Entity' },
];

const VERIFICATION_OPTIONS = [
  { value: 'not_required', label: 'Not required' },
  { value: 'pending', label: 'Awaiting verification' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
];

const ACCEPTANCE_OPTIONS = [
  { value: 'not_required', label: 'Not required' },
  { value: 'pending', label: 'Awaiting acceptance' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'conditionally_accepted', label: 'Accepted with conditions' },
  { value: 'rejected', label: 'Rejected' },
];

export interface EntityDocumentsProps {
  entityId: string;
  /** Optional heading suppression when embedded in a tab that already labels itself. */
  hideIntro?: boolean;
}

export default function EntityDocuments({ entityId, hideIntro }: EntityDocumentsProps) {
  const [grid, setGrid] = useState<GridState>(emptyGridState(25));
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(ALL);
  const [typeCode, setTypeCode] = useState(ALL);
  const [sourceModule, setSourceModule] = useState(ALL);
  const [confidentiality, setConfidentiality] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [verification, setVerification] = useState(ALL);
  const [acceptance, setAcceptance] = useState(ALL);
  const [includeArchived, setIncludeArchived] = useState(false);

  const { data: taxonomy } = useDmsTaxonomy();

  const params = useMemo(() => ({
    search: search || null,
    categoryCode: category === ALL ? null : category,
    typeCode: typeCode === ALL ? null : typeCode,
    sourceModule: sourceModule === ALL ? null : sourceModule,
    confidentiality: confidentiality === ALL ? null : confidentiality,
    documentStatus: status === ALL ? null : status,
    verificationStatus: verification === ALL ? null : verification,
    acceptanceStatus: acceptance === ALL ? null : acceptance,
    includeArchived,
  }), [search, category, typeCode, sourceModule, confidentiality, status, verification, acceptance, includeArchived]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dms', 'entity-documents', entityId, params, grid.pageIndex, grid.pageSize],
    enabled: !!entityId,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await listEntityDocuments(entityId, {
        ...params,
        limit: grid.pageSize,
        offset: grid.pageIndex * grid.pageSize,
      });
      if ('error' in res) throw new Error(res.error);
      return res.data;
    },
  });

  const rows = data?.rows ?? [];

  const columns: Array<GridColumn<DmsDocumentRow>> = useMemo(() => [
    {
      id: 'reference', header: 'Reference', mandatory: true, priority: 1, width: '150px',
      accessor: (r) => r.document_reference ?? '',
      cell: (r) => (
        <Link to={`/documents/registry/${r.id}`} className="font-mono text-xs text-primary hover:underline">
          {r.document_reference ?? 'Not referenced'}
        </Link>
      ),
    },
    {
      id: 'name', header: 'Document', priority: 1, minWidth: '230px', truncate: true,
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
      id: 'category', header: 'Category / type', priority: 2, minWidth: '170px',
      accessor: (r) => r.category_name ?? '',
      cell: (r) => (
        <div className="min-w-0 text-sm">
          <div className="truncate">{r.category_name || 'Unclassified'}</div>
          {r.type_code && <div className="truncate text-[11px] text-muted-foreground">{r.type_code}</div>}
        </div>
      ),
    },
    {
      id: 'source', header: 'Originating process', priority: 2, minWidth: '170px',
      accessor: (r) => r.source_module ?? '',
      cell: (r) => (
        <div className="min-w-0 text-sm">
          <div className="truncate capitalize">{(r.source_module || 'not recorded').replace(/_/g, ' ')}</div>
          <div className="truncate text-[11px] text-muted-foreground">{presentContextType(r.source_record_type)}</div>
        </div>
      ),
    },
    {
      id: 'classification', header: 'Sensitivity', priority: 2, minWidth: '140px',
      accessor: (r) => r.confidentiality_classification ?? '',
      cell: (r) => <DmsBadge presented={presentConfidentiality(r.confidentiality_classification)} />,
    },
    {
      id: 'status', header: 'Document status', priority: 2, minWidth: '140px',
      accessor: (r) => r.document_status ?? '',
      cell: (r) => <DmsBadge presented={presentDocumentStatus(r.document_status ?? 'available')} />,
    },
    {
      id: 'verification', header: 'Verification', priority: 2, minWidth: '140px',
      accessor: (r) => r.verification_status ?? '',
      cell: (r) => <DmsBadge presented={presentVerification(r.verification_status)} />,
    },
    {
      id: 'acceptance', header: 'Acceptance', priority: 3, minWidth: '140px',
      accessor: (r) => r.acceptance_status ?? '',
      cell: (r) => <DmsBadge presented={presentAcceptance(r.acceptance_status)} />,
    },
    {
      id: 'publication', header: 'Publication', priority: 3, minWidth: '150px', defaultVisible: false,
      accessor: (r) => r.publication_eligibility ?? '',
      cell: (r) => <DmsBadge presented={presentPublication(r.publication_eligibility)} />,
    },
    {
      id: 'document_date', header: 'Document date', priority: 3, minWidth: '130px', defaultVisible: false,
      accessor: (r) => r.document_date ?? '',
      cell: (r) => <span className="text-xs text-muted-foreground">{r.document_date ? formatDate(r.document_date) : '—'}</span>,
    },
    {
      id: 'updated', header: 'Last updated', priority: 2, minWidth: '150px',
      accessor: (r) => r.updated_at ?? '',
      cell: (r) => <span className="text-xs text-muted-foreground">{r.updated_at ? formatDateTime(r.updated_at) : '—'}</span>,
    },
  ], []);

  const types = (taxonomy?.types ?? []).filter((t) => {
    if (category === ALL) return true;
    const cat = (taxonomy?.categories ?? []).find((c) => c.code === category);
    return !cat || t.category_id === cat.id;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {!hideIntro ? (
          <p className="max-w-3xl text-sm text-muted-foreground">
            Every document held for this entity in the central document register, whatever process
            produced it. Visibility follows the register's own access rules.
          </p>
        ) : <span />}
        <Button size="sm" onClick={() => setAddOpen(true)} data-rbac="document_management.upload">
          <Plus className="mr-1 h-4 w-4" /> Add document
        </Button>
      </div>

      <AddDocumentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        context={{ recordType: 'entity', recordId: entityId, sourceModule: 'entity' }}
        contextLabel="this entity"
        onUploaded={() => refetch()}
      />


      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Search</Label>
            <Input
              value={searchInput}
              placeholder="Reference or document name"
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(searchInput.trim()); setGrid((g) => ({ ...g, pageIndex: 0 })); } }}
              onBlur={() => { setSearch(searchInput.trim()); setGrid((g) => ({ ...g, pageIndex: 0 })); }}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={(v) => { setCategory(v); setTypeCode(ALL); setGrid((g) => ({ ...g, pageIndex: 0 })); }}>
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
            <Label className="text-xs">Document type</Label>
            <Select value={typeCode} onValueChange={(v) => { setTypeCode(v); setGrid((g) => ({ ...g, pageIndex: 0 })); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                {types.map((t) => <SelectItem key={t.id} value={t.code}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Originating process</Label>
            <Select value={sourceModule} onValueChange={(v) => { setSourceModule(v); setGrid((g) => ({ ...g, pageIndex: 0 })); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All processes</SelectItem>
                {SOURCE_MODULES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Sensitivity</Label>
            <Select value={confidentiality} onValueChange={(v) => { setConfidentiality(v); setGrid((g) => ({ ...g, pageIndex: 0 })); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All sensitivities</SelectItem>
                {CONFIDENTIALITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Document status</Label>
            <Select value={status} onValueChange={(v) => { setStatus(v); setGrid((g) => ({ ...g, pageIndex: 0 })); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {DOCUMENT_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Verification</Label>
            <Select value={verification} onValueChange={(v) => { setVerification(v); setGrid((g) => ({ ...g, pageIndex: 0 })); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any verification state</SelectItem>
                {VERIFICATION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Acceptance</Label>
            <Select value={acceptance} onValueChange={(v) => { setAcceptance(v); setGrid((g) => ({ ...g, pageIndex: 0 })); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any acceptance state</SelectItem>
                {ACCEPTANCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 pt-5">
            <Switch
              id="entity-docs-archived"
              checked={includeArchived}
              onCheckedChange={(v) => { setIncludeArchived(v); setGrid((g) => ({ ...g, pageIndex: 0 })); }}
            />
            <Label htmlFor="entity-docs-archived" className="text-xs">Include archived</Label>
          </div>
        </CardContent>
      </Card>

      <EnterpriseDataGrid
        gridId={`entity-documents-${entityId}`}
        mode="server"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        totalCount={data?.total ?? 0}
        state={grid}
        onStateChange={setGrid}
        isLoading={isLoading}
        error={error ? (error as Error).message : null}
        onRefresh={() => refetch()}
        enableGlobalSearch={false}
        emptyTitle="No documents held for this entity"
        emptyDescription="Documents appear here once they are registered against this entity in the central document register."
        caption="Documents held for this entity"
      />
    </div>
  );
}
