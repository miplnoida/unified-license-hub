import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Activity, Search, ExternalLink, Loader2 } from 'lucide-react';
import {
  getAuditDescriptor, AUDIT_CATEGORIES, CATEGORY_CLASSES, type AuditCategory,
} from '@/lib/auditLabels';

interface AuditLog {
  id: string;
  user_id: string | null;
  user_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: any;
  new_value: any;
  metadata: any;
  created_at: string;
  user_email?: string;
}

const PAGE_SIZE = 50;

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<AuditCategory | 'all'>('all');
  const [entityType, setEntityType] = useState<string>('all');
  const [user, setUser] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selected, setSelected] = useState<AuditLog | null>(null);

  async function fetchPage(offset: number, replace: boolean) {
    if (replace) setLoading(true); else setLoadingMore(true);
    let q = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (entityType !== 'all') q = q.eq('entity_type', entityType);
    if (fromDate) q = q.gte('created_at', fromDate);
    if (toDate) q = q.lte('created_at', new Date(new Date(toDate).getTime() + 86400000).toISOString());
    if (user !== 'all') q = q.eq('user_id', user);

    const { data, count } = await q;
    let next = (data as any[]) || [];

    // Resolve user emails
    const userIds = [...new Set(next.map((d) => d.user_id).filter(Boolean))] as string[];
    const emailMap: Record<string, string> = {};
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from('profiles').select('id, email, full_name').in('id', userIds);
      profiles?.forEach((p: any) => {
        emailMap[p.id] = p.full_name ? `${p.full_name} <${p.email}>` : p.email;
      });
    }
    next = next.map((d) => ({ ...d, user_email: d.user_id ? (emailMap[d.user_id] || d.user_id) : 'System' }));

    setTotal(count || 0);
    setLogs((prev) => (replace ? next : [...prev, ...next]));
    if (replace) setLoading(false); else setLoadingMore(false);
  }

  useEffect(() => {
    fetchPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, user, fromDate, toDate]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      const d = getAuditDescriptor(l.action);
      if (category !== 'all' && d.category !== category) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        if (
          !d.label.toLowerCase().includes(s) &&
          !l.action.toLowerCase().includes(s) &&
          !l.entity_type.toLowerCase().includes(s) &&
          !(l.user_email || '').toLowerCase().includes(s) &&
          !((l.metadata?.application_number || '') as string).toLowerCase().includes(s)
        ) return false;
      }
      return true;
    });
  }, [logs, category, search]);

  const ENTITY_TYPES = [
    'application', 'payment', 'document', 'workflow',
    'approval_workflow', 'license', 'user', 'profile', 'other',
  ];
  const users = useMemo(() => {
    const m = new Map<string, string>();
    logs.forEach((l) => { if (l.user_id) m.set(l.user_id, l.user_email || l.user_id); });
    return Array.from(m.entries()).map(([id, label]) => ({ id, label }));
  }, [logs]);

  function clearFilters() {
    setSearch(''); setCategory('all'); setEntityType('all');
    setUser('all'); setFromDate(''); setToDate('');
  }

  function renderEntityLink(l: AuditLog) {
    const appId = l.metadata?.application_id || (l.entity_type === 'application' ? l.entity_id : null);
    const appNumber = l.metadata?.application_number;
    if (appId) {
      return (
        <Link
          to={`/applications/${appId}`}
          onClick={(e) => e.stopPropagation()}
          className="text-primary hover:underline inline-flex items-center gap-1"
        >
          {appNumber || l.entity_type}
          <ExternalLink className="h-3 w-3" />
        </Link>
      );
    }
    return <span className="text-sm">{l.entity_type}{l.entity_id && <span className="text-muted-foreground ml-1">#{l.entity_id.slice(0, 8)}</span>}</span>;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Activity Logs
          </h1>
          <p className="text-muted-foreground">Searchable history of recorded platform actions.</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle>Activity Log ({filtered.length} of {total})</CardTitle>
              <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2 mt-4">
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search loaded results (action, user, app #)…" className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={category} onValueChange={(v) => setCategory(v as AuditCategory | 'all')}>
                <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {AUDIT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger><SelectValue placeholder="Entity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All entities</SelectItem>
                  {ENTITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} placeholder="From" />
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} placeholder="To" />
              <Select value={user} onValueChange={setUser}>
                <SelectTrigger className="lg:col-span-2"><SelectValue placeholder="Users in loaded results" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users (in loaded results)</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-44">Timestamp</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((log) => {
                      const d = getAuditDescriptor(log.action);
                      return (
                        <TableRow key={log.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelected(log)}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap font-mono">
                            {new Date(log.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={CATEGORY_CLASSES[d.category]}>{d.label}</Badge>
                          </TableCell>
                          <TableCell>{renderEntityLink(log)}</TableCell>
                          <TableCell className="text-sm">{log.user_email}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {log.user_role ? <Badge variant="secondary">{log.user_role}</Badge> : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm">View</Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                          No audit logs found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>

                {logs.length < total && (
                  <div className="flex justify-center mt-4">
                    <Button variant="outline" disabled={loadingMore} onClick={() => fetchPage(logs.length, false)}>
                      {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Load more ({total - logs.length} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (() => {
            const d = getAuditDescriptor(selected.action);
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Badge variant="outline" className={CATEGORY_CLASSES[d.category]}>{d.label}</Badge>
                  </SheetTitle>
                  <SheetDescription className="font-mono text-xs">{selected.action}</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4 text-sm">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-muted-foreground">Timestamp</div>
                    <div className="col-span-2">{new Date(selected.created_at).toLocaleString()}</div>
                    <div className="text-muted-foreground">Actor</div>
                    <div className="col-span-2">{selected.user_email || 'System'}</div>
                    <div className="text-muted-foreground">Role</div>
                    <div className="col-span-2">{selected.user_role || '—'}</div>
                    <div className="text-muted-foreground">Entity</div>
                    <div className="col-span-2">{renderEntityLink(selected)}</div>
                    {selected.metadata?.application_number && (
                      <>
                        <div className="text-muted-foreground">Application #</div>
                        <div className="col-span-2 font-mono">{selected.metadata.application_number}</div>
                      </>
                    )}
                    {selected.metadata?.amount && (
                      <>
                        <div className="text-muted-foreground">Amount</div>
                        <div className="col-span-2 font-mono">
                          {selected.metadata.amount} {selected.metadata.currency || ''}
                        </div>
                      </>
                    )}
                    {selected.metadata?.receipt_number && (
                      <>
                        <div className="text-muted-foreground">Receipt</div>
                        <div className="col-span-2 font-mono">{selected.metadata.receipt_number}</div>
                      </>
                    )}
                    {selected.metadata?.from_status && (
                      <>
                        <div className="text-muted-foreground">Status change</div>
                        <div className="col-span-2 font-mono">
                          {selected.metadata.from_status} → {selected.metadata.to_status}
                        </div>
                      </>
                    )}
                  </div>

                  {(selected.metadata?.comments || selected.metadata?.reason || selected.new_value?.comments) && (
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">Comments / Reason</div>
                      <p className="text-sm bg-muted/40 border border-border rounded p-2">
                        {String(selected.metadata?.comments || selected.metadata?.reason || selected.new_value?.comments)}
                      </p>
                    </div>
                  )}

                  <details className="group">
                    <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
                      Advanced details (raw JSON)
                    </summary>
                    <div className="space-y-3 mt-2">
                      {selected.metadata && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground mb-1">Metadata</div>
                          <pre className="bg-muted rounded p-3 text-xs overflow-x-auto">{JSON.stringify(selected.metadata, null, 2)}</pre>
                        </div>
                      )}
                      {selected.old_value && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground mb-1">Old value</div>
                          <pre className="bg-muted rounded p-3 text-xs overflow-x-auto">{JSON.stringify(selected.old_value, null, 2)}</pre>
                        </div>
                      )}
                      {selected.new_value && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground mb-1">New value</div>
                          <pre className="bg-muted rounded p-3 text-xs overflow-x-auto">{JSON.stringify(selected.new_value, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}
