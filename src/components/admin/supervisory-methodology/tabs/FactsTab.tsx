/**
 * Evidence & Facts — the governed evidence basis, the fact requirement register,
 * governed fact-definition authoring and question/fact mapping.
 *
 * No evidence is uploaded here and no entity value is captured: this is the
 * definition layer. A fact whose attributes are not yet defined is reported
 * truthfully rather than shown as complete. Every write goes through a governed
 * `supervisory_methodology_*` operation, and removal is refused by the server
 * while a question link remains.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { RegisterToolbar } from '@/components/shared/RegisterToolbar';
import { SupervisoryRegister } from '@/components/supervision/SupervisoryRegister';
import { useListingState } from '@/components/shared/listing';
import { useServerPageGuard } from '@/components/shared/listing/useServerPageGuard';
import {
  useDeleteMethodologyFactRequirement,
  useLinkQuestionFact,
  useSupervisoryMethodologyFact,
  useSupervisoryMethodologyFacts,
  useSupervisoryMethodologyQuestions,
  useSupervisoryMethodologyStudioCapabilities,
  useUnlinkQuestionFact,
  type MethodologyFactRow,
} from '@/hooks/useSupervisoryMethodologyAdmin';
import { EmptyPanel, ErrorPanel, Field, YesNo, humanize } from '../labels';
import { FactEditorDialog } from '../studio/FactEditorDialog';
import { AuthoringHeader } from '../studio/StudioKit';

function QuestionMapping({
  methodologyId, factCode, linked,
}: { methodologyId: string; factCode: string; linked: Array<{ id: string; question_code: string; prompt: string }> }) {
  const [choice, setChoice] = useState('');
  const questions = useSupervisoryMethodologyQuestions({ methodologyId, page: 1, pageSize: 200 });
  const link = useLinkQuestionFact();
  const unlink = useUnlinkQuestionFact();
  const linkedCodes = linked.map((q) => q.question_code);
  const options = (questions.data?.rows ?? []).filter((q) => !linkedCodes.includes(q.question_code));

  const doLink = async () => {
    if (!choice) return;
    try {
      await link.mutateAsync({ methodologyId, questionCode: choice, factCode });
      toast.success(`${choice} now requires ${factCode}`);
      setChoice('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The link could not be created');
    }
  };

  const doUnlink = async (questionCode: string) => {
    try {
      await unlink.mutateAsync({ methodologyId, questionCode, factCode });
      toast.success(`${factCode} removed from ${questionCode}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The link could not be removed');
    }
  };

  return (
    <div className="mt-4 space-y-2 rounded-md border p-3">
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Link this fact to a question
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={choice} onValueChange={setChoice}>
          <SelectTrigger className="h-9 w-full sm:w-[18rem]" aria-label="Question to link"><SelectValue placeholder="Select a question" /></SelectTrigger>
          <SelectContent>
            {options.map((q) => (
              <SelectItem key={q.id} value={q.question_code}>{q.question_code} — {q.prompt.slice(0, 60)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={doLink} disabled={!choice || link.isPending} data-rbac="aml_supervision.manage_config">
          {link.isPending ? 'Linking…' : 'Link question'}
        </Button>
      </div>
      {linked.length ? (
        <ul className="space-y-1 pt-1">
          {linked.map((q) => (
            <li key={q.id} className="flex items-center justify-between gap-2 text-sm">
              <span><span className="font-mono">{q.question_code}</span> — {q.prompt}</span>
              <Button size="sm" variant="ghost" className="text-destructive"
                      onClick={() => doUnlink(q.question_code)} disabled={unlink.isPending}
                      data-rbac="aml_supervision.manage_config">Unlink</Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RemoveFactDialog({
  methodologyId, factCode, open, onClose,
}: { methodologyId: string; factCode: string | null; open: boolean; onClose: (removed: boolean) => void }) {
  const [rationale, setRationale] = useState('');
  const remove = useDeleteMethodologyFactRequirement();

  const submit = async () => {
    if (!factCode) return;
    try {
      await remove.mutateAsync({ methodologyId, factCode, rationale: rationale.trim() });
      toast.success(`${factCode} removed from this draft version`);
      setRationale('');
      onClose(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The fact definition could not be removed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose(false))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Remove {factCode}</DialogTitle>
          <DialogDescription>
            Removal is refused while any question still links to this fact. Unlink those questions first.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="fact-remove-rationale">Reason (at least 10 characters)</Label>
          <Input id="fact-remove-rationale" value={rationale} onChange={(e) => setRationale(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)} disabled={remove.isPending}>Cancel</Button>
          <Button variant="destructive" onClick={submit} data-rbac="aml_supervision.manage_config"
                  disabled={remove.isPending || rationale.trim().length < 10}>
            {remove.isPending ? 'Removing…' : 'Remove fact definition'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FactDrawer({
  methodologyId, factId, onClose, canAuthor, onEdit, onRemove,
}: {
  methodologyId: string;
  factId: string | null;
  onClose: () => void;
  canAuthor: boolean;
  onEdit: (detail: Record<string, any>) => void;
  onRemove: (factCode: string) => void;
}) {
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
            {canAuthor ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onEdit(data)} data-rbac="aml_supervision.manage_config">
                  Edit fact definition
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive"
                        onClick={() => onRemove(data.fact_code)} data-rbac="aml_supervision.manage_config">
                  Remove
                </Button>
              </div>
            ) : null}
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
            {data.description ? <Field label="Description">{data.description}</Field> : null}
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
            {canAuthor ? (
              <QuestionMapping methodologyId={methodologyId} factCode={data.fact_code} linked={data.questions ?? []} />
            ) : null}
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
  const [editing, setEditing] = useState<{ open: boolean; fact: Record<string, any> | null }>({ open: false, fact: null });
  const [removing, setRemoving] = useState<string | null>(null);
  const caps = useSupervisoryMethodologyStudioCapabilities(methodologyId);
  const canAuthor = caps.data?.can_author_facts?.allowed === true;
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
      <AuthoringHeader
        capability={caps.data?.can_author_facts}
        label="Add fact definition"
        onAdd={() => setEditing({ open: true, fact: null })}
        note="Fact definitions and question mappings may be authored on this draft version."
      />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Evidence basis</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Evidence expectations are part of the methodology: each question records whether evidence is required, the
            minimum number of items and the accepted evidence basis categories. Those categories are governed content and
            are set on a question, in the Dimensions &amp; Questions tab.
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

      <FactDrawer
        methodologyId={methodologyId}
        factId={openFact}
        onClose={() => setOpenFact(null)}
        canAuthor={canAuthor}
        onEdit={(fact) => setEditing({ open: true, fact })}
        onRemove={(code) => setRemoving(code)}
      />
      <FactEditorDialog
        methodologyId={methodologyId}
        open={editing.open}
        existing={editing.fact}
        onClose={() => setEditing({ open: false, fact: null })}
      />
      <RemoveFactDialog
        methodologyId={methodologyId}
        factCode={removing}
        open={!!removing}
        onClose={(removed) => { setRemoving(null); if (removed) setOpenFact(null); }}
      />
    </div>
  );
}
