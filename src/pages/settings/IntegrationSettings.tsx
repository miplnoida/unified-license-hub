import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Plug, RefreshCw, Activity, KeyRound, BellRing, Zap, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RetryQueuePanel } from '@/components/settings/integrations/RetryQueuePanel';


type Health = {
  connection_id: string;
  integration_key: string;
  name: string;
  type: string;
  protocol: string | null;
  enabled: boolean;
  status: string;
  base_url: string | null;
  auth_type: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  last_test_at: string | null;
  last_test_latency_ms: number | null;
  error_count_24h: number;
  event_count_24h: number;
  credential_masked_hint: string | null;
  credential_rotated_at: string | null;
  disabled_reason: string | null;
};

type LogRow = {
  id: string;
  direction: string;
  integration_key: string;
  endpoint: string | null;
  method: string | null;
  status: string;
  http_status: number | null;
  duration_ms: number | null;
  request_summary: string | null;
  response_summary: string | null;
  error: string | null;
  created_at: string;
};

function TrafficLight({ row }: { row: Health }) {
  const tone = !row.enabled
    ? { dot: 'bg-muted-foreground', label: 'Disabled', cls: 'bg-muted text-muted-foreground border-border' }
    : Number(row.error_count_24h) > 0 || row.status === 'error'
      ? { dot: 'bg-destructive', label: 'Errors', cls: 'bg-destructive/10 text-destructive border-destructive/30' }
      : row.status === 'active'
        ? { dot: 'bg-success', label: 'Healthy', cls: 'bg-success/10 text-success border-success/30' }
        : { dot: 'bg-warning', label: 'Untested', cls: 'bg-warning/10 text-warning border-warning/30' };
  return (
    <Badge variant="outline" className={`gap-2 ${tone.cls}`}>
      <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
      {tone.label}
    </Badge>
  );
}

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString() : '—');

