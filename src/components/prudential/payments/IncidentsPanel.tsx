import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Clock, Loader2, Plus } from 'lucide-react';
import {
  INCIDENT_TYPES,
  labelOf,
  usePaymentIncidents,
  usePaymentOperators,
  usePaymentOversightConfig,
  useRecordIncident,
  useResolveIncident,
  useUpdatePaymentOversightConfig,
} from '@/hooks/usePaymentSystems';

const SEVERITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const severityTone = (s: string) =>
  s === 'critical' || s === 'high'
    ? 'bg-destructive/10 text-destructive border-destructive/20'
    : s === 'medium'
      ? 'bg-warning/10 text-warning border-warning/20'
      : 'bg-muted text-muted-foreground';

interface Props { operatorId?: string }

export function IncidentsPanel({ operatorId }: Props) {
  const [status, setStatus] = useState('all');
  const { data: incidents = [], isLoading } = usePaymentIncidents({
    operator_id: operatorId,
    resolution_status: status === 'all' ? undefined : status,
  });
  const { data: operators = [] } = usePaymentOperators();
  const { data: config } = usePaymentOversightConfig();
  const saveConfig = useUpdatePaymentOversightConfig();
  const record = useRecordIncident();
  const resolve = useResolveIncident();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    operator_id: operatorId ?? '',
    incident_type: 'system_outage',
    severity: 'medium',
    title: '',
    description: '',
    occurred_at: '',
    notification_received_at: '',
    affected_transactions: '',
    affected_value: '',
  });

  const [resolveTarget, setResolveTarget] = useState<string | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [windowHours, setWindowHours] = useState<string>('');

  const names = useMemo(
    () => new Map(operators.map(o => [o.id, o.operator_name])),
    [operators],
  );

  const submit = async () => {
    await record.mutateAsync({
      operator_id: form.operator_id,
      incident_type: form.incident_type,
      title: form.title,
      severity: form.severity,
      description: form.description || null,
      occurred_at: new Date(form.occurred_at).toISOString(),
      notification_received_at: form.notification_received_at
        ? new Date(form.notification_received_at).toISOString()
        : null,
      affected_transactions: form.affected_transactions === '' ? null : Number(form.affected_transactions),
      affected_value: form.affected_value === '' ? null : Number(form.affected_value),
    });
    setOpen(false);
    setForm((f: any) => ({ ...f, title: '', description: '', occurred_at: '', notification_received_at: '' }));
  };

  const late = incidents.filter(i => i.sla_breached).length;
  const openCount = incidents.filter(i => i.resolution_status !== 'resolved').length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Open incidents</p>
            <p className="text-2xl font-semibold">{openCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Late notifications</p>
            <p className="text-2xl font-semibold text-destructive">{late}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />Notification window (hours)
            </p>
            <div className="flex items-center gap-2">
              <Input className="h-8 w-20" type="number" min={0.5} step={0.5}
                value={windowHours !== '' ? windowHours : String(config?.incident_notification_hours ?? 2)}
                onChange={e => setWindowHours(e.target.value)} />
              <Button size="sm" variant="outline" data-rbac="prudential_supervision.edit"
                disabled={saveConfig.isPending || windowHours === ''}
                onClick={() => saveConfig.mutate({ incident_notification_hours: Number(windowHours) })}>
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="investigating">Investigating</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button size="sm" data-rbac="prudential_supervision.create" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />Record incident
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Incident register</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Occurred</TableHead>
                <TableHead>Notified</TableHead>
                <TableHead className="text-right">Affected txns</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={9} className="py-10 text-center">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell></TableRow>
              )}
              {!isLoading && !incidents.length && (
                <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                  No incidents recorded.
                </TableCell></TableRow>
              )}
              {incidents.map(i => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.reference}</TableCell>
                  <TableCell>{names.get(i.operator_id) ?? '—'}</TableCell>
                  <TableCell>{labelOf(INCIDENT_TYPES, i.incident_type)}</TableCell>
                  <TableCell><Badge variant="outline" className={severityTone(i.severity)}>{i.severity}</Badge></TableCell>
                  <TableCell className="text-xs">{new Date(i.occurred_at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">
                    {i.notification_received_at ? new Date(i.notification_received_at).toLocaleString() : 'Not notified'}
                    {i.sla_breached && (
                      <Badge variant="outline" className="ml-2 bg-destructive/10 text-destructive border-destructive/20">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Late {i.notification_delay_minutes ? `${Math.round(i.notification_delay_minutes)}m` : ''}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">{i.affected_transactions ?? '—'}</TableCell>
                  <TableCell><Badge variant="outline">{i.resolution_status}</Badge></TableCell>
                  <TableCell className="text-right">
                    {i.resolution_status !== 'resolved' && (
                      <Button size="sm" variant="outline" data-rbac="prudential_supervision.edit"
                        onClick={() => { setResolveTarget(i.id); setResolveNotes(''); }}>Resolve</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Record payment system incident</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            {!operatorId && (
              <div className="md:col-span-2">
                <Label>Operator</Label>
                <Select value={form.operator_id} onValueChange={v => setForm((f: any) => ({ ...f, operator_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Choose operator" /></SelectTrigger>
                  <SelectContent>
                    {operators.map(o => <SelectItem key={o.id} value={o.id}>{o.operator_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="md:col-span-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <Label>Incident type</Label>
              <Select value={form.incident_type} onValueChange={v => setForm((f: any) => ({ ...f, incident_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INCIDENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Severity</Label>
              <Select value={form.severity} onValueChange={v => setForm((f: any) => ({ ...f, severity: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Occurred at</Label>
              <Input type="datetime-local" value={form.occurred_at}
                onChange={e => setForm((f: any) => ({ ...f, occurred_at: e.target.value }))} />
            </div>
            <div>
              <Label>Notification received at</Label>
              <Input type="datetime-local" value={form.notification_received_at}
                onChange={e => setForm((f: any) => ({ ...f, notification_received_at: e.target.value }))} />
            </div>
            <div>
              <Label>Affected transactions</Label>
              <Input type="number" min={0} value={form.affected_transactions}
                onChange={e => setForm((f: any) => ({ ...f, affected_transactions: e.target.value }))} />
            </div>
            <div>
              <Label>Affected value</Label>
              <Input type="number" min={0} value={form.affected_value}
                onChange={e => setForm((f: any) => ({ ...f, affected_value: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <Label>Description</Label>
              <Textarea rows={3} value={form.description}
                onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!form.operator_id || !form.title || !form.occurred_at || record.isPending}
              onClick={submit}>
              {record.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Recording…</> : 'Record incident'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resolveTarget} onOpenChange={o => !o && setResolveTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve incident</DialogTitle></DialogHeader>
          <div>
            <Label>Resolution notes</Label>
            <Textarea rows={4} value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveTarget(null)}>Cancel</Button>
            <Button disabled={resolve.isPending}
              onClick={async () => {
                await resolve.mutateAsync({ id: resolveTarget!, notes: resolveNotes || undefined });
                setResolveTarget(null);
              }}>
              {resolve.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : 'Mark resolved'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
