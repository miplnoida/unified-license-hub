/**
 * Examination workpapers — the record of what was tested, on what population,
 * what was found and what the examiner concluded.
 *
 * Every workpaper is written through the governed examination operations, is
 * tied to a risk area carried in from the examination scope, and is the only
 * authoritative place a supervisory finding can be raised from during
 * fieldwork. Evidence is linked from the central document register rather than
 * described in free text.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2, Plus, Send, Stamp, Trash2, Undo2, UserCheck } from 'lucide-react';
import {
  useExamination,
  useExaminationScopeDimensions,
  useSignoffWorkpaper,
  useWorkpaperMutations,
  useWorkpapers,
} from '@/hooks/useExaminations';
import { StageActions, type StageActionsMode } from './ExaminationStageActions';
import { RaiseFindingDialog } from './RaiseFindingDialog';
import { RecordDocumentLinks } from '@/components/supervision/RecordDocumentLinks';

const CONTROL_ASSESSMENTS = [
  { value: 'EFFECTIVE', label: 'Effective' },
  { value: 'PARTIALLY_EFFECTIVE', label: 'Partially effective' },
  { value: 'INEFFECTIVE', label: 'Ineffective' },
  { value: 'NOT_TESTED', label: 'Not tested' },
];

const EMPTY_FORM = {
  area: '', assessment_dimension_id: 'none', objective: '', procedure_performed: '',
  population_description: '', population_size: '', sampling_method: '', sample_size: '',
  exceptions_count: '', material_exceptions_count: '', analysis: '', conclusion: '',
  control_assessment: 'none',
};

const statusLabel = (r: any) =>
  r.status === 'reviewed' || r.reviewed_at ? 'Reviewed'
    : r.status === 'returned' ? 'Returned for revision'
      : r.status === 'in_review' ? 'Awaiting review'
        : r.prepared_at ? 'Prepared'
          : 'Draft';

const statusTone = (r: any) =>
  r.status === 'reviewed' || r.reviewed_at ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200'
    : r.status === 'returned' ? 'bg-destructive/10 text-destructive border-destructive/20'
      : r.status === 'in_review' ? 'bg-warning/10 text-warning border-warning/20'
        : 'bg-muted text-muted-foreground';

export function WorkpapersPanel({
  examinationId, readOnly, mode = 'supporting',
}: { examinationId: string; readOnly?: boolean; mode?: StageActionsMode }) {
  const { data: rows = [], isLoading } = useWorkpapers(examinationId);
  const { data: exam } = useExamination(examinationId);
  const { data: scopeDimensions = [] } = useExaminationScopeDimensions(examinationId);
  const { save, submitReview, returnForRevision, remove } = useWorkpaperMutations(examinationId);
  const signoff = useSignoffWorkpaper(examinationId);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [returnFor, setReturnFor] = useState<string | null>(null);
  const [returnNotes, setReturnNotes] = useState('');
  const [findingFor, setFindingFor] = useState<any | null>(null);

  const set = (k: keyof typeof EMPTY_FORM) => (e: any) =>
    setForm(f => ({ ...f, [k]: typeof e === 'string' ? e : e.target.value }));

  const openEdit = (r: any) => {
    setEditing(r.id);
    setForm({
      area: r.area ?? '',
      assessment_dimension_id: r.assessment_dimension_id ?? 'none',
      objective: r.objective ?? '',
      procedure_performed: r.procedure_performed ?? '',
      population_description: r.population_description ?? '',
      population_size: r.population_size?.toString() ?? '',
      sampling_method: r.sampling_method ?? '',
      sample_size: r.sample_size?.toString() ?? '',
      exceptions_count: r.exceptions_count?.toString() ?? '',
      material_exceptions_count: r.material_exceptions_count?.toString() ?? '',
      analysis: r.analysis ?? '',
      conclusion: r.conclusion ?? '',
      control_assessment: r.control_assessment ?? 'none',
    });
    setShowForm(true);
  };

  const submitForm = async () => {
    await save.mutateAsync({
      ...(editing ? { id: editing } : {}),
      area: form.area,
      assessment_dimension_id: form.assessment_dimension_id === 'none' ? null : form.assessment_dimension_id,
      objective: form.objective || null,
      procedure_performed: form.procedure_performed || null,
      population_description: form.population_description || null,
      population_size: form.population_size || null,
      sampling_method: form.sampling_method || null,
      sample_size: form.sample_size || null,
      exceptions_count: form.exceptions_count || null,
      material_exceptions_count: form.material_exceptions_count || null,
      analysis: form.analysis || null,
      conclusion: form.conclusion || null,
      control_assessment: form.control_assessment === 'none' ? null : form.control_assessment,
    });
    setForm({ ...EMPTY_FORM });
    setEditing(null);
    setShowForm(false);
  };

  const reviewed = rows.filter((r: any) => r.reviewed_at).length;
  const pending = rows.length - reviewed;
  const dimensionLabel = (id?: string | null) => {
    const d = scopeDimensions.find(s => s.assessment_dimension_id === id);
    return d ? d.dimension_code.replace(/_/g, ' ') : null;
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Workpapers</CardTitle>
          {rows.length > 0 && (
            <Badge variant="outline" className={pending ? 'bg-warning/10 text-warning border-warning/20' : 'bg-emerald-500/10 text-emerald-700 border-emerald-200'}>
              {reviewed} of {rows.length} workpapers reviewed
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {pending > 0
            ? `${pending} workpaper${pending === 1 ? '' : 's'} require reviewer sign-off before the report can be finalised.`
            : 'A record of the procedures performed, the evidence obtained and the conclusions reached.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border p-6 text-center space-y-2">
            <p className="text-sm font-medium">No workpapers have been added yet</p>
            <p className="text-xs text-muted-foreground">
              Add the first workpaper to document what was tested, what was found and what you concluded.
            </p>
            {!readOnly && (
              <Button data-rbac="prudential_supervision.edit" size="sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-1" />Add workpaper
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r: any) => {
              const locked = readOnly || r.status === 'reviewed' || !!r.reviewed_at;
              return (
                <div key={r.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">
                        {r.reference ? `${r.reference} · ` : ''}{r.area}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {dimensionLabel(r.assessment_dimension_id)
                          ? `Risk area: ${dimensionLabel(r.assessment_dimension_id)} · `
                          : ''}
                        {r.prepared_at ? `Prepared ${new Date(r.prepared_at).toLocaleDateString()}` : 'Not yet prepared'}
                        {r.reviewed_at ? ` · Reviewed ${new Date(r.reviewed_at).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <Badge variant="outline" className={statusTone(r)}>{statusLabel(r)}</Badge>
                  </div>

                  {r.objective && <p className="text-xs"><span className="text-muted-foreground">Objective: </span>{r.objective}</p>}
                  {r.procedure_performed && <p className="text-xs"><span className="text-muted-foreground">What was done: </span>{r.procedure_performed}</p>}
                  {(r.population_description || r.population_size || r.sampling_method || r.sample_size) && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">Testing: </span>
                      {[
                        r.population_description,
                        r.population_size ? `population ${r.population_size}` : null,
                        r.sampling_method ? `${r.sampling_method} sampling` : null,
                        r.sample_size ? `sample ${r.sample_size}` : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {(r.exceptions_count != null || r.material_exceptions_count != null) && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">Exceptions: </span>
                      {r.exceptions_count ?? 0}
                      {r.material_exceptions_count ? ` (${r.material_exceptions_count} material)` : ''}
                    </p>
                  )}
                  {r.analysis && <p className="text-xs"><span className="text-muted-foreground">Analysis: </span>{r.analysis}</p>}
                  {r.control_assessment && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">Control assessment: </span>
                      {CONTROL_ASSESSMENTS.find(c => c.value === r.control_assessment)?.label ?? r.control_assessment}
                    </p>
                  )}
                  {r.conclusion && <p className="text-xs"><span className="text-muted-foreground">Conclusion: </span>{r.conclusion}</p>}
                  {r.review_notes && <p className="text-xs"><span className="text-muted-foreground">Review notes: </span>{r.review_notes}</p>}

                  <RecordDocumentLinks
                    targetType="examination_workpaper"
                    targetId={r.id}
                    targetReference={r.reference}
                    entityId={(exam as any)?.entity_id}
                    disabled={locked}
                  />

                  {!readOnly && (
                    <>
                      {returnFor === r.id && (
                        <div>
                          <Label className="text-xs" htmlFor={`ret-${r.id}`}>What must be revised?</Label>
                          <Textarea id={`ret-${r.id}`} rows={2} value={returnNotes}
                            onChange={e => setReturnNotes(e.target.value)} />
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {!locked && (
                          <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline"
                            onClick={() => openEdit(r)}>Edit</Button>
                        )}
                        {!locked && r.status !== 'in_review' && (
                          <Button data-rbac="prudential_supervision.edit" size="sm" disabled={submitReview.isPending}
                            onClick={() => submitReview.mutate({ id: r.id })}>
                            <Send className="h-3.5 w-3.5 mr-1" />Submit for review
                          </Button>
                        )}
                        {!r.prepared_at && (
                          <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline"
                            disabled={signoff.isPending}
                            onClick={() => signoff.mutate({ workpaper_id: r.id, role: 'preparer' })}>
                            <Stamp className="h-3.5 w-3.5 mr-1" />Sign off as preparer
                          </Button>
                        )}
                        {r.prepared_at && !r.reviewed_at && (
                          <>
                            <Button data-rbac="prudential_supervision.workflow_action" size="sm" disabled={signoff.isPending}
                              onClick={() => signoff.mutate({ workpaper_id: r.id, role: 'reviewer' })}>
                              <UserCheck className="h-3.5 w-3.5 mr-1" />Sign off as reviewer
                            </Button>
                            {r.status === 'in_review' && (
                              returnFor === r.id ? (
                                <Button data-rbac="prudential_supervision.workflow_action" size="sm" variant="outline"
                                  disabled={!returnNotes.trim() || returnForRevision.isPending}
                                  onClick={async () => {
                                    await returnForRevision.mutateAsync({ id: r.id, notes: returnNotes });
                                    setReturnFor(null); setReturnNotes('');
                                  }}>
                                  <Undo2 className="h-3.5 w-3.5 mr-1" />Confirm return
                                </Button>
                              ) : (
                                <Button data-rbac="prudential_supervision.workflow_action" size="sm" variant="outline"
                                  onClick={() => { setReturnFor(r.id); setReturnNotes(''); }}>
                                  <Undo2 className="h-3.5 w-3.5 mr-1" />Return for revision
                                </Button>
                              )
                            )}
                          </>
                        )}
                        <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline"
                          onClick={() => setFindingFor(r)}>
                          <AlertTriangle className="h-3.5 w-3.5 mr-1" />Raise finding
                        </Button>
                        {!locked && (
                          <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" className="ml-auto"
                            aria-label="Remove workpaper" onClick={() => remove.mutate(r.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {!readOnly && !showForm && (
              <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline"
                onClick={() => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowForm(true); }}>
                <Plus className="h-4 w-4 mr-1" />Add workpaper
              </Button>
            )}
          </div>
        )}

        {!readOnly && showForm && (
          <div className="rounded-md border p-3 space-y-3 bg-muted/20">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="wp_area">Area examined</Label>
                <Input id="wp_area" value={form.area} onChange={set('area')}
                  placeholder="Customer due diligence file review" />
              </div>
              <div>
                <Label htmlFor="wp_dim">Risk area from examination scope</Label>
                <Select value={form.assessment_dimension_id}
                  onValueChange={v => setForm(f => ({ ...f, assessment_dimension_id: v }))}>
                  <SelectTrigger id="wp_dim">
                    <SelectValue placeholder="Not linked to a scoped risk area" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked to a scoped risk area</SelectItem>
                    {scopeDimensions.map(d => (
                      <SelectItem key={d.assessment_dimension_id} value={d.assessment_dimension_id}>
                        {d.dimension_code.replace(/_/g, ' ')}
                        {d.residual_rating ? ` — residual ${d.residual_rating}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="wp_obj">Objective of the test</Label>
                <Input id="wp_obj" value={form.objective} onChange={set('objective')}
                  placeholder="Confirm that risk-rated customer files hold complete verification records" />
              </div>
              <div>
                <Label htmlFor="wp_pop">Population tested</Label>
                <Input id="wp_pop" value={form.population_description} onChange={set('population_description')}
                  placeholder="High-risk customer relationships onboarded in 2025" />
              </div>
              <div>
                <Label htmlFor="wp_popn">Population size</Label>
                <Input id="wp_popn" type="number" min="0" value={form.population_size} onChange={set('population_size')} />
              </div>
              <div>
                <Label htmlFor="wp_method">Sampling method</Label>
                <Input id="wp_method" value={form.sampling_method} onChange={set('sampling_method')}
                  placeholder="Risk-based judgemental" />
              </div>
              <div>
                <Label htmlFor="wp_samp">Sample size</Label>
                <Input id="wp_samp" type="number" min="0" value={form.sample_size} onChange={set('sample_size')} />
              </div>
              <div>
                <Label htmlFor="wp_exc">Exceptions found</Label>
                <Input id="wp_exc" type="number" min="0" value={form.exceptions_count} onChange={set('exceptions_count')} />
              </div>
              <div>
                <Label htmlFor="wp_mexc">Of which material</Label>
                <Input id="wp_mexc" type="number" min="0" value={form.material_exceptions_count}
                  onChange={set('material_exceptions_count')} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="wp_ctrl">Control assessment</Label>
                <Select value={form.control_assessment}
                  onValueChange={v => setForm(f => ({ ...f, control_assessment: v }))}>
                  <SelectTrigger id="wp_ctrl"><SelectValue placeholder="Not recorded" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not recorded</SelectItem>
                    {CONTROL_ASSESSMENTS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="wp_proc">What was done</Label>
              <Textarea id="wp_proc" rows={2} value={form.procedure_performed} onChange={set('procedure_performed')} />
            </div>
            <div>
              <Label htmlFor="wp_analysis">Analysis of what was found</Label>
              <Textarea id="wp_analysis" rows={2} value={form.analysis} onChange={set('analysis')} />
            </div>
            <div>
              <Label htmlFor="wp_conc">Conclusion</Label>
              <Textarea id="wp_conc" rows={2} value={form.conclusion} onChange={set('conclusion')} />
            </div>
            <div className="flex gap-2">
              <Button data-rbac="prudential_supervision.edit" size="sm"
                disabled={!form.area || save.isPending} onClick={submitForm}>
                {editing ? 'Save workpaper' : <><Plus className="h-4 w-4 mr-1" />Add workpaper</>}
              </Button>
              <Button size="sm" variant="ghost"
                onClick={() => { setShowForm(false); setEditing(null); setForm({ ...EMPTY_FORM }); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {findingFor && exam && (
          <RaiseFindingDialog
            open={!!findingFor}
            onOpenChange={o => { if (!o) setFindingFor(null); }}
            examinationId={examinationId}
            examinationReference={(exam as any).reference}
            entityId={(exam as any).entity_id}
            entityName={(exam as any).licensee?.name}
            domainCode={String((exam as any).domain_code || 'PRUDENTIAL')}
            workpaper={findingFor}
            scopeDimensions={scopeDimensions}
          />
        )}

        {!readOnly && <StageActions mode={mode} />}
      </CardContent>
    </Card>
  );
}
