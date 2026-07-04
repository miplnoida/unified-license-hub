import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveSector } from '@/contexts/ActiveSectorContext';
import { INTERNAL_ROLES } from '@/types/platform';
import { toast } from 'sonner';
import { Eye, Loader2, Users, Flag } from 'lucide-react';
import { getApplicationCategory } from '@/lib/applicationCategory';


/**
 * Phase 2.3 — Application Triage Queue (ULRA-004)
 *
 * Additive view alongside the existing ApplicationsList. Focused on
 * reviewer triage: SLA age, priority, assignee, and bulk assignment.
 * Does not replace or modify the main listing.
 */

const PENDING_STATUSES = [
  'submitted',
  'in_progress',
  'resubmission_requested',
  'query_raised',
];

const PRIORITY_META: Record<number, { label: string; className: string }> = {
  1: { label: 'Critical', className: 'bg-red-100 text-red-800 border-red-200' },
  2: { label: 'High', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  3: { label: 'Normal', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  4: { label: 'Low', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  5: { label: 'Deferred', className: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const SLA_TARGET_DAYS = 15; // fallback target; workflow-specific SLA still shown elsewhere

function formatLicenseType(raw?: string | null): string {
  if (!raw) return '—';
  const parts = raw.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
  const dedup: string[] = [];
  for (const p of parts) {
    if (dedup[dedup.length - 1]?.toLowerCase() !== p.toLowerCase()) dedup.push(p);
  }
  return dedup.join(' - ') || raw;
}

interface QueueRow {
  id: string;
  application_number: string;
  applicant_id: string;
  applicant_name?: string;
  license_type: string;
  status: string;
  submitted_at: string | null;
  created_at: string;
  priority: number;
  priority_reason: string | null;
  assigned_to: string | null;
  data?: any;
}


interface InternalUser {
  id: string;
  full_name: string | null;
  email: string | null;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function slaChip(age: number | null) {
  if (age == null) return <Badge variant="outline">—</Badge>;
  const remaining = SLA_TARGET_DAYS - age;
  if (remaining < 0)
    return <Badge className="bg-red-100 text-red-800 border-red-200">Breached · {age}d</Badge>;
  if (remaining <= 3)
    return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Due in {remaining}d</Badge>;
  return <Badge className="bg-green-100 text-green-800 border-green-200">{age}d / {SLA_TARGET_DAYS}d</Badge>;
}

export default function ApplicationQueue() {
  const { user } = useAuth();
  const { activeSectorId, availableSectors } = useActiveSector();
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [sectorFilter, setSectorFilter] = useState<string>('active');

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [users, setUsers] = useState<Record<string, InternalUser>>({});
  const [applicants, setApplicants] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPriority, setBulkPriority] = useState<string>('none');
  const [bulkAssignee, setBulkAssignee] = useState<string>('none');
  const [bulkReason, setBulkReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const canManage = !!user && INTERNAL_ROLES.includes(user.role as any);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      let q = supabase
        .from('applications')
        .select(
          'id, application_number, applicant_id, license_type, status, submitted_at, created_at, priority, priority_reason, assigned_to, data',
        )
        .order('priority', { ascending: true })
        .order('submitted_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(500);

      // Status filter
      if (statusFilter === 'pending') {
        q = q.in('status', PENDING_STATUSES);
      } else if (statusFilter !== 'all') {
        q = q.eq('status', statusFilter);
      }

      // Sector filter — applications don't carry a sector column directly,
      // filter via the JSONB `data.sector_id` / `data.resolved_sector_id` fields.
      const sectorIdToFilter =
        sectorFilter === 'active' ? activeSectorId : sectorFilter === 'all' ? null : sectorFilter;
      if (sectorIdToFilter) {
        q = q.or(
          `data->>sector_id.eq.${sectorIdToFilter},data->>resolved_sector_id.eq.${sectorIdToFilter}`,
        );
      }

      const { data, error } = await q;

      if (cancelled) return;
      if (error) {
        toast.error(error.message || 'Failed to load queue');
        setRows([]);
        setLoading(false);
        return;
      }
      const list = (data as any[]) || [];
      setRows(list);

      const applicantIds = Array.from(new Set(list.map((r) => r.applicant_id).filter(Boolean)));
      if (applicantIds.length) {
        const [{ data: profs }, { data: pre }] = await Promise.all([
          supabase.from('profiles').select('id, full_name, email').in('id', applicantIds),
          supabase.from('pre_license_users').select('id, full_name, email').in('id', applicantIds),
        ]);
        const map: Record<string, string> = {};
        (profs || []).forEach((p: any) => { map[p.id] = p.full_name || p.email || 'Unknown'; });
        (pre || []).forEach((p: any) => { if (!map[p.id]) map[p.id] = p.full_name || p.email || 'Unknown'; });
        setApplicants(map);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [activeSectorId, refreshTick, statusFilter, sectorFilter]);

  // Load internal users once for assignee dropdown
  useEffect(() => {
    async function loadUsers() {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .in('role', INTERNAL_ROLES as string[])
        .limit(500);
      const map: Record<string, InternalUser> = {};
      (data as any[] | null)?.forEach((u) => {
        map[u.id] = { id: u.id, full_name: u.full_name, email: u.email };
      });
      setUsers(map);
    }
    loadUsers();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const cat = getApplicationCategory(r.data) === 'post_license' ? 'post' : 'pre';
      return (
        r.application_number?.toLowerCase().includes(q) ||
        (applicants[r.applicant_id] || '').toLowerCase().includes(q) ||
        r.license_type?.toLowerCase().includes(q) ||
        cat.includes(q)
      );
    });
  }, [rows, search, applicants]);


  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.id))));
  };

  const updateRow = async (id: string, patch: Record<string, any>) => {
    if (patch.priority !== undefined) {
      patch.priority_set_by = user?.id;
      patch.priority_set_at = new Date().toISOString();
    }
    if (patch.assigned_to !== undefined) {
      patch.assigned_by = user?.id;
      patch.assigned_at = new Date().toISOString();
    }
    const { error } = await supabase.from('applications').update(patch).eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    toast.success('Updated');
  };

  const applyBulk = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const patch: Record<string, any> = {};
      if (bulkPriority !== 'none') {
        patch.priority = Number(bulkPriority);
        patch.priority_reason = bulkReason || null;
        patch.priority_set_by = user?.id;
        patch.priority_set_at = new Date().toISOString();
      }
      if (bulkAssignee !== 'none') {
        patch.assigned_to = bulkAssignee;
        patch.assigned_by = user?.id;
        patch.assigned_at = new Date().toISOString();
      }
      if (Object.keys(patch).length === 0) {
        toast.error('Choose a priority or an assignee');
        setSaving(false);
        return;
      }
      const ids = Array.from(selected);
      const { error } = await supabase.from('applications').update(patch).in('id', ids);
      if (error) throw error;
      toast.success(`Updated ${ids.length} application${ids.length === 1 ? '' : 's'}`);
      setBulkOpen(false);
      setBulkPriority('none');
      setBulkAssignee('none');
      setBulkReason('');
      setSelected(new Set());
      setRefreshTick((t) => t + 1);
    } catch (e: any) {
      toast.error(e.message || 'Bulk update failed');
    } finally {
      setSaving(false);
    }
  };

  const breachedCount = rows.filter((r) => {
    const age = daysSince(r.submitted_at || r.created_at);
    return age != null && age > SLA_TARGET_DAYS;
  }).length;
  const dueSoonCount = rows.filter((r) => {
    const age = daysSince(r.submitted_at || r.created_at);
    return age != null && SLA_TARGET_DAYS - age >= 0 && SLA_TARGET_DAYS - age <= 3;
  }).length;
  const unassignedCount = rows.filter((r) => !r.assigned_to).length;

  return (
    <DashboardLayout>
      <PageHeader
        title="Application Queue"
        description="Triage view: sort by SLA age and priority, assign reviewers in bulk."
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Pending</div><div className="text-2xl font-semibold">{rows.length}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">SLA Breached</div><div className="text-2xl font-semibold text-red-600">{breachedCount}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Due Soon (≤3d)</div><div className="text-2xl font-semibold text-orange-600">{dueSoonCount}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Unassigned</div><div className="text-2xl font-semibold">{unassignedCount}</div></CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="Search app #, applicant, license type"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending (default)</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="resubmission_requested">Resubmission requested</SelectItem>
                  <SelectItem value="query_raised">Query raised</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="withdrawn">Withdrawn</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="all">All statuses</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sectorFilter} onValueChange={setSectorFilter}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active sector (default)</SelectItem>
                  <SelectItem value="all">All sectors</SelectItem>
                  {availableSectors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              {canManage && (
                <Button
                  onClick={() => setBulkOpen(true)}
                  disabled={selected.size === 0}
                  variant="default"
                >
                  <Users className="mr-2 h-4 w-4" />
                  Bulk update ({selected.size})
                </Button>
              )}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Showing {filtered.length} of up to 500 · Status: {statusFilter === 'pending' ? 'Pending' : statusFilter === 'all' ? 'All' : statusFilter.replace(/_/g, ' ')} · Sector: {sectorFilter === 'active' ? (activeSectorId ? (availableSectors.find((s) => s.id === activeSectorId)?.name || 'Active') : 'None') : sectorFilter === 'all' ? 'All' : (availableSectors.find((s) => s.id === sectorFilter)?.name || sectorFilter)}
          </div>


          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {canManage && (
                    <TableHead className="w-8">
                      <Checkbox
                        checked={filtered.length > 0 && selected.size === filtered.length}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                  )}
                  <TableHead>App #</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-24">Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead className="w-40">Priority</TableHead>
                  <TableHead className="w-56">Assignee</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No pending applications.</TableCell></TableRow>

                ) : (
                  filtered.map((r) => {
                    const age = daysSince(r.submitted_at || r.created_at);
                    const pm = PRIORITY_META[r.priority] || PRIORITY_META[3];
                    return (
                      <TableRow key={r.id} className={selected.has(r.id) ? 'bg-muted/40' : ''}>
                        {canManage && (
                          <TableCell>
                            <Checkbox
                              checked={selected.has(r.id)}
                              onCheckedChange={() => toggleRow(r.id)}
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-mono text-xs">
                          <Link to={`/applications/${r.id}`} className="text-primary hover:underline">
                            {r.application_number}
                          </Link>
                        </TableCell>
                        <TableCell>{applicants[r.applicant_id] || '—'}</TableCell>
                        <TableCell><Badge variant="outline">{formatLicenseType(r.license_type)}</Badge></TableCell>
                        <TableCell>
                          {getApplicationCategory(r.data) === 'post_license' ? (
                            <Badge variant="secondary">Post</Badge>
                          ) : (
                            <Badge variant="outline">Pre</Badge>
                          )}
                        </TableCell>

                        <TableCell><Badge variant="secondary">{r.status.replace(/_/g, ' ')}</Badge></TableCell>
                        <TableCell>{slaChip(age)}</TableCell>
                        <TableCell>
                          {canManage ? (
                            <Select
                              value={String(r.priority)}
                              onValueChange={(v) => updateRow(r.id, { priority: Number(v) })}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[1, 2, 3, 4, 5].map((p) => (
                                  <SelectItem key={p} value={String(p)}>
                                    <Flag className="inline h-3 w-3 mr-2" />
                                    {p} — {PRIORITY_META[p].label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge className={pm.className}>{pm.label}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {canManage ? (
                            <Select
                              value={r.assigned_to || 'none'}
                              onValueChange={(v) => updateRow(r.id, { assigned_to: v === 'none' ? null : v })}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue placeholder="Unassigned" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Unassigned</SelectItem>
                                {Object.values(users).map((u) => (
                                  <SelectItem key={u.id} value={u.id}>
                                    {u.full_name || u.email || u.id.slice(0, 8)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-sm">
                              {r.assigned_to ? users[r.assigned_to]?.full_name || users[r.assigned_to]?.email || '—' : 'Unassigned'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" asChild>
                            <Link to={`/applications/${r.id}`}><Eye className="h-4 w-4" /></Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk update {selected.size} application{selected.size === 1 ? '' : 's'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Priority</Label>
              <Select value={bulkPriority} onValueChange={setBulkPriority}>
                <SelectTrigger><SelectValue placeholder="No change" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No change</SelectItem>
                  {[1, 2, 3, 4, 5].map((p) => (
                    <SelectItem key={p} value={String(p)}>{p} — {PRIORITY_META[p].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason (audit)</Label>
              <Textarea
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                placeholder="Optional justification recorded on the timeline"
                rows={2}
              />
            </div>
            <div>
              <Label>Assignee</Label>
              <Select value={bulkAssignee} onValueChange={setBulkAssignee}>
                <SelectTrigger><SelectValue placeholder="No change" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No change</SelectItem>
                  {Object.values(users).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || u.email || u.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={applyBulk} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
