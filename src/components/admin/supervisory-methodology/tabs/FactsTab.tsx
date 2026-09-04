/**
 * Evidence & Facts — the governed evidence basis plus the fact requirement
 * register. Review surface only: no evidence is uploaded and no fact attribute
 * is edited here. A fact whose attributes are not yet defined is reported
 * truthfully rather than shown as complete.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { RegisterToolbar } from '@/components/shared/RegisterToolbar';
import { SupervisoryRegister } from '@/components/supervision/SupervisoryRegister';
import { useListingState } from '@/components/shared/listing';
import { useServerPageGuard } from '@/components/shared/listing/useServerPageGuard';
import {
  useSupervisoryMethodologyFact,
  useSupervisoryMethodologyFacts,
  type MethodologyFactRow,
} from '@/hooks/useSupervisoryMethodologyAdmin';
import { EmptyPanel, ErrorPanel, Field, YesNo, humanize } from '../labels';

function FactDrawer({ factId, onClose }: { factId: string | null; onClose: () => void }) {
  const { data, isLoading, error } = useSupervisoryMethodologyFact(factId);
  return (
    <Sheet open={!!factId} onOpenChange={(o) => (o ? null : onClose())}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {isLoading ? <Skeleton className="h-80 w-full" /> : error ? <ErrorPanel error={error} /> : data ? (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="font-mono text-base">{data.fact_code}</SheetTitle>
              <SheetDescription className="text-foreground">{data.label ?? '—'}</SheetDescription>
            </SheetHeader>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Data type">{humanize(data.data_type)}</Field>
              <Field label="Unit">{data.unit ?? '—'}</Field>
              <Field label="Definition status"><Badge variant="outline">{humanize(data.definition_status)}</Badge></Field>
              <Field label="Required"><YesNo value={data.is_required} /></Field>
              <Field label="Auto-prefill allowed"><YesNo value={data.auto_prefill_allowed} /></Field>
              <Field label="Officer editable"><YesNo value={data.officer_edit_allowed} /></Field>
              <Field label="Numerator basis">{data.numerator_basis ?? '—'}</Field>
              <Field label="Denominator basis">{data.denominator_basis ?? '—'}</Field>
              <Field label="Period expectation">{data.period_expectation ?? '—'}</Field>
              <Field label="Source expectation">{data.source_type_expectation ?? '—'}</Field>
              <Field label="Attribute source">{data.attribute_source ?? '—'}</Field>
              <Field label="Provenance">{data.provenance ?? '—'}</Field>
            </dl>
            <div className="mt-4 rounded-md border p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Materiality parameter</p>
              {data.materiality_parameter ? (
                <p className="mt-1 text-sm">
                  <span className="font-mono">{data.materiality_parameter.parameter_code}</span> — {data.materiality_parameter.label ?? '—'}{' '}
                  <Badge variant="outline" className="ml-1">{humanize(data.materiality_parameter.approval_status)}</Badge>
                  {data.materiality_parameter.value_numeric === null && data.materiality_parameter.value_text === null
                    ? <span className="ml-1 text-muted-foreground">Value not set.</span> : null}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  {data.materiality_parameter_code ? `Referenced parameter ${data.materiality_parameter_code} is not defined on this version.` : 'No materiality parameter is referenced.'}
                </p>
              )}
            </div>
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Linked questions</p>
              {data.questions?.length ? (
                <ul className="mt-1 space-y-1">
                  {data.questions.map((q: any) => (
                    <li key={q.id} className="text-sm"><span className="font-mono">{q.question_code}</span> — {q.prompt}</li>
                  ))}
                </ul>
              ) : <p className="mt-1 text-sm text-muted-foreground">No question links to this fact requirement.</p>}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function FactsTab({ methodologyId }: { methodologyId: string }) {
  const listing = useListingState({
    prefix: 'f',
    defaultSort: { key: 'fact_code', direction: 'asc' },
    filterKeys: ['status', 'required'],
  });
  const [openFact, setOpenFact] = useState<string | null>(null);
  const f = listing.filters;

  const query = useSupervisoryMethodologyFacts({
    methodologyId,
    search: listing.search,
    definitionStatus: f.status === 'all' ? null : f.status,
    required: f.required === 'yes' ? true : f.required === 'no' ? false : null,
    sortKey: listing.sort?.key ?? 'fact_code',
    sortDirection: listing.sort?.direction ?? 'asc',
    page: listing.page,
    pageSize: listing.pageSize,
  });

  const total = query.data?.total_count ?? 0;
  const guard = useServerPageGuard({
    page: listing.page, pageSize: listing.pageSize, totalCount: total,
    setPage: listing.setPage, ready: query.isSuccess,
  });
  const statuses = Object.keys(query.data?.status_summary ?? {});

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Evidence basis</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Evidence expectations are part of the methodology: each question records whether evidence is required, the
            minimum number of items and the accepted evidence basis categories. Those categories are governed content and
            are inspected on a question, in the Dimensions &amp; Questions tab.
          </p>
          <p>No document is uploaded or attached from this administration workspace — evidence is captured during an assessment.</p>
          {statuses.length ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {statuses.map((s) => (
                <Badge key={s} variant="outline">{humanize(s)}: {query.data?.status_summary[s]}</Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <RegisterToolbar search={listing.search} onSearchChange={listing.setSearch} searchPlaceholder="Search fact code or label">
        <Select value={f.status} onValueChange={(v) => listing.setFilter('status', v)}>
          <SelectTrigger className="h-9 w-[13rem]" aria-label="Definition status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All definition statuses</SelectItem>
            {statuses.map((s) => <SelectItem key={s} value={s}>{humanize(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.required} onValueChange={(v) => listing.setFilter('required', v)}>
          <SelectTrigger className="h-9 w-[11rem]" aria-label="Required"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Required: any</SelectItem>
            <SelectItem value="yes">Required only</SelectItem>
            <SelectItem value="no">Optional only</SelectItem>
          </SelectContent>
        </Select>
      </RegisterToolbar>

      {query.error ? <ErrorPanel error={query.error} /> : query.isLoading ? <Skeleton className="h-72 w-full" /> :
        total === 0 && !guard.repairing ? (
          <EmptyPanel title="No fact requirement matches these filters." />
        ) : (
          <SupervisoryRegister<MethodologyFactRow>
            rows={query.data?.rows ?? []}
            getRowId={(r) => r.id}
            identifierHeader="Fact"
            identifier={(r) => ({ reference: r.fact_code, subject: r.label ?? undefined })}
            identifierSortable
            identifierSortKey="fact_code"
            mode="server"
            sort={listing.sort}
            onSortToggle={listing.toggleSort}
            paged
            page={guard.validPage}
            pageSize={listing.pageSize}
            totalCount={total}
            onPageChange={listing.setPage}
            onPageSizeChange={listing.setPageSize}
            showRecordCount
            onRowClick={(r) => setOpenFact(r.id)}
            columns={[
              { id: 'data_type', header: 'Type', sortable: true, sortKey: 'data_type', cell: (r) => <span className="text-xs">{humanize(r.data_type)}</span> },
              { id: 'unit', header: 'Unit', priority: 3, sortable: true, sortKey: 'unit', cell: (r) => <span className="text-xs">{r.unit ?? '—'}</span> },
              { id: 'required', header: 'Required', sortable: true, sortKey: 'required', cell: (r) => <YesNo value={r.is_required} /> },
              { id: 'prefill', header: 'Auto-prefill', priority: 2, cell: (r) => <YesNo value={r.auto_prefill_allowed} /> },
              { id: 'editable', header: 'Officer editable', priority: 3, cell: (r) => <YesNo value={r.officer_edit_allowed} /> },
              { id: 'status', header: 'Definition status', sortable: true, sortKey: 'status', cell: (r) => <Badge variant="outline">{humanize(r.definition_status)}</Badge> },
              { id: 'parameter', header: 'Materiality parameter', priority: 2, sortable: true, sortKey: 'parameter', cell: (r) => <span className="font-mono text-xs">{r.materiality_parameter_code ?? '—'}</span> },
              { id: 'questions', header: 'Question links', align: 'right', sortable: true, sortKey: 'questions', cell: (r) => <span className="font-mono text-xs">{r.question_count}</span> },
            ]}
            actions={(r) => <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setOpenFact(r.id); }}>View</Button>}
          />
        )}
      <FactDrawer factId={openFact} onClose={() => setOpenFact(null)} />
    </div>
  );
}