export default function IntegrationSettings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editing, setEditing] = useState<Health | null>(null);
  const [rotating, setRotating] = useState<Health | null>(null);
  const [toggling, setToggling] = useState<Health | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [logStatus, setLogStatus] = useState('all');
  const [logKey, setLogKey] = useState('all');

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['integration-health'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('integration_health_summary');
      if (error) throw error;
      return (data ?? []) as Health[];
    },
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['integration-events', logStatus, logKey],
    queryFn: async () => {
      let q = supabase
        .from('integration_logs')
        .select('id, direction, integration_key, endpoint, method, status, http_status, duration_ms, request_summary, response_summary, error, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (logStatus !== 'all') q = q.eq('status', logStatus);
      if (logKey !== 'all') q = q.eq('integration_key', logKey);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const { data: alertRule } = useQuery({
    queryKey: ['integration-alert-rule'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_alert_rules')
        .select('id, connection_id, error_count_threshold, window_minutes, enabled, last_fired_at')
        .is('connection_id', null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [threshold, setThreshold] = useState<string>('');
  const [windowMin, setWindowMin] = useState<string>('');
  const effThreshold = threshold !== '' ? threshold : String(alertRule?.error_count_threshold ?? 5);
  const effWindow = windowMin !== '' ? windowMin : String(alertRule?.window_minutes ?? 15);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['integration-health'] });
    qc.invalidateQueries({ queryKey: ['integration-events'] });
  };

  const saveConnection = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { error } = await supabase.rpc('integration_connection_save', { _payload: payload as never });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Connection saved' });
      setEditing(null);
      invalidate();
    },
    onError: (e: unknown) => toast({
      title: 'Save failed',
      description: e instanceof Error ? e.message : 'Unable to save connection.',
      variant: 'destructive',
    }),
  });

  const rotateCredential = useMutation({
    mutationFn: async (v: { id: string; secretRef: string; prefix: string }) => {
      const { error } = await supabase.rpc('integration_credentials_rotate', {
        _connection_id: v.id, _secret_ref: v.secretRef, _key_prefix: v.prefix,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Credential reference rotated' });
      setRotating(null);
      invalidate();
    },
    onError: (e: unknown) => toast({
      title: 'Rotation failed',
      description: e instanceof Error ? e.message : 'Unable to rotate credential.',
      variant: 'destructive',
    }),
  });

  const setEnabled = useMutation({
    mutationFn: async (v: { id: string; enabled: boolean; justification: string }) => {
      const { error } = await supabase.rpc('integration_connection_set_enabled', {
        _connection_id: v.id, _enabled: v.enabled, _justification: v.justification,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Integration status updated' });
      setToggling(null);
      invalidate();
    },
    onError: (e: unknown) => toast({
      title: 'Update failed',
      description: e instanceof Error ? e.message : 'Unable to change status.',
      variant: 'destructive',
    }),
  });

  const saveAlertRule = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('integration_alert_rule_save', {
        _payload: {
          id: alertRule?.id ?? null,
          connection_id: null,
          error_count_threshold: Number(effThreshold),
          window_minutes: Number(effWindow),
          enabled: true,
        } as never,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Alert threshold saved' });
      qc.invalidateQueries({ queryKey: ['integration-alert-rule'] });
    },
    onError: (e: unknown) => toast({
      title: 'Save failed',
      description: e instanceof Error ? e.message : 'Unable to save alert rule.',
      variant: 'destructive',
    }),
  });

  const testConnection = async (row: Health) => {
    setTestingId(row.connection_id);
    try {
      const { data, error } = await supabase.functions.invoke('integration-test-connection', {
        body: { connection_id: row.connection_id },
      });
      if (error) throw error;
      const res = data as { ok?: boolean; message?: string; latency_ms?: number; error?: string };
      toast({
        title: res.ok ? `${row.name}: reachable` : `${row.name}: not reachable`,
        description: `${res.message ?? res.error ?? 'No detail returned.'}${res.latency_ms != null ? ` (${res.latency_ms} ms)` : ''}`,
        variant: res.ok ? undefined : 'destructive',
      });
      invalidate();
    } catch (e) {
      toast({
        title: 'Test failed',
        description: e instanceof Error ? e.message : 'Unable to run the probe.',
        variant: 'destructive',
      });
    } finally {
      setTestingId(null);
    }
  };

  const keys = useMemo(() => rows.map(r => r.integration_key), [rows]);
  const errorTotal = rows.reduce((a, r) => a + Number(r.error_count_24h), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Integration Manager"
          description="Configure external connections, probe reachability, monitor events and set failure alert thresholds."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/settings')}>
                <ArrowLeft className="h-4 w-4 mr-2" />Back
              </Button>
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />Refresh
              </Button>
            </div>
          }
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Registered connections</p>
            <p className="text-2xl font-bold">{rows.length}</p>
          </CardContent></Card>
          <Card><CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Enabled</p>
            <p className="text-2xl font-bold">{rows.filter(r => r.enabled).length}</p>
          </CardContent></Card>
          <Card><CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Errors (last 24h)</p>
            <p className="text-2xl font-bold">{errorTotal}</p>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="connections">
          <TabsList>
            <TabsTrigger value="connections"><Plug className="h-4 w-4 mr-2" />Connections</TabsTrigger>
            <TabsTrigger value="events"><Activity className="h-4 w-4 mr-2" />Event Log</TabsTrigger>
            <TabsTrigger value="retries"><RotateCcw className="h-4 w-4 mr-2" />Retry Queue / Dead Letter</TabsTrigger>
            <TabsTrigger value="alerts"><BellRing className="h-4 w-4 mr-2" />Alerts</TabsTrigger>
          </TabsList>

          <TabsContent value="retries" className="mt-4">
            <RetryQueuePanel />
          </TabsContent>



          <TabsContent value="connections" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Integration connections</CardTitle></CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="py-10 flex justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Integration</TableHead>
                          <TableHead>Health</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Credential</TableHead>
                          <TableHead>Last success</TableHead>
                          <TableHead>Last test</TableHead>
                          <TableHead className="text-right">Errors 24h</TableHead>
                          <TableHead className="text-right">Events 24h</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r) => (
                          <TableRow key={r.connection_id}>
                            <TableCell>
                              <p className="font-medium">{r.name}</p>
                              <p className="font-mono text-xs text-muted-foreground">{r.integration_key}</p>
                              {!r.enabled && r.disabled_reason && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Disabled: {r.disabled_reason}
                                </p>
                              )}
                            </TableCell>
                            <TableCell><TrafficLight row={r} /></TableCell>
                            <TableCell className="text-xs">
                              {r.type}{r.protocol ? ` · ${r.protocol}` : ''}
                            </TableCell>
                            <TableCell className="text-xs font-mono">
                              {r.credential_masked_hint ?? 'not set'}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{fmt(r.last_success_at)}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {fmt(r.last_test_at)}
                              {r.last_test_latency_ms != null && (
                                <span className="text-muted-foreground"> · {r.last_test_latency_ms} ms</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-xs">{r.error_count_24h}</TableCell>
                            <TableCell className="text-right text-xs">{r.event_count_24h}</TableCell>
                            <TableCell className="text-right">
                              <PermissionGate module="settings" action="edit">
                                <div className="flex justify-end gap-1">
                                  <Button size="sm" variant="outline" onClick={() => testConnection(r)} disabled={testingId === r.connection_id}>
                                    {testingId === r.connection_id
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : <Zap className="h-3.5 w-3.5" />}
                                    <span className="ml-1">Test</span>
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setEditing(r)}>Configure</Button>
                                  <Button size="sm" variant="outline" onClick={() => setRotating(r)}>
                                    <KeyRound className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" variant={r.enabled ? 'outline' : 'default'} onClick={() => setToggling(r)}>
                                    {r.enabled ? 'Disable' : 'Enable'}
                                  </Button>
                                </div>
                              </PermissionGate>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="events" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Integration event log</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <div className="w-48">
                    <Select value={logKey} onValueChange={setLogKey}>
                      <SelectTrigger><SelectValue placeholder="Integration" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All integrations</SelectItem>
                        {keys.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-40">
                    <Select value={logStatus} onValueChange={setLogStatus}>
                      <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="success">Success</SelectItem>
                        <SelectItem value="failure">Failure</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {logsLoading ? (
                  <div className="py-10 flex justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : logs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No integration events recorded for this filter.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>When</TableHead>
                          <TableHead>Integration</TableHead>
                          <TableHead>Direction</TableHead>
                          <TableHead>Endpoint</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Payload summary</TableHead>
                          <TableHead className="text-right">Duration</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logs.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell className="text-xs whitespace-nowrap">{fmt(l.created_at)}</TableCell>
                            <TableCell className="font-mono text-xs">{l.integration_key}</TableCell>
                            <TableCell className="text-xs">{l.direction}</TableCell>
                            <TableCell className="max-w-[220px] truncate text-xs">
                              {l.method ? `${l.method} ` : ''}{l.endpoint ?? '—'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={l.status === 'success'
                                ? 'bg-success/10 text-success border-success/30'
                                : l.status === 'failure'
                                  ? 'bg-destructive/10 text-destructive border-destructive/30'
                                  : 'bg-warning/10 text-warning border-warning/30'}>
                                {l.status}{l.http_status ? ` · ${l.http_status}` : ''}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[320px] truncate text-xs text-muted-foreground">
                              {l.error ?? l.response_summary ?? l.request_summary ?? '—'}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {l.duration_ms != null ? `${l.duration_ms} ms` : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Failure alert threshold</CardTitle></CardHeader>
              <CardContent className="space-y-4 max-w-xl">
                <p className="text-sm text-muted-foreground">
                  When the number of failed integration events reaches the threshold inside the
                  rolling window, an escalation is raised to the integration owners.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Error count threshold</Label>
                    <Input type="number" min={1} value={effThreshold} onChange={(e) => setThreshold(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Window (minutes)</Label>
                    <Input type="number" min={1} value={effWindow} onChange={(e) => setWindowMin(e.target.value)} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Last fired: {fmt(alertRule?.last_fired_at ?? null)}
                </p>
                <PermissionGate module="settings" action="edit">
                  <Button onClick={() => saveAlertRule.mutate()} disabled={saveAlertRule.isPending}>
                    {saveAlertRule.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save threshold
                  </Button>
                </PermissionGate>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ConfigureDialog
        row={editing}
        onClose={() => setEditing(null)}
        onSave={(payload) => saveConnection.mutate(payload)}
        saving={saveConnection.isPending}
      />
      <RotateDialog
        row={rotating}
        onClose={() => setRotating(null)}
        onSave={(secretRef, prefix) => rotating && rotateCredential.mutate({ id: rotating.connection_id, secretRef, prefix })}
        saving={rotateCredential.isPending}
      />
      <ToggleDialog
        row={toggling}
        onClose={() => setToggling(null)}
        onConfirm={(justification) => toggling && setEnabled.mutate({
          id: toggling.connection_id, enabled: !toggling.enabled, justification,
        })}
        saving={setEnabled.isPending}
      />
    </DashboardLayout>
  );
}

function ConfigureDialog({
  row, onClose, onSave, saving,
}: {
  row: Health | null;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [reset, setReset] = useState<string | null>(null);
  if (row && reset !== row.connection_id) {
    setReset(row.connection_id);
    setForm({
      name: row.name,
      base_url: row.base_url ?? '',
      auth_type: row.auth_type ?? 'api_key',
      timeout_ms: '',
      retry_count: '',
      retry_backoff_ms: '',
      data_mapping: '',
    });
  }
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) { setReset(null); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure {row?.name}</DialogTitle>
          <DialogDescription>
            Endpoint, timeout and retry behaviour. Credentials are never displayed —
            rotate them from the key action on the connection row.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Display name</Label>
            <Input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Endpoint / base URL</Label>
            <Input value={form.base_url ?? ''} onChange={(e) => set('base_url', e.target.value)} placeholder="https://…" />
          </div>
          <div className="space-y-1.5">
            <Label>Authentication type</Label>
            <Select value={form.auth_type ?? 'api_key'} onValueChange={(v) => set('auth_type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="api_key">API key</SelectItem>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                <SelectItem value="mtls">Mutual TLS</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Timeout (ms)</Label>
              <Input type="number" value={form.timeout_ms ?? ''} placeholder="unchanged" onChange={(e) => set('timeout_ms', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Retries</Label>
              <Input type="number" value={form.retry_count ?? ''} placeholder="unchanged" onChange={(e) => set('retry_count', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Backoff (ms)</Label>
              <Input type="number" value={form.retry_backoff_ms ?? ''} placeholder="unchanged" onChange={(e) => set('retry_backoff_ms', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Data mapping (JSON, optional)</Label>
            <Textarea
              rows={4}
              className="font-mono text-xs"
              placeholder='{"applicant_name":"customerName"}'
              value={form.data_mapping ?? ''}
              onChange={(e) => set('data_mapping', e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setReset(null); onClose(); }}>Cancel</Button>
          <Button data-rbac="settings.edit"
            disabled={saving}
            onClick={() => {
              let mapping: unknown;
              if (form.data_mapping?.trim()) {
                try { mapping = JSON.parse(form.data_mapping); } catch { mapping = undefined; }
              }
              onSave({
                id: row?.connection_id,
                integration_key: row?.integration_key,
                name: form.name,
                base_url: form.base_url || null,
                auth_type: form.auth_type,
                ...(form.timeout_ms ? { timeout_ms: Number(form.timeout_ms) } : {}),
                ...(form.retry_count ? { retry_count: Number(form.retry_count) } : {}),
                ...(form.retry_backoff_ms ? { retry_backoff_ms: Number(form.retry_backoff_ms) } : {}),
                ...(mapping ? { data_mapping: mapping } : {}),
              });
              setReset(null);
            }}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RotateDialog({
  row, onClose, onSave, saving,
}: {
  row: Health | null;
  onClose: () => void;
  onSave: (secretRef: string, prefix: string) => void;
  saving: boolean;
}) {
  const [secretRef, setSecretRef] = useState('');
  const [prefix, setPrefix] = useState('');
  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) { setSecretRef(''); setPrefix(''); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rotate credential — {row?.name}</DialogTitle>
          <DialogDescription>
            Secret values are held in the platform secret store and are never shown here.
            Record the secret name and a masked hint so operators can confirm which key is live.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Secret name in secret store</Label>
            <Input value={secretRef} onChange={(e) => setSecretRef(e.target.value)} placeholder="AML_SCREENING_API_KEY" />
          </div>
          <div className="space-y-1.5">
            <Label>Masked hint (first characters only)</Label>
            <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="sk_live_9f2" />
          </div>
          <p className="text-xs text-muted-foreground">
            Current: <span className="font-mono">{row?.credential_masked_hint ?? 'not set'}</span>
            {row?.credential_rotated_at ? ` · rotated ${fmt(row.credential_rotated_at)}` : ''}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-rbac="settings.edit" disabled={saving || !secretRef.trim()} onClick={() => onSave(secretRef.trim(), prefix.trim())}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Rotate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleDialog({
  row, onClose, onConfirm, saving,
}: {
  row: Health | null;
  onClose: () => void;
  onConfirm: (justification: string) => void;
  saving: boolean;
}) {
  const [reason, setReason] = useState('');
  const [deps, setDeps] = useState<string[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (row && loadedFor !== row.connection_id) {
    setLoadedFor(row.connection_id);
    setDeps(null);
    supabase.rpc('integration_connection_dependencies', { _connection_id: row.connection_id })
      .then(({ data }) => {
        const d = data as { dependencies?: string[] } | null;
        setDeps(Array.isArray(d?.dependencies) ? d!.dependencies! : []);
      });
  }

  const disabling = !!row?.enabled;
  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) { setReason(''); setLoadedFor(null); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{disabling ? 'Disable' : 'Enable'} {row?.name}</DialogTitle>
          <DialogDescription>
            {disabling
              ? 'Disabling stops all calls through this integration. A justification is recorded in the audit trail.'
              : 'Re-enabling resumes calls through this integration. The change is recorded in the audit trail.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {disabling && deps && deps.length > 0 && (
            <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
              <p className="font-medium text-warning">Dependent processes affected</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                {deps.map(d => <li key={d}>{d}</li>)}
              </ul>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Justification</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for this change (recorded in the audit log)" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant={disabling ? 'destructive' : 'default'}
            disabled={saving || reason.trim().length < 5}
            onClick={() => { onConfirm(reason.trim()); setReason(''); setLoadedFor(null); }}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {disabling ? 'Disable integration' : 'Enable integration'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
