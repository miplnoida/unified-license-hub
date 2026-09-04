/**
 * Dimensions & Questions — dimension navigator plus a server-paged question
 * register. Read only: this wave reviews the catalogue, it never edits it.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { RegisterToolbar } from '@/components/shared/RegisterToolbar';
import { SupervisoryRegister } from '@/components/supervision/SupervisoryRegister';
import { useListingState } from '@/components/shared/listing';
import { useServerPageGuard } from '@/components/shared/listing/useServerPageGuard';
import {
  useSupervisoryMethodologyDimensions,
  useSupervisoryMethodologyQuestion,
  useSupervisoryMethodologyQuestions,
  type MethodologyQuestionRow,
} from '@/hooks/useSupervisoryMethodologyAdmin';
import { EmptyPanel, ErrorPanel, Field, YesNo, formatDate, humanize } from '../labels';

const FILTER_KEYS = ['dimension', 'class', 'axis', 'focus', 'participation', 'sector', 'change', 'evidence', 'prefill', 'judgement', 'na'];

function TriSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[10.5rem]" aria-label={label}><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}: any</SelectItem>
        <SelectItem value="yes">{label}: yes</SelectItem>
        <SelectItem value="no">{label}: no</SelectItem>
      </SelectContent>
    </Select>
  );
}

const tri = (v: string) => (v === 'yes' ? true : v === 'no' ? false : null);
const opt = (v: string) => (v === 'all' ? null : v);

function QuestionDrawer({ questionId, onClose }: { questionId: string | null; onClose: () => void }) {
  const { data, isLoading, error } = useSupervisoryMethodologyQuestion(questionId);
  return (
    <Sheet open={!!questionId} onOpenChange={(o) => (o ? null : onClose())}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        {isLoading ? <Skeleton className="h-96 w-full" /> : error ? <ErrorPanel error={error} /> : data ? (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="font-mono text-base">{data.question_code}</SheetTitle>
              <SheetDescription className="text-foreground">{data.prompt}</SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">{humanize(data.question_class)}</Badge>
                <Badge variant="outline">{humanize(data.axis)}</Badge>
                {data.effectiveness_focus ? <Badge variant="outline">{humanize(data.effectiveness_focus)}</Badge> : null}
                <Badge variant="outline">{humanize(data.calculation_participation)}</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <Field label="Dimension">{data.dimension?.dimension_code} — {data.dimension?.label}</Field>
                <Field label="Dimension kind">{humanize(data.dimension?.dimension_kind)}</Field>
                <Field label="Mandatory"><YesNo value={data.mandatory} /></Field>
                <Field label="Question version">{data.question_version ?? '—'}</Field>
              </dl>
              {data.supervisory_intent ? <Field label="Supervisory intent">{data.supervisory_intent}</Field> : null}
              {data.guidance ? <Field label="Guidance">{data.guidance}</Field> : null}
              <div className="rounded-md border p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Response semantics</p>
                <p className="mt-1 text-sm">{data.semantic_profile ? `${data.semantic_profile.semantic_code} — ${data.semantic_profile.label ?? ''}` : 'No profile assigned.'}</p>
                {data.response_options?.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {data.response_options.map((o) => <li key={o}><Badge variant="secondary" className="font-mono text-[11px]">{o}</Badge></li>)}
                  </ul>
                ) : null}
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <Field label="Not applicable permitted"><YesNo value={data.allow_not_applicable} /></Field>
                <Field label="N/A rationale required"><YesNo value={data.na_requires_rationale} /></Field>
                <Field label="N/A conditions">{data.na_conditions ?? '—'}</Field>
                <Field label="Observation required"><YesNo value={data.requires_observation} /></Field>
                <Field label="Evidence required"><YesNo value={data.requires_evidence} /></Field>
                <Field label="Minimum evidence items">{data.min_evidence_count ?? '—'}</Field>
                <Field label="Judgement required"><YesNo value={data.supervisory_judgement_required} /></Field>
                <Field label="Auto-prefill possible"><YesNo value={data.factual_auto_prefill_possible} /></Field>
                <Field label="Sector classification">{humanize(data.sector_classification)}</Field>
                <Field label="Sector applicability">{data.sector_applicability ?? '—'}</Field>
                <Field label="Trigger condition">{data.trigger_condition ?? '—'}</Field>
                <Field label="Applicability rule">{data.applicability_rule ?? '—'}</Field>
                <Field label="Standards reference">{data.standards_reference ?? '—'}</Field>
                <Field label="Reference strength">{humanize(data.standards_reference_strength)}</Field>
                <Field label="Reference review">{data.standards_reference_review ?? '—'}</Field>
                <Field label="Change classification">{humanize(data.change_classification)}</Field>
                <Field label="Predecessor mapping">{data.predecessor_mapping ?? '—'}</Field>
                <Field label="Minimum evidence note">{data.minimum_evidence_note ?? '—'}</Field>
              </dl>
              {data.evidence_basis_types?.length ? (
                <Field label="Accepted evidence basis">
                  <span className="flex flex-wrap gap-1.5">
                    {data.evidence_basis_types.map((t) => <Badge key={t} variant="outline">{humanize(t)}</Badge>)}
                  </span>
                </Field>
              ) : null}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Linked fact requirements</p>
                {data.fact_requirements?.length ? (
                  <ul className="mt-1 space-y-1">
                    {data.fact_requirements.map((f) => (
                      <li key={f.id} className="text-sm">
                        <span className="font-mono">{f.fact_code}</span> — {f.label ?? '—'}{' '}
                        <span className="text-muted-foreground">({humanize(f.definition_status)}{f.is_required ? ', required' : ''})</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-1 text-sm text-muted-foreground">No fact requirement is linked to this question.</p>}
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function QuestionsTab({ methodologyId }: { methodologyId: string }) {
  const listing = useListingState({
    prefix: 'q',
    defaultSort: { key: 'code', direction: 'asc' },
    filterKeys: FILTER_KEYS,
  });
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);
  const dims = useSupervisoryMethodologyDimensions(methodologyId);

  const f = listing.filters;
  const query = useSupervisoryMethodologyQuestions({
    methodologyId,
    search: listing.search,
    dimensionId: opt(f.dimension),
    questionClass: opt(f.class),
    axis: opt(f.axis),
    effectivenessFocus: opt(f.focus),
    participation: opt(f.participation),
    sectorClassification: opt(f.sector),
    changeClassification: opt(f.change),
    evidenceRequired: tri(f.evidence),
    autoPrefill: tri(f.prefill),
    judgementRequired: tri(f.judgement),
    naAllowed: tri(f.na),
    sortKey: listing.sort?.key ?? 'code',
    sortDirection: listing.sort?.direction ?? 'asc',
    page: listing.page,
    pageSize: listing.pageSize,
  });

  const total = query.data?.total_count ?? 0;
  const guard = useServerPageGuard({
    page: listing.page, pageSize: listing.pageSize, totalCount: total,
    setPage: listing.setPage, ready: query.isSuccess,
  });

  const inherent = (dims.data ?? []).filter((d) => d.dimension_kind === 'INHERENT');
  const control = (dims.data ?? []).filter((d) => d.dimension_kind !== 'INHERENT');

  const navButton = (id: string | 'all', label: string, count?: number) => (
    <Button
      key={id}
      variant={f.dimension === id || (id === 'all' && f.dimension === 'all') ? 'secondary' : 'ghost'}
      size="sm"
      className="h-auto w-full justify-between gap-2 px-2 py-1.5 text-left"
      onClick={() => listing.setFilter('dimension', id)}
    >
      <span className="truncate text-xs">{label}</span>
      {count !== undefined ? <span className="font-mono text-[11px] text-muted-foreground">{count}</span> : null}
    </Button>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="space-y-3">
        <div className="rounded-md border p-2">
          {navButton('all', 'All dimensions', dims.data?.reduce((s, d) => s + d.question_count, 0))}
          <p className="mt-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Inherent exposure ({inherent.length})
          </p>
          {dims.isLoading ? <Skeleton className="h-24 w-full" /> : inherent.map((d) => navButton(d.id, `${d.dimension_code} · ${d.label}`, d.question_count))}
          <p className="mt-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Control effectiveness ({control.length})
          </p>
          {control.map((d) => navButton(d.id, `${d.dimension_code} · ${d.label}`, d.question_count))}
        </div>
      </aside>

      <div className="space-y-3">
        <RegisterToolbar
          search={listing.search}
          onSearchChange={listing.setSearch}
          searchPlaceholder="Search question code or prompt"
        >
          <Select value={f.class} onValueChange={(v) => listing.setFilter('class', v)}>
            <SelectTrigger className="h-9 w-[9.5rem]" aria-label="Question class"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              <SelectItem value="CORE">CORE</SelectItem>
              <SelectItem value="CONDITIONAL">CONDITIONAL</SelectItem>
              <SelectItem value="ENHANCED">ENHANCED</SelectItem>
            </SelectContent>
          </Select>
          <Select value={f.axis} onValueChange={(v) => listing.setFilter('axis', v)}>
            <SelectTrigger className="h-9 w-[12rem]" aria-label="Assessment axis"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All axes</SelectItem>
              <SelectItem value="INHERENT_EXPOSURE">Inherent exposure</SelectItem>
              <SelectItem value="CONTROL_EFFECTIVENESS">Control effectiveness</SelectItem>
            </SelectContent>
          </Select>
          <Select value={f.focus} onValueChange={(v) => listing.setFilter('focus', v)}>
            <SelectTrigger className="h-9 w-[12rem]" aria-label="Effectiveness focus"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All focus</SelectItem>
              <SelectItem value="DESIGN">Design</SelectItem>
              <SelectItem value="OPERATING">Operating</SelectItem>
              <SelectItem value="DESIGN_AND_OPERATING">Design and operating</SelectItem>
            </SelectContent>
          </Select>
          <Select value={f.participation} onValueChange={(v) => listing.setFilter('participation', v)}>
            <SelectTrigger className="h-9 w-[12rem]" aria-label="Calculation participation"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All participation</SelectItem>
              <SelectItem value="SCORED">Scored</SelectItem>
              <SelectItem value="CONTEXTUAL_NOT_SCORED">Contextual, not scored</SelectItem>
              <SelectItem value="NOT_APPLICABLE">Not applicable</SelectItem>
            </SelectContent>
          </Select>
          <Select value={f.sector} onValueChange={(v) => listing.setFilter('sector', v)}>
            <SelectTrigger className="h-9 w-[12rem]" aria-label="Sector classification"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sector applicability</SelectItem>
              <SelectItem value="ALL_SECTORS">All sectors</SelectItem>
              <SelectItem value="SECTOR_SPECIFIC">Sector specific</SelectItem>
            </SelectContent>
          </Select>
          <TriSelect label="Evidence" value={f.evidence} onChange={(v) => listing.setFilter('evidence', v)} />
          <TriSelect label="Auto-prefill" value={f.prefill} onChange={(v) => listing.setFilter('prefill', v)} />
          <TriSelect label="Judgement" value={f.judgement} onChange={(v) => listing.setFilter('judgement', v)} />
        </RegisterToolbar>

        {query.error ? <ErrorPanel error={query.error} /> : query.isLoading ? <Skeleton className="h-72 w-full" /> :
          total === 0 && !guard.repairing ? (
            <EmptyPanel title="No question matches these filters." description="Clear a filter or the search to widen the register." />
          ) : (
            <SupervisoryRegister<MethodologyQuestionRow>
              rows={query.data?.rows ?? []}
              getRowId={(r) => r.id}
              identifierHeader="Question"
              identifier={(r) => ({ reference: r.question_code, subject: r.prompt })}
              identifierSortable
              identifierSortKey="code"
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
              onRowClick={(r) => setOpenQuestion(r.id)}
              columns={[
                { id: 'dimension', header: 'Dimension', sortable: true, sortKey: 'dimension', cell: (r) => (
                  <span className="text-xs"><span className="font-mono">{r.dimension_code}</span><br />{r.dimension_label}</span>) },
                { id: 'class', header: 'Class', sortable: true, sortKey: 'class', cell: (r) => <Badge variant="outline">{humanize(r.question_class)}</Badge> },
                { id: 'axis', header: 'Axis', priority: 2, sortable: true, sortKey: 'axis', cell: (r) => <span className="text-xs">{humanize(r.axis)}</span> },
                { id: 'focus', header: 'Focus', priority: 2, sortable: true, sortKey: 'focus', cell: (r) => <span className="text-xs">{humanize(r.effectiveness_focus)}</span> },
                { id: 'semantics', header: 'Semantic profile', priority: 3, cell: (r) => <span className="font-mono text-xs">{r.response_semantics_code ?? '—'}</span> },
                { id: 'evidence', header: 'Evidence', priority: 3, cell: (r) => <YesNo value={r.requires_evidence} /> },
                { id: 'applicability', header: 'Applicability', priority: 3, cell: (r) => <span className="text-xs">{humanize(r.sector_classification)}</span> },
              ]}
              actions={(r) => (
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setOpenQuestion(r.id); }}>View</Button>
              )}
            />
          )}
      </div>
      <QuestionDrawer questionId={openQuestion} onClose={() => setOpenQuestion(null)} />
      {dims.data && dims.data.length === 0 ? null : null}
      {formatDate ? null : null}
    </div>
  );
}
