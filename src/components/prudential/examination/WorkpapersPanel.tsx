import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Stamp, Trash2, UserCheck } from 'lucide-react';
import { useSignoffWorkpaper, useWorkpaperMutations, useWorkpapers } from '@/hooks/useExaminations';
import { StageActions, type StageActionsMode } from './ExaminationStageActions';
import { workpaperStatusLabel } from '@/lib/examinationWorkflow';

export function WorkpapersPanel({ examinationId, readOnly, mode = 'supporting' }: { examinationId: string; readOnly?: boolean; mode?: StageActionsMode }) {
  const { data: rows = [], isLoading } = useWorkpapers(examinationId);
  const { save, remove } = useWorkpaperMutations(examinationId);
  const signoff = useSignoffWorkpaper(examinationId);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ area: '', procedure_performed: '', evidence_reference: '', conclusion: '' });

  const add = async () => {
    await save.mutateAsync({
      area: form.area,
      procedure_performed: form.procedure_performed || null,
      evidence_reference: form.evidence_reference || null,
      conclusion: form.conclusion || null,
      status: 'draft',
    });
    setForm({ area: '', procedure_performed: '', evidence_reference: '', conclusion: '' });
    setShowForm(false);
  };

  const reviewed = rows.filter((r: any) => r.reviewed_at).length;
  const pending = rows.length - reviewed;

  const statusTone = (r: any) =>
    r.reviewed_at
      ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200'
      : r.prepared_at
        ? 'bg-warning/10 text-warning border-warning/20'
        : 'bg-muted text-muted-foreground';

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
              Add the first workpaper to document examination procedures and evidence.
            </p>
            {!readOnly && (
              <Button data-rbac="prudential_supervision.edit" size="sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-1" />Add workpaper
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r: any) => (
              <div key={r.id} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">
                      {r.reference ? `${r.reference} · ` : ''}{r.area}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {r.prepared_at ? `Prepared ${new Date(r.prepared_at).toLocaleDateString()}` : 'Not yet prepared'}
                      {r.reviewed_at ? ` · Reviewed ${new Date(r.reviewed_at).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <Badge variant="outline" className={statusTone(r)}>{workpaperStatusLabel(r)}</Badge>
                </div>
                {r.procedure_performed && <p className="text-xs"><span className="text-muted-foreground">What was done: </span>{r.procedure_performed}</p>}
                {r.evidence_reference && <p className="text-xs"><span className="text-muted-foreground">Evidence: </span>{r.evidence_reference}</p>}
                {r.conclusion && <p className="text-xs"><span className="text-muted-foreground">Conclusion: </span>{r.conclusion}</p>}
                {r.review_notes && <p className="text-xs"><span className="text-muted-foreground">Review notes: </span>{r.review_notes}</p>}
                {!readOnly && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {!r.prepared_at && (
                      <Button data-rbac="prudential_supervision.edit" size="sm" disabled={signoff.isPending}
                        onClick={() => signoff.mutate({ workpaper_id: r.id, role: 'preparer' })}>
                        <Stamp className="h-3.5 w-3.5 mr-1" />Sign off as preparer
                      </Button>
                    )}
                    {r.prepared_at && !r.reviewed_at && (
                      <Button data-rbac="prudential_supervision.workflow_action" size="sm" disabled={signoff.isPending}
                        onClick={() => signoff.mutate({ workpaper_id: r.id, role: 'reviewer' })}>
                        <UserCheck className="h-3.5 w-3.5 mr-1" />Sign off as reviewer
                      </Button>
                    )}
                    <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" className="ml-auto"
                      aria-label="Remove workpaper" onClick={() => remove.mutate(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {!readOnly && !showForm && (
              <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" onClick={() => setShowForm(true)}>
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
                <Input id="wp_area" value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
                  placeholder="Credit file review" />
              </div>
              <div>
                <Label htmlFor="wp_evidence">Evidence reference</Label>
                <Input id="wp_evidence" value={form.evidence_reference}
                  onChange={e => setForm(f => ({ ...f, evidence_reference: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="wp_proc">What was done</Label>
              <Textarea id="wp_proc" rows={2} value={form.procedure_performed}
                onChange={e => setForm(f => ({ ...f, procedure_performed: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="wp_conc">Conclusion</Label>
              <Textarea id="wp_conc" rows={2} value={form.conclusion}
                onChange={e => setForm(f => ({ ...f, conclusion: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <Button data-rbac="prudential_supervision.edit" size="sm" disabled={!form.area || save.isPending} onClick={add}>
                <Plus className="h-4 w-4 mr-1" />Add workpaper
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {!readOnly && <StageActions mode={mode} />}
      </CardContent>
    </Card>
  );
}
