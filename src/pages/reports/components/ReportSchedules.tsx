import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Mail, Trash2, Play, Search } from 'lucide-react';
import { useReportSchedules } from '../hooks/useReportSchedules';
import { useReports } from '../hooks/useReports';
import type { ExportFormat, ScheduleFrequency } from '../types';
import { useToast } from '@/hooks/use-toast';
import { runScheduleNow } from '../services/reportService';
import type { ReportDefinition } from '../types';
import { useReportOptions, useReportDefinitions } from '../hooks/useReportMetadata';

interface Props {
  scheduleDialogOpen: boolean;
  setScheduleDialogOpen: (o: boolean) => void;
  prefillReportId?: string | null;
  prefillDefinition?: ReportDefinition | null;
}

export function ReportSchedules({ scheduleDialogOpen, setScheduleDialogOpen, prefillReportId, prefillDefinition }: Props) {
  const { toast } = useToast();
  const { data, isLoading, create, update, remove, invalidate } = useReportSchedules();
  const { data: reports } = useReports();
  const { data: definitions = [] } = useReportDefinitions();
  const { data: frequencies = [] } = useReportOptions('schedule_frequency');
  const { data: exportFormats = [] } = useReportOptions('export_format');
  const [search, setSearch] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const [form, setForm] = useState({
    reportId: prefillReportId || '',
    frequency: 'weekly' as ScheduleFrequency,
    recipients: '',
    exportFormat: 'xlsx' as ExportFormat,
  });

  useEffect(() => {
    if (prefillReportId) setForm((f) => ({ ...f, reportId: prefillReportId }));
    if (prefillDefinition) setForm((f) => ({ ...f, reportId: `slug:${prefillDefinition.id}` }));
  }, [prefillReportId, prefillDefinition]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return q ? data.filter((s) => (s.reportName || '').toLowerCase().includes(q) || s.frequency.includes(q)) : data;
  }, [data, search]);

  const handleCreate = () => {
    const recipients = form.recipients.split(',').map((e) => e.trim()).filter(Boolean);
    if (!form.reportId) return toast({ title: 'Select a report', variant: 'destructive' });
    if (!recipients.length) return toast({ title: 'Add at least one recipient', variant: 'destructive' });

    let payload: Parameters<typeof create.mutate>[0];
    if (form.reportId.startsWith('slug:')) {
      const slug = form.reportId.slice(5);
      const def = (prefillDefinition && prefillDefinition.id === slug)
        ? prefillDefinition
        : definitions.find((d) => d.id === slug);
      if (!def) return toast({ title: 'Report not found', variant: 'destructive' });
      payload = {
        reportId: null,
        reportSlug: def.id,
        reportName: def.name,
        source: def.source,
        filters: {},
        selectedColumns: def.defaultColumns,
        groupBy: def.defaultGroupBy,
        frequency: form.frequency,
        recipients,
        exportFormat: form.exportFormat,
      };
    } else {
      const report = (reports || []).find((r) => r.id === form.reportId);
      payload = {
        reportId: form.reportId,
        reportName: report?.name || 'Report',
        reportSlug: report?.slug,
        source: report?.source,
        filters: report?.filters,
        selectedColumns: report?.selectedColumns,
        groupBy: report?.groupBy,
        sortBy: report?.sortBy,
        sortDir: report?.sortDir,
        frequency: form.frequency,
        recipients,
        exportFormat: form.exportFormat,
      };
    }
    create.mutate(payload, {
      onSuccess: () => {
        toast({ title: 'Schedule created' });
        setScheduleDialogOpen(false);
        setForm({ reportId: '', frequency: 'weekly', recipients: '', exportFormat: 'xlsx' });
      },
      onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
    });
  };

  const handleRunNow = async (id: string) => {
    setRunningId(id);
    try {
      await runScheduleNow(id);
      toast({ title: 'Schedule executed' });
      invalidate();
    } catch (e: any) {
      toast({ title: 'Run failed', description: e?.message, variant: 'destructive' });
    } finally {
      setRunningId(null);
    }
  };

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search schedules..." className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No scheduled reports. Click "Schedule Report" to set up automated delivery.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <Card key={s.id}>
              <CardContent className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{s.reportName || 'Unknown Report'}</p>
                    <p className="text-sm text-muted-foreground">
                      {s.frequency} · {s.exportFormat.toUpperCase()} · {s.recipients.length} recipient{s.recipients.length === 1 ? '' : 's'}
                      {s.nextRunAt && ` · Next: ${new Date(s.nextRunAt).toLocaleDateString()}`}
                      {s.lastRunAt && ` · Last: ${new Date(s.lastRunAt).toLocaleDateString()}`}
                    </p>
                    {s.lastStatus && (
                      <Badge variant={s.lastStatus === 'completed' ? 'default' : s.lastStatus === 'failed' ? 'destructive' : 'secondary'} className="mt-1 text-[10px]">
                        {s.lastStatus.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    {s.lastError && <p className="mt-1 text-xs text-destructive truncate">{s.lastError}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={s.isActive ? 'default' : 'secondary'}>{s.isActive ? 'Active' : 'Paused'}</Badge>
                    <Switch checked={s.isActive} onCheckedChange={(checked) =>
                      update.mutate({ id: s.id, patch: { isActive: checked } })
                    } />
                    <Button size="sm" variant="outline" disabled={runningId === s.id} onClick={() => handleRunNow(s.id)}>
                      <Play className={`h-3 w-3 mr-1 ${runningId === s.id ? 'animate-spin' : ''}`} />
                      {runningId === s.id ? 'Running…' : 'Run Now'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmId(s.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule a Report</DialogTitle>
            <DialogDescription>Automate generation and email delivery.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Report</Label>
              <Select value={form.reportId || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, reportId: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Select a report..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select a report...</SelectItem>
                  {definitions.length > 0 && (
                    <>
                      {definitions.map((d) => (
                        <SelectItem key={`slug-${d.id}`} value={`slug:${d.id}`}>{d.name} (predefined)</SelectItem>
                      ))}
                    </>
                  )}
                  {(reports || []).filter((r) => r.status === 'ready').map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={(v) => setForm((f) => ({ ...f, frequency: v as ScheduleFrequency }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {frequencies.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Recipients (comma-separated)</Label>
              <Input value={form.recipients} onChange={(e) => setForm((f) => ({ ...f, recipients: e.target.value }))} placeholder="admin@org.com, officer@org.com" />
            </div>
            <div className="space-y-2">
              <Label>Export Format</Label>
              <Select value={form.exportFormat} onValueChange={(v) => setForm((f) => ({ ...f, exportFormat: v as ExportFormat }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {exportFormats.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleCreate} disabled={create.isPending}>
              <Mail className="h-4 w-4 mr-2" />{create.isPending ? 'Creating…' : 'Create Schedule'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Note: email delivery is handled by the platform notification service if configured.
              When unavailable, schedules show "generated_email_pending" so delivery can be wired by an admin.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmId !== null} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this schedule?</AlertDialogTitle>
            <AlertDialogDescription>The recurring delivery will be stopped.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (confirmId) remove.mutate(confirmId, {
                onSuccess: () => toast({ title: 'Schedule deleted' }),
                onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
              });
              setConfirmId(null);
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
