import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ShieldCheck, Download, Loader2, FileWarning, History } from 'lucide-react';
import { logExport, type ComplianceAuditAction } from '@/lib/complianceAudit';

interface AuditRow {
  entry_id: string;
  timestamp: string;
  user_id: string | null;
  user_role: string | null;
  action_type: ComplianceAuditAction;
  object_type: string;
  object_id: string | null;
  before_value: any;
  after_value: any;
  justification: string | null;
  ai_model_version: string | null;
  ip_address: string | null;
}

interface SecurityRow {
  id: string;
  event_time: string;
  user_id: string | null;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  target_resource: string | null;
  detail: any;
}

const ACTION_TYPES: ComplianceAuditAction[] = [
  'CREATE','UPDATE','DELETE','APPROVE','REJECT','OVERRIDE','EXPORT',
  'ACCESS_DENIED','WORKFLOW_TRANSITION','NOTIFICATION_SENT','INTEGRATION_EVENT','LOGIN','LOGOUT',
];

const ACTION_BADGE: Record<string, string> = {
  CREATE: 'bg-success/15 text-success border-success/30',
  UPDATE: 'bg-info/15 text-info border-info/30',
  DELETE: 'bg-destructive/15 text-destructive border-destructive/30',
  APPROVE: 'bg-success/15 text-success border-success/30',
  REJECT: 'bg-destructive/15 text-destructive border-destructive/30',
  OVERRIDE: 'bg-warning/15 text-warning border-warning/30',
  EXPORT: 'bg-primary/15 text-primary border-primary/30',
  ACCESS_DENIED: 'bg-destructive/15 text-destructive border-destructive/30',
  WORKFLOW_TRANSITION: 'bg-info/15 text-info border-info/30',
  NOTIFICATION_SENT: 'bg-muted text-muted-foreground',
  INTEGRATION_EVENT: 'bg-muted text-muted-foreground',
  LOGIN: 'bg-muted text-muted-foreground',
  LOGOUT: 'bg-muted text-muted-foreground',
};

function fmt(d: string) {
  return new Date(d).toLocaleString('en-GB', { timeZone: 'UTC', hour12: false }) + ' UTC';
}

