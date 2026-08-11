import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEmployeeApprovers } from '@/hooks/useEmployeeApprovers';
import {
  useMonitoringDirectives, useMonitoringReviews, useSaveMonitoringDirective,
  useRecordMonitoringReview, type MonitoringFrequency, type PostClosureMonitoring,
} from '@/hooks/useInvestigationClosure';
import { Loader2, Radar, Save, CheckCircle2 } from 'lucide-react';
import Swal from 'sweetalert2';

const FREQUENCIES: Array<{ value: MonitoringFrequency; label: string }> = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'semi_annual', label: 'Semi-annual' },
  { value: 'annual', label: 'Annual' },
];

const STATUS_TONE: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'outline', active: 'default', completed: 'secondary', cancelled: 'destructive',
};

function ReviewRegister({ directive, investigationId }: { directive: PostClosureMonitoring; investigationId: string }) {
  const { data, isLoading } = useMonitoringReviews(directive.id);
  const record = useRecordMonitoringReview(investigationId);
  const rows = data ?? [];

  const complete = async (reviewId: string) => {
    const res = await Swal.fire({
      title: 'Record monitoring review',
      input: 'textarea',
      inputLabel: 'Observations (min 10 characters)',
      inputValidator: v => (!v || v.trim().length < 10 ? 'Observations of at least 10 characters are required' : null),
      showCancelButton: true,
      confirmButtonText: 'Record review',
    });
    if (!res.isConfirmed) return;
    await record.mutateAsync({ review_id: reviewId, monitoring_id: directive.id, observations: res.value });
  };

  if (isLoading) return <div className="p-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>;
  if (!rows.length) return <p className="text-xs text-muted-foreground px-4 pb-3">No scheduled reviews yet.</p>;

  return (
    <Table>
      <TableHeader><TableRow>
        <TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead>Observations</TableHead>
        <TableHead className="text-right">Action</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {rows.map(r => (
          <TableRow key={r.id}>
            <TableCell className="font-mono text-xs">{r.due_date}</TableCell>
            <TableCell><Badge variant={r.status === 'completed' ? 'secondary' : 'outline'} className="capitalize">{r.status}</Badge></TableCell>
            <TableCell className="text-xs max-w-[320px] truncate">{r.observations || '—'}</TableCell>
            <TableCell className="text-right">
              {r.status === 'scheduled' && (
                <Button data-rbac="market_conduct.edit" size="sm" variant="outline"
                  onClick={() => complete(r.id)} disabled={record.isPending}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Record
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function PostClosureMonitoringPanel({
  investigationId, closureId,
}: { investigationId: string; closureId?: string | null }) {
  const { data, isLoading } = useMonitoringDirectives(investigationId);
  const save = useSaveMonitoringDirective(investigationId);
  const { data: employees = [] } = useEmployeeApprovers();
  const directives = data ?? [];
  const existing = directives[0];

  const [focusAreas, setFocusAreas] = useState(existing?.focus_areas ?? '');
  const [indicators, setIndicators] = useState(existing?.indicators ?? '');
  const [reporting, setReporting] = useState(existing?.entity_reporting_requirement ?? '');
  const [frequency, setFrequency] = useState<MonitoringFrequency>(existing?.frequency ?? 'quarterly');
  const [startDate, setStartDate] = useState(existing?.start_date ?? '');
  const [endDate, setEndDate] = useState(existing?.end_date ?? '');
  const [ownerId, setOwnerId] = useState(existing?.owner_id ?? 'none');
  const [dirty, setDirty] = useState(false);

  // Hydrate once when the directive arrives.
  if (!dirty && existing && focusAreas === '' && existing.focus_areas) {
    setFocusAreas(existing.focus_areas);
    setIndicators(existing.indicators ?? '');
    setReporting(existing.entity_reporting_requirement ?? '');
    setFrequency(existing.frequency);
    setStartDate(existing.start_date ?? '');
    setEndDate(existing.end_date ?? '');
    setOwnerId(existing.owner_id ?? 'none');
  }

  const onSave = async () => {
    await save.mutateAsync({
      investigation_id: investigationId,
      monitoring_id: existing?.id ?? null,
      closure_id: closureId ?? existing?.closure_id ?? null,
      focus_areas: focusAreas,
      indicators: indicators || null,
      entity_reporting_requirement: reporting || null,
      frequency,
      start_date: startDate || null,
      end_date: endDate || null,
      owner_id: ownerId === 'none' ? null : ownerId,
    });
    setDirty(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Radar className="h-4 w-4" />Post-closure monitoring directive
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            The directive is activated automatically when the closure determination is approved.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Focus areas <span className="text-destructive">*</span> <span className="text-xs text-muted-foreground">(min 10 characters)</span></Label>
            <Textarea rows={3} value={focusAreas}
              onChange={e => { setFocusAreas(e.target.value); setDirty(true); }}
              placeholder="What conduct behaviours, products or channels remain under supervision" />
            {focusAreas.trim().length < 10 && (
              <p className="text-xs text-muted-foreground mt-1">
                Focus areas need at least 10 characters before the directive can be saved (currently {focusAreas.trim().length}).
              </p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Indicators / thresholds to watch</Label>
              <Textarea rows={2} value={indicators}
                onChange={e => { setIndicators(e.target.value); setDirty(true); }} />
            </div>
            <div>
              <Label>Required entity reporting</Label>
              <Textarea rows={2} value={reporting}
                onChange={e => { setReporting(e.target.value); setDirty(true); }} />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={v => { setFrequency(v as MonitoringFrequency); setDirty(true); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setDirty(true); }} />
            </div>
            <div>
              <Label>Review end date</Label>
              <Input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setDirty(true); }} />
            </div>
            <div>
              <Label>Owner</Label>
              <Select value={ownerId} onValueChange={v => { setOwnerId(v); setDirty(true); }}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {employees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name || e.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {existing
                ? <>Status: <Badge variant={STATUS_TONE[existing.status]} className="capitalize ml-1">{existing.status}</Badge>
                    {existing.next_review_date ? ` · next review ${existing.next_review_date}` : ''}</>
                : 'No directive recorded yet.'}
            </div>
            <Button data-rbac="market_conduct.edit" size="sm" onClick={onSave}
              title={focusAreas.trim().length < 10
                ? 'Focus areas need at least 10 characters'
                : 'Save the monitoring directive'}
              disabled={save.isPending || focusAreas.trim().length < 10}>

              <Save className="h-4 w-4 mr-1" />Save directive
            </Button>
          </div>
        </CardContent>
      </Card>

      {existing && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Monitoring review register</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            {isLoading
              ? <div className="p-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
              : <ReviewRegister directive={existing} investigationId={investigationId} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
