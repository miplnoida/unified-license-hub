/**
 * Raises a canonical supervisory finding from an examination workpaper.
 *
 * The officer records supervisory judgement only. The origin of the finding is
 * never typed: it is carried from the workpaper being worked in (examination,
 * workpaper, risk dimension and its assessment) and is shown read-only so the
 * officer can see exactly what the finding will be traceable to. The server
 * re-validates every link before the finding is created.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Link2 } from 'lucide-react';
import { useRaiseExaminationFinding, type ExaminationScopeDimension } from '@/hooks/useExaminations';

const SEVERITIES = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examinationId: string;
  examinationReference?: string | null;
  entityId: string;
  entityName?: string | null;
  domainCode: string;
  workpaper: any;
  scopeDimensions: ExaminationScopeDimension[];
}

const EMPTY = {
  title: '', observation: '', finding_category: '', severity: 'MEDIUM',
  root_cause: '', risk_impact: '', regulatory_criterion: '', required_action: '',
  recommendation: '', due_date: '',
};

export function RaiseFindingDialog({
  open, onOpenChange, examinationId, examinationReference, entityId, entityName,
  domainCode, workpaper, scopeDimensions,
}: Props) {
  const navigate = useNavigate();
  const raise = useRaiseExaminationFinding(examinationId);
  const [form, setForm] = useState({ ...EMPTY });

  const dimension = scopeDimensions.find(d => d.assessment_dimension_id === workpaper?.assessment_dimension_id);

  const set = (k: keyof typeof EMPTY) => (e: any) =>
    setForm(f => ({ ...f, [k]: typeof e === 'string' ? e : e.target.value }));

  const submit = async () => {
    const id = await raise.mutateAsync({
      entity_id: entityId,
      domain_code: domainCode,
      title: form.title,
      observation: form.observation,
      finding_category: form.finding_category,
      severity: form.severity,
      root_cause: form.root_cause || null,
      risk_impact: form.risk_impact || null,
      regulatory_criterion: form.regulatory_criterion || null,
      required_action: form.required_action || null,
      recommendation: form.recommendation || null,
      due_date: form.due_date || null,
      workpaper_id: workpaper?.id ?? null,
      assessment_dimension_id: workpaper?.assessment_dimension_id ?? null,
    });
    setForm({ ...EMPTY });
    onOpenChange(false);
    if (id) navigate(`/supervision/findings/${id}`);
  };

  const valid = form.title.trim() && form.observation.trim() && form.finding_category.trim()
    && form.required_action.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Raise a supervisory finding</DialogTitle>
          <DialogDescription>
            The finding is raised against the entity and stays permanently traceable to the workpaper below.
          </DialogDescription>
        </DialogHeader>

        {/* Origin summary — read-only provenance, never editable */}
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" />Where this finding comes from
          </p>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            <div className="flex gap-1.5"><dt className="text-muted-foreground">Entity:</dt>
              <dd className="font-medium">{entityName || 'Entity'}</dd></div>
            <div className="flex gap-1.5"><dt className="text-muted-foreground">Examination:</dt>
              <dd className="font-medium">{examinationReference || examinationId.slice(0, 8)}</dd></div>
            <div className="flex gap-1.5"><dt className="text-muted-foreground">Workpaper:</dt>
              <dd className="font-medium">
                {[workpaper?.reference, workpaper?.area].filter(Boolean).join(' · ') || '—'}
              </dd></div>
            <div className="flex gap-1.5"><dt className="text-muted-foreground">Risk area tested:</dt>
              <dd className="font-medium">
                {dimension
                  ? `${dimension.dimension_code.replace(/_/g, ' ')}${dimension.residual_rating ? ` (residual ${dimension.residual_rating})` : ''}`
                  : 'Not linked to a scoped risk area'}
              </dd></div>
            <div className="flex gap-1.5"><dt className="text-muted-foreground">Exceptions recorded:</dt>
              <dd className="font-medium">
                {workpaper?.exceptions_count ?? 0}
                {workpaper?.material_exceptions_count ? ` (${workpaper.material_exceptions_count} material)` : ''}
                {workpaper?.sample_size ? ` of ${workpaper.sample_size} sampled` : ''}
              </dd></div>
            <div className="flex gap-1.5"><dt className="text-muted-foreground">Supervisory area:</dt>
              <dd className="font-medium">{domainCode.replace(/_/g, '/')}</dd></div>
          </dl>
          {!workpaper?.assessment_dimension_id && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This workpaper is not linked to a scoped risk area, so the finding will not update a risk dimension.
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="fnd_title">Finding</Label>
            <Input id="fnd_title" value={form.title} onChange={set('title')}
              placeholder="Customer due diligence not completed for high-risk relationships" />
          </div>
          <div>
            <Label htmlFor="fnd_cat">Finding category</Label>
            <Input id="fnd_cat" value={form.finding_category} onChange={set('finding_category')}
              placeholder="CUSTOMER_DUE_DILIGENCE" />
          </div>
          <div>
            <Label htmlFor="fnd_sev">Severity</Label>
            <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
              <SelectTrigger id="fnd_sev"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEVERITIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="fnd_obs">What was observed</Label>
            <Textarea id="fnd_obs" rows={3} value={form.observation} onChange={set('observation')}
              placeholder="Describe the evidenced deficiency and the exceptions identified." />
          </div>
          <div>
            <Label htmlFor="fnd_crit">Requirement breached</Label>
            <Input id="fnd_crit" value={form.regulatory_criterion} onChange={set('regulatory_criterion')}
              placeholder="Section 17, Money Laundering (Prevention) Act" />
          </div>
          <div>
            <Label htmlFor="fnd_due">Remediation due date</Label>
            <Input id="fnd_due" type="date" value={form.due_date} onChange={set('due_date')} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="fnd_action">Required action</Label>
            <Textarea id="fnd_action" rows={2} value={form.required_action} onChange={set('required_action')}
              placeholder="What the entity must do to correct the deficiency." />
          </div>
          <div>
            <Label htmlFor="fnd_root">Root cause</Label>
            <Textarea id="fnd_root" rows={2} value={form.root_cause} onChange={set('root_cause')} />
          </div>
          <div>
            <Label htmlFor="fnd_impact">Risk impact</Label>
            <Textarea id="fnd_impact" rows={2} value={form.risk_impact} onChange={set('risk_impact')} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="fnd_rec">Recommendation (optional)</Label>
            <Textarea id="fnd_rec" rows={2} value={form.recommendation} onChange={set('recommendation')} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || raise.isPending}>
            {raise.isPending ? 'Raising…' : 'Raise finding'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