function toCsv(rows: any[], headers: string[]): string {
  const esc = (v: any) => {
    if (v == null) return '';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
}

function download(filename: string, content: string, mime = 'text/csv') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function ComplianceAuditLogs() {
  const [tab, setTab] = useState('all');

  // ---- All Entries ----
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [objectType, setObjectType] = useState('');
  const [objectId, setObjectId] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<AuditRow | null>(null);

  // ---- Case-Centric ----
  const [caseObjectType, setCaseObjectType] = useState('application');
  const [caseObjectId, setCaseObjectId] = useState('');
  const [caseRows, setCaseRows] = useState<AuditRow[]>([]);
  const [caseLoading, setCaseLoading] = useState(false);

  // ---- Security Events ----
  const [secRows, setSecRows] = useState<SecurityRow[]>([]);
  const [secLoading, setSecLoading] = useState(false);
  const [secType, setSecType] = useState<string>('all');

  async function loadAll() {
    setLoading(true);
    let q = supabase
      .from('compliance_audit_logs' as any)
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(500);
    if (actionFilter !== 'all') q = q.eq('action_type', actionFilter);
    if (objectType) q = q.ilike('object_type', `%${objectType}%`);
    if (objectId) q = q.eq('object_id', objectId);
    if (userId) q = q.eq('user_id', userId);
    if (from) q = q.gte('timestamp', from);
    if (to) q = q.lte('timestamp', new Date(new Date(to).getTime() + 86400000).toISOString());
    const { data, error } = await q;
    if (error) console.warn(error);
    setRows((data as any[] as AuditRow[]) ?? []);
    setLoading(false);
  }

  async function loadCase() {
    if (!caseObjectId.trim()) { setCaseRows([]); return; }
    setCaseLoading(true);
    const { data } = await supabase
      .from('compliance_audit_logs' as any)
      .select('*')
      .eq('object_type', caseObjectType)
      .eq('object_id', caseObjectId.trim())
      .order('timestamp', { ascending: true });
    setCaseRows((data as any[] as AuditRow[]) ?? []);
    setCaseLoading(false);
  }

  async function loadSec() {
    setSecLoading(true);
    let q = supabase
      .from('security_event_logs' as any)
      .select('*')
      .order('event_time', { ascending: false })
      .limit(500);
    if (secType !== 'all') q = q.eq('event_type', secType);
    const { data } = await q;
    setSecRows((data as any[] as SecurityRow[]) ?? []);
    setSecLoading(false);
  }

  useEffect(() => { if (tab === 'all') loadAll(); }, [tab]);
  useEffect(() => { if (tab === 'security') loadSec(); }, [tab, secType]);

  const exportsRows = useMemo(
    () => rows.filter(r => r.action_type === 'EXPORT'),
    [rows],
  );

  const versionRows = useMemo(
    () => caseRows.filter(r => ['CREATE','UPDATE','OVERRIDE','APPROVE','REJECT'].includes(r.action_type)),
    [caseRows],
  );

  async function exportCsv(kind: 'all' | 'case' | 'security' | 'exports') {
    let data: any[] = [];
    let headers: string[] = [];
    let name = `audit-${kind}-${new Date().toISOString().slice(0,19)}.csv`;
    if (kind === 'all' || kind === 'exports') {
      const src = kind === 'all' ? rows : exportsRows;
      headers = ['entry_id','timestamp','user_id','user_role','action_type','object_type','object_id','justification','ai_model_version','ip_address'];
      data = src;
    } else if (kind === 'case') {
      headers = ['entry_id','timestamp','user_id','user_role','action_type','object_type','object_id','before_value','after_value','justification'];
      data = caseRows;
    } else {
      headers = ['id','event_time','user_id','event_type','target_resource','ip_address','user_agent'];
      data = secRows;
    }
    download(name, toCsv(data, headers));
    await logExport({
      object_type: `compliance_audit_logs:${kind}`,
      format: 'CSV',
      criteria: { actionFilter, objectType, objectId, userId, from, to, secType, caseObjectType, caseObjectId },
      record_count: data.length,
    });
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Audit Logs"
          description="Immutable, tamper-proof legal evidence log. All entries are permanently retained and read-only."
          icon={<ShieldCheck className="h-6 w-6" />}
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-5 max-w-3xl">
            <TabsTrigger value="all">All Entries</TabsTrigger>
            <TabsTrigger value="case">Case-Centric</TabsTrigger>
            <TabsTrigger value="versions">Version History</TabsTrigger>
            <TabsTrigger value="security">Security Events</TabsTrigger>
            <TabsTrigger value="exports">Exports Log</TabsTrigger>
          </TabsList>

          {/* ---------- All Entries ---------- */}
          <TabsContent value="all" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div>
                  <Label>Action</Label>
                  <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {ACTION_TYPES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Object Type</Label><Input value={objectType} onChange={e => setObjectType(e.target.value)} placeholder="application" /></div>
                <div><Label>Object ID</Label><Input value={objectId} onChange={e => setObjectId(e.target.value)} /></div>
                <div><Label>User ID</Label><Input value={userId} onChange={e => setUserId(e.target.value)} /></div>
                <div><Label>From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
                <div><Label>To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
                <div className="md:col-span-3 lg:col-span-6 flex gap-2">
                  <Button onClick={loadAll} disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Apply Filters
                  </Button>
                  <Button variant="outline" onClick={() => exportCsv('all')}>
                    <Download className="h-4 w-4 mr-2" /> Export CSV
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp (UTC)</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Object</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(r => (
                      <TableRow key={r.entry_id} className="cursor-pointer" onClick={() => setSelected(r)}>
                        <TableCell className="font-mono text-xs">{fmt(r.timestamp)}</TableCell>
                        <TableCell><Badge variant="outline" className={ACTION_BADGE[r.action_type] || ''}>{r.action_type}</Badge></TableCell>
                        <TableCell className="text-xs"><span className="font-medium">{r.object_type}</span>{r.object_id ? ` · ${r.object_id.slice(0,8)}` : ''}</TableCell>
                        <TableCell className="font-mono text-xs">{r.user_id?.slice(0,8) ?? 'system'}</TableCell>
                        <TableCell className="text-xs">{r.user_role ?? '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{r.ip_address ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                    {!loading && rows.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No entries</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------- Case-Centric ---------- */}
          <TabsContent value="case" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Trace by Object</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div>
                  <Label>Object Type</Label>
                  <Select value={caseObjectType} onValueChange={setCaseObjectType}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['application','registration','return','complaint','license','payment','workflow','pq_declaration'].map(t =>
                        <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[260px]">
                  <Label>Object ID</Label>
                  <Input value={caseObjectId} onChange={e => setCaseObjectId(e.target.value)} placeholder="Enter case / entity ID" />
                </div>
                <Button onClick={loadCase} disabled={caseLoading || !caseObjectId.trim()}>
                  {caseLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Trace
                </Button>
                <Button variant="outline" onClick={() => exportCsv('case')} disabled={caseRows.length === 0}>
                  <Download className="h-4 w-4 mr-2" /> Export CSV
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                {caseRows.length === 0 && !caseLoading && (
                  <p className="text-sm text-muted-foreground text-center py-8">Enter an object ID and click Trace to view its chronological audit trail.</p>
                )}
                <ol className="relative border-l border-border ml-3 space-y-4">
                  {caseRows.map(r => (
                    <li key={r.entry_id} className="ml-4">
                      <div className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full bg-primary border border-background" />
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{fmt(r.timestamp)}</span>
                        <Badge variant="outline" className={ACTION_BADGE[r.action_type] || ''}>{r.action_type}</Badge>
                        {r.user_role && <span>· {r.user_role}</span>}
                      </div>
                      <button onClick={() => setSelected(r)} className="text-sm text-left text-foreground hover:underline mt-0.5">
                        {r.object_type} {r.object_id?.slice(0,8) ?? ''} · {r.user_id?.slice(0,8) ?? 'system'}
                      </button>
                      {r.justification && (
                        <p className="text-xs text-muted-foreground mt-1 italic">Justification: {r.justification}</p>
                      )}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------- Version History ---------- */}
          <TabsContent value="versions" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> Field-level version history</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">Use the Case-Centric tab to load an object; this tab shows the before/after data lineage for each change.</p>
                {versionRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No change history loaded. Trace an object in the Case-Centric tab.</p>
                ) : (
                  <div className="space-y-3">
                    {versionRows.map(r => (
                      <div key={r.entry_id} className="border rounded-md p-3">
                        <div className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className={ACTION_BADGE[r.action_type] || ''}>{r.action_type}</Badge>
                          <span className="font-mono">{fmt(r.timestamp)}</span>
                          <span>· {r.user_role ?? 'system'}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 text-xs">
                          <div><p className="font-medium mb-1">Before</p><pre className="bg-muted/50 p-2 rounded overflow-auto max-h-48">{JSON.stringify(r.before_value ?? {}, null, 2)}</pre></div>
                          <div><p className="font-medium mb-1">After</p><pre className="bg-muted/50 p-2 rounded overflow-auto max-h-48">{JSON.stringify(r.after_value ?? {}, null, 2)}</pre></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------- Security Events ---------- */}
          <TabsContent value="security" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><FileWarning className="h-4 w-4" /> Security Event Log</CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={secType} onValueChange={setSecType}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All event types</SelectItem>
                      {['ACCESS_DENIED','AUTH_FAILED','PERMISSION_ESCALATION','INTEGRATION_FAILURE'].map(t =>
                        <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => exportCsv('security')}>
                    <Download className="h-4 w-4 mr-2" /> Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time (UTC)</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Resource</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {secRows.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{fmt(s.event_time)}</TableCell>
                        <TableCell><Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">{s.event_type}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{s.user_id?.slice(0,8) ?? 'anonymous'}</TableCell>
                        <TableCell className="text-xs">{s.target_resource ?? '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{s.ip_address ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                    {!secLoading && secRows.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No security events</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------- Exports Log ---------- */}
          <TabsContent value="exports" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Exports Log</CardTitle>
                <Button variant="outline" onClick={() => exportCsv('exports')}>
                  <Download className="h-4 w-4 mr-2" /> Export CSV
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time (UTC)</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Object</TableHead>
                      <TableHead>Format</TableHead>
                      <TableHead>Records</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exportsRows.map(r => (
                      <TableRow key={r.entry_id} className="cursor-pointer" onClick={() => setSelected(r)}>
                        <TableCell className="font-mono text-xs">{fmt(r.timestamp)}</TableCell>
                        <TableCell className="font-mono text-xs">{r.user_id?.slice(0,8) ?? '—'}</TableCell>
                        <TableCell className="text-xs">{r.object_type}</TableCell>
                        <TableCell className="text-xs">{r.after_value?.format ?? '—'}</TableCell>
                        <TableCell className="text-xs">{r.after_value?.record_count ?? 0}</TableCell>
                      </TableRow>
                    ))}
                    {exportsRows.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No export entries in the loaded range. Apply filters under "All Entries" to load more.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ---- Detail Drawer ---- */}
        <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Audit Entry Details</SheetTitle>
            </SheetHeader>
            {selected && (
              <div className="space-y-4 mt-4 text-sm">
                <dl className="grid grid-cols-2 gap-2">
                  <dt className="text-muted-foreground">Entry ID</dt><dd className="font-mono text-xs">{selected.entry_id}</dd>
                  <dt className="text-muted-foreground">Timestamp</dt><dd className="font-mono text-xs">{fmt(selected.timestamp)}</dd>
                  <dt className="text-muted-foreground">Action</dt><dd><Badge variant="outline" className={ACTION_BADGE[selected.action_type] || ''}>{selected.action_type}</Badge></dd>
                  <dt className="text-muted-foreground">Object</dt><dd>{selected.object_type} {selected.object_id ? `· ${selected.object_id}` : ''}</dd>
                  <dt className="text-muted-foreground">User ID</dt><dd className="font-mono text-xs">{selected.user_id ?? 'system'}</dd>
                  <dt className="text-muted-foreground">Role</dt><dd>{selected.user_role ?? '—'}</dd>
                  <dt className="text-muted-foreground">IP</dt><dd className="font-mono text-xs">{selected.ip_address ?? '—'}</dd>
                  <dt className="text-muted-foreground">AI Model</dt><dd>{selected.ai_model_version ?? '—'}</dd>
                </dl>
                {selected.justification && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Justification</p>
                    <p className="bg-warning/10 border border-warning/30 rounded p-2 text-sm">{selected.justification}</p>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Before</p>
                    <pre className="bg-muted/50 p-2 rounded text-xs overflow-auto max-h-64">{JSON.stringify(selected.before_value ?? {}, null, 2)}</pre>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">After</p>
                    <pre className="bg-muted/50 p-2 rounded text-xs overflow-auto max-h-64">{JSON.stringify(selected.after_value ?? {}, null, 2)}</pre>
                  </div>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </DashboardLayout>
  );
}
