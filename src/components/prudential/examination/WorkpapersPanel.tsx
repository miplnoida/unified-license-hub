import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Stamp, Trash2, UserCheck } from 'lucide-react';
import { useSignoffWorkpaper, useWorkpaperMutations, useWorkpapers } from '@/hooks/useExaminations';
import { StageActions } from './ExaminationStageActions';

export function WorkpapersPanel({ examinationId, readOnly }: { examinationId: string; readOnly?: boolean }) {
  const { data: rows = [], isLoading } = useWorkpapers(examinationId);
  const { save, remove } = useWorkpaperMutations(examinationId);
  const signoff = useSignoffWorkpaper(examinationId);
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
  };

  const pending = rows.filter((r: any) => !r.reviewed_at).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Workpapers</CardTitle>
        <Badge variant="outline" className={pending ? 'bg-warning/10 text-warning border-warning/20' : 'bg-emerald-500/10 text-emerald-700 border-emerald-200'}>
          {pending ? `${pending} awaiting reviewer sign-off` : 'All reviewed'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No workpapers recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r: any) => (
              <div key={r.id} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">
                      {r.reference ? `${r.reference} · ` : ''}{r.area}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {r.prepared_at ? `Prepared ${new Date(r.prepared_at).toLocaleDateString()}` : 'Not prepared'} ·{' '}
                      {r.reviewed_at ? `Reviewed ${new Date(r.reviewed_at).toLocaleDateString()}` : 'Not reviewed'}
                    </p>
                  </div>
                  <Badge variant="outline" className="capitalize">{r.status.replace('_', ' ')}</Badge>
                </div>
                {r.procedure_performed && <p className="text-xs"><span className="text-muted-foreground">Procedure: </span>{r.procedure_performed}</p>}
                {r.evidence_reference && <p className="text-xs"><span className="text-muted-foreground">Evidence: </span>{r.evidence_reference}</p>}
                {r.conclusion && <p className="text-xs"><span className="text-muted-foreground">Conclusion: </span>{r.conclusion}</p>}
                {r.review_notes && <p className="text-xs"><span className="text-muted-foreground">Review notes: </span>{r.review_notes}</p>}
                {!readOnly && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {!r.prepared_at && (
                      <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" disabled={signoff.isPending}
                        onClick={() => signoff.mutate({ workpaper_id: r.id, role: 'preparer' })}>
                        <Stamp className="h-3.5 w-3.5 mr-1" />Preparer sign-off
                      </Button>
                    )}
                    {r.prepared_at && !r.reviewed_at && (
                      <Button data-rbac="prudential_supervision.workflow_action" size="sm" variant="outline" disabled={signoff.isPending}
                        onClick={() => signoff.mutate({ workpaper_id: r.id, role: 'reviewer' })}>
                        <UserCheck className="h-3.5 w-3.5 mr-1" />Reviewer sign-off
                      </Button>
                    )}
                    <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" className="ml-auto"
                      onClick={() => remove.mutate(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!readOnly && (
          <div className="rounded-md border p-3 space-y-3 bg-muted/20">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Area</Label>
                <Input value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} placeholder="Credit file review" />
              </div>
              <div>
                <Label>Evidence reference</Label>
                <Input value={form.evidence_reference} onChange={e => setForm(f => ({ ...f, evidence_reference: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Procedure performed</Label>
              <Textarea rows={2} value={form.procedure_performed} onChange={e => setForm(f => ({ ...f, procedure_performed: e.target.value }))} />
            </div>
            <div>
              <Label>Conclusion</Label>
              <Textarea rows={2} value={form.conclusion} onChange={e => setForm(f => ({ ...f, conclusion: e.target.value }))} />
            </div>
            <Button data-rbac="prudential_supervision.edit" size="sm" disabled={!form.area || save.isPending} onClick={add}>
              <Plus className="h-4 w-4 mr-1" />Add workpaper
            </Button>
          </div>
        )}
        {!readOnly && <StageActions />}
      </CardContent>
    </Card>
  );
}
