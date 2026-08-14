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
import { Eye, Loader2, Users, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getApplicationCategory } from '@/lib/applicationCategory';
import { useWorkflowTotalSla } from '@/hooks/useWorkflowTotalSla';
import { TotalSlaBadge } from '@/components/workflows/TotalSlaBadge';




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
  priority_set_by: string | null;
  priority_set_at: string | null;
  assigned_to: string | null;
  data?: any;
}

const WAITING_APPLICANT_STATUSES = new Set([
  'query_raised',
  'resubmission_requested',
  'info_requested',
  'returned_for_correction',
  'awaiting_applicant',
]);

const ON_HOLD_CLASS = 'bg-amber-100 text-amber-800 border-amber-200';

interface ActionPriority {
  effective: 1 | 2 | 3 | 4 | 5;
  label: 'Critical' | 'High' | 'Normal' | 'Low' | 'Deferred' | 'On Hold';
  reason: string;
  isManualOverride: boolean;
  isOnHold: boolean;
  badgeClass: string;
  sortKey: number; // Critical=0, High=1, Normal=2, On Hold=2.5, Low=3, Deferred=4
}

function pluralDays(n: number) {
  return `${n} day${n === 1 ? '' : 's'}`;
}

function getEffectiveActionPriority(row: QueueRow): ActionPriority {
  const iso = row.submitted_at || row.created_at;
  const age = iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : null;

  // Manual override: explicit signals only. DB default is 3 with no set_by/at,
  // so we require priority_set_at OR an explicit reason to treat as manual.
  const hasManualSignal =
    !!row.priority_set_at ||
    (row.priority_reason?.trim().length ?? 0) > 0 ||
    (!!row.priority_set_by && row.priority !== 3);

  if (hasManualSignal) {
    const meta = PRIORITY_META[row.priority] || PRIORITY_META[3];
    const sortKey = row.priority === 5 ? 4 : row.priority === 4 ? 3 : row.priority === 3 ? 2 : row.priority === 2 ? 1 : 0;
    return {
      effective: (row.priority as 1 | 2 | 3 | 4 | 5) || 3,
      label: meta.label as ActionPriority['label'],
      reason: row.priority_reason?.trim() || 'Manually set by officer',
      isManualOverride: true,
      isOnHold: false,
      badgeClass: meta.className,
      sortKey,
    };
  }

  // Waiting on applicant → On Hold
  if (WAITING_APPLICANT_STATUSES.has(row.status)) {
    return {
      effective: 3,
      label: 'On Hold',
      reason: 'Waiting for applicant response',
      isManualOverride: false,
      isOnHold: true,
      badgeClass: ON_HOLD_CLASS,
      sortKey: 2.5,
    };
  }

  // SLA-driven suggestion
  if (age == null) {
    return {
      effective: 3,
      label: 'Normal',
      reason: 'No submission date',
      isManualOverride: false,
      isOnHold: false,
      badgeClass: PRIORITY_META[3].className,
      sortKey: 2,
    };
  }
  const remaining = SLA_TARGET_DAYS - age;
  if (remaining < 0) {
    return {
      effective: 1,
      label: 'Critical',
      reason: `SLA breached by ${pluralDays(-remaining)}`,
      isManualOverride: false,
      isOnHold: false,
      badgeClass: PRIORITY_META[1].className,
      sortKey: 0,
    };
  }
  if (remaining <= 3) {
    return {
      effective: 2,
      label: 'High',
      reason: remaining === 0 ? 'Due today' : `Due in ${pluralDays(remaining)}`,
      isManualOverride: false,
      isOnHold: false,
      badgeClass: PRIORITY_META[2].className,
      sortKey: 1,
    };
  }
  return {
    effective: 3,
    label: 'Normal',
    reason: `${pluralDays(remaining)} remaining`,
    isManualOverride: false,
    isOnHold: false,
    badgeClass: PRIORITY_META[3].className,
    sortKey: 2,
  };
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

import { formatDateTime } from '@/lib/datetime';

export default function ApplicationQueue() {
  const { user } = useAuth();
  const { activeSectorId, availableSectors } = useActiveSector();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('submitted_desc');

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [users, setUsers] = useState<Record<string, InternalUser>>({});
  const [applicants, setApplicants] = useState<Record<string, ApplicantInfo>>({});
  const [licenseeNames, setLicenseeNames] = useState<Record<string, string>>({});
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
          'id, application_number, applicant_id, license_type, status, submitted_at, created_at, priority, priority_reason, priority_set_by, priority_set_at, assigned_to, data',
        )
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
          supabase.from('pre_license_users').select('id, full_name, email, entity_name').in('id', applicantIds),
        ]);
        const map: Record<string, ApplicantInfo> = {};
        (profs || []).forEach((p: any) => { map[p.id] = { name: p.full_name || p.email || 'Unknown' }; });
        (pre || []).forEach((p: any) => {
          if (!map[p.id]) map[p.id] = { name: p.full_name || p.email || 'Unknown', org: p.entity_name || null };
        });
        setApplicants(map);
      }

      // Organisation for applications filed against an existing licensee record.
      const licenseeIds = Array.from(
        new Set(list.map((r) => (r.data as any)?.licensee_id).filter(Boolean) as string[]),
      );
      if (licenseeIds.length) {
        const { data: lics } = await supabase.from('licensees').select('id, name').in('id', licenseeIds);
        const lmap: Record<string, string> = {};
        (lics || []).forEach((l: any) => { if (l.name) lmap[l.id] = l.name; });
        if (!cancelled) setLicenseeNames(lmap);
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
    const q = search.trim().toLowerCase();
    const base = !q
      ? rows
      : rows.filter((r) => {
          const cat = getApplicationCategory(r.data) === 'post_license' ? 'post' : 'pre';
          return (
            r.application_number?.toLowerCase().includes(q) ||
            (applicants[r.applicant_id] || '').toLowerCase().includes(q) ||
            r.license_type?.toLowerCase().includes(q) ||
            formatLicenseType(r.license_type).toLowerCase().includes(q) ||
            cat.includes(q)
          );
        });
    // Default: preserve DB order (newest submitted first). User may pick a sort.
    const sorted = [...base];
    switch (sortBy) {
      case 'submitted_asc':
        sorted.sort((a, b) => {
          const ta = a.submitted_at ? new Date(a.submitted_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
          const tb = b.submitted_at ? new Date(b.submitted_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
          return ta - tb;
        });
        break;
      case 'submitted_desc':
        sorted.sort((a, b) => {
          const ta = a.submitted_at ? new Date(a.submitted_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
          const tb = b.submitted_at ? new Date(b.submitted_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
          return tb - ta;
        });
        break;
      case 'app_number':
        sorted.sort((a, b) => (a.application_number || '').localeCompare(b.application_number || ''));
        break;
      case 'applicant':
        sorted.sort((a, b) => (applicants[a.applicant_id] || '').localeCompare(applicants[b.applicant_id] || ''));
        break;
      case 'sla_age':
        sorted.sort((a, b) => {
          const ageA = daysSince(a.submitted_at || a.created_at) ?? -1;
          const ageB = daysSince(b.submitted_at || b.created_at) ?? -1;
          return ageB - ageA;
        });
        break;
      case 'action_priority':
        sorted.sort((a, b) => {
          const pa = getEffectiveActionPriority(a);
          const pb = getEffectiveActionPriority(b);
          return pa.sortKey - pb.sortKey;
        });
        break;
    }
    return sorted;
  }, [rows, search, applicants, sortBy]);

  const visibleIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const { byEntityId: totalSlaByApp } = useWorkflowTotalSla({
    entityType: 'application',
    entityIds: visibleIds,
  });



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
                  <SelectItem value="pending">Pending</SelectItem>
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
                  <SelectItem value="active">Active sector</SelectItem>
                  <SelectItem value="all">All sectors</SelectItem>
                  {availableSectors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Sort by" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="submitted_desc">Sort: Newest submitted</SelectItem>
                  <SelectItem value="submitted_asc">Sort: Oldest submitted</SelectItem>
                  <SelectItem value="app_number">Sort: Application # (A→Z)</SelectItem>
                  <SelectItem value="applicant">Sort: Applicant (A→Z)</SelectItem>
                  <SelectItem value="sla_age">Sort: SLA age (oldest first)</SelectItem>
                  <SelectItem value="action_priority">Sort: Action Priority</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              {canManage && (
                <Button data-rbac="application_management.edit"
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
                  <TableHead className="w-40">Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Total SLA</TableHead>

                  <TableHead className="w-56">
                    <TooltipProvider delayDuration={200}>
                      <span className="inline-flex items-center gap-1">
                        Action Priority
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" aria-label="About Action Priority" className="text-muted-foreground hover:text-foreground">
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs">
                            Action Priority is suggested from SLA and case status. Officers may override it manually.
                          </TooltipContent>
                        </Tooltip>
                      </span>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead className="w-56">Assignee</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={12} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No pending applications.</TableCell></TableRow>

                ) : (
                  filtered.map((r) => {
                    const age = daysSince(r.submitted_at || r.created_at);
                    const ap = getEffectiveActionPriority(r);
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
                        <TableCell className="text-xs whitespace-nowrap">
                          {r.submitted_at ? (
                            <span>{formatDateTime(r.submitted_at)}</span>
                          ) : (
                            <span className="text-muted-foreground">{formatDateTime(r.created_at)} <span className="italic">(created)</span></span>
                          )}
                        </TableCell>
                        <TableCell><Badge variant="secondary">{r.status.replace(/_/g, ' ')}</Badge></TableCell>
                        <TableCell>{slaChip(age)}</TableCell>
                        <TableCell><TotalSlaBadge entry={totalSlaByApp.get(r.id)} /></TableCell>

                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge className={ap.badgeClass}>{ap.label}</Badge>
                              {ap.isManualOverride && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">Manual</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground leading-tight">
                              {ap.reason}
                            </div>
                            {canManage && (
                              <Select
                                value={String(r.priority)}
                                onValueChange={(v) => updateRow(r.id, { priority: Number(v) })}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue placeholder="Change" />
                                </SelectTrigger>
                                <SelectContent>
                                  {[1, 2, 3, 4, 5].map((p) => (
                                    <SelectItem key={p} value={String(p)}>
                                      {PRIORITY_META[p].label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
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
                    <SelectItem key={p} value={String(p)}>{PRIORITY_META[p].label}</SelectItem>
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
