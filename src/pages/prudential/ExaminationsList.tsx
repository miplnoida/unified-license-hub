import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus, ClipboardCheck } from 'lucide-react';
import { usePrudentialEntities } from '@/hooks/usePrudentialSupervision';
import {
  EXAMINATION_STAGES,
  EXAMINATION_TYPES,
  stageLabel,
  useCreateExamination,
  useExaminations,
} from '@/hooks/useExaminations';
import { EXAMINATION_PHASES, phaseLabel, stagePhase } from '@/lib/examinationWorkflow';


const stageTone = (stage: string) => {
  if (stage === 'closed') return 'bg-emerald-500/10 text-emerald-700 border-emerald-200';
  if (stage === 'cancelled') return 'bg-muted text-muted-foreground';
  if (stage === 'fieldwork' || stage === 'remediation') return 'bg-warning/10 text-warning border-warning/20';
  return 'bg-primary/10 text-primary border-primary/20';
};

export default function ExaminationsList() {
  const [params] = useSearchParams();
  const [stage, setStage] = useState('all');
  const [phase, setPhase] = useState('all');
  const [type, setType] = useState('all');

  const [entity, setEntity] = useState(params.get('entity') || 'all');
  const [search, setSearch] = useState('');

  const { data: rows = [], isLoading } = useExaminations({
    stage: stage === 'all' ? undefined : stage,
    examination_type: type === 'all' ? undefined : type,
    entity_id: entity === 'all' ? undefined : entity,
  });
  const { data: entities = [] } = usePrudentialEntities();
  const create = useCreateExamination();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    entity_id: params.get('entity') || '',
    title: '',
    examination_type: 'full_scope',
    period_under_review_start: '',
    period_under_review_end: '',
    fieldwork_start: '',
    fieldwork_end: '',
  });

  const filtered = rows.filter(r =>
    (phase === 'all' || stagePhase(r.stage) === phase) &&
    (!search ||
      r.reference.toLowerCase().includes(search.toLowerCase()) ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      (r.licensee?.name || '').toLowerCase().includes(search.toLowerCase())),
  );


  const submit = async () => {
    const payload: Record<string, unknown> = {
      entity_id: form.entity_id,
      title: form.title,
      examination_type: form.examination_type,
      stage: 'planned',
      period_under_review_start: form.period_under_review_start || null,
      period_under_review_end: form.period_under_review_end || null,
      fieldwork_start: form.fieldwork_start || null,
      fieldwork_end: form.fieldwork_end || null,
    };
    const created = await create.mutateAsync(payload);
    setOpen(false);
    if (created?.id) window.location.href = `/prudential/examinations/${created.id}`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <ClipboardCheck className="h-6 w-6 text-primary" />Onsite Examinations
            </h1>
            <p className="text-sm text-muted-foreground">
              Scoping through final report and corrective action plan tracking.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-rbac="prudential_supervision.create" size="sm">
                <Plus className="h-4 w-4 mr-2" />New examination
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New onsite examination</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Entity</Label>
                  <Select value={form.entity_id} onValueChange={v => setForm(f => ({ ...f, entity_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Choose entity" /></SelectTrigger>
                    <SelectContent>
                      {entities.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Title</Label>
                  <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. 2026 full-scope examination" />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={form.examination_type} onValueChange={v => setForm(f => ({ ...f, examination_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXAMINATION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Period start</Label><Input type="date" value={form.period_under_review_start}
                    onChange={e => setForm(f => ({ ...f, period_under_review_start: e.target.value }))} /></div>
                  <div><Label>Period end</Label><Input type="date" value={form.period_under_review_end}
                    onChange={e => setForm(f => ({ ...f, period_under_review_end: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Fieldwork start</Label><Input type="date" value={form.fieldwork_start}
                    onChange={e => setForm(f => ({ ...f, fieldwork_start: e.target.value }))} /></div>
                  <div><Label>Fieldwork end</Label><Input type="date" value={form.fieldwork_end}
                    onChange={e => setForm(f => ({ ...f, fieldwork_end: e.target.value }))} /></div>
                </div>
              </div>
              <DialogFooter>
                <Button disabled={!form.entity_id || !form.title || create.isPending} onClick={submit}>
                  {create.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Register</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-5 mb-4">
              <Input placeholder="Search reference, title or entity" value={search} onChange={e => setSearch(e.target.value)} />
              <Select value={phase} onValueChange={setPhase}>
                <SelectTrigger><SelectValue placeholder="Phase" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All phases</SelectItem>
                  {EXAMINATION_PHASES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger><SelectValue placeholder="Detailed step" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All steps</SelectItem>
                  {EXAMINATION_STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>

              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {EXAMINATION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={entity} onValueChange={setEntity}>
                <SelectTrigger><SelectValue placeholder="Entity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All entities</SelectItem>
                  {entities.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No examinations recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Phase</TableHead>
                      <TableHead>Current step</TableHead>

                      <TableHead>Fieldwork</TableHead>
                      <TableHead className="text-right">Findings</TableHead>
                      <TableHead className="text-right">Open CAP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(r => (
                      <TableRow key={r.id} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-xs">
                          <Link className="text-primary hover:underline" to={`/prudential/examinations/${r.id}`}>{r.reference}</Link>
                        </TableCell>
                        <TableCell>{r.licensee?.name || '—'}</TableCell>
                        <TableCell className="max-w-[240px] truncate">{r.title}</TableCell>
                        <TableCell className="capitalize">{r.examination_type.replace('_', ' ')}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={stageTone(r.stage)}>
                            {r.stage === 'cancelled' ? 'Cancelled' : phaseLabel(stagePhase(r.stage))}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{stageLabel(r.stage)}</TableCell>

                        <TableCell className="text-xs">
                          {r.fieldwork_start ? new Date(r.fieldwork_start).toLocaleDateString() : '—'}
                          {r.fieldwork_end ? ` → ${new Date(r.fieldwork_end).toLocaleDateString()}` : ''}
                        </TableCell>
                        <TableCell className="text-right">{r.findings_count ?? 0}</TableCell>
                        <TableCell className="text-right">{r.open_remediation_count ?? 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
