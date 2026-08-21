import { useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FpDuplicateCandidates } from '@/components/fit-and-proper/FpDuplicateCandidates';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { logFpAction } from '@/lib/fpAudit';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Search,
  Users,
  AlertTriangle,
  UserCheck,
  Layers,
  ExternalLink,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface IndividualRow {
  id: string;
  full_name: string;
  national_id: string | null;
  nationality: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  date_of_birth: string | null;
  passport_number: string | null;
  status: string | null;
  created_at: string;
  user_id: string | null;
  created_by: string | null;
  // regulator_id is a confirmed column on fp_individuals (present in types.ts / DB schema).
  // It links an individual to the regulator organisation that registered them.
  regulator_id: string | null;
  activeRoleCount: number;
}

interface FormState {
  full_name: string;
  national_id: string;
  nationality: string;
  date_of_birth: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  full_name: '',
  national_id: '',
  nationality: '',
  date_of_birth: '',
  email: '',
  phone: '',
  address: '',
  notes: '',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string | null) {
  switch (status) {
    case 'active':
      return (
        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
          Active
        </Badge>
      );
    case 'removed':
      return (
        <Badge className="bg-red-50 text-red-700 border-red-200 hover:bg-red-50">
          Removed
        </Badge>
      );
    default:
      return (
        <Badge className="bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100">
          {status ?? 'Inactive'}
        </Badge>
      );
  }
}

function roleBadge(count: number) {
  if (count > 1) {
    return (
      <Badge className="bg-red-50 text-red-700 border-red-200 hover:bg-red-50 gap-1">
        <Layers className="h-3 w-3" />
        Multi-Role
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-slate-500 gap-1">
      {count}
    </Badge>
  );
}

// ── Stats Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`rounded-lg p-2.5 ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            {label}
          </p>
          <p className="text-2xl font-semibold tabular-nums leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FpaIndividuals() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [dupWarning, setDupWarning] = useState<{
    name: string;
    national_id: string | null;
    id: string;
  } | null>(null);
  const [dupChecking, setDupChecking] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────

  const {
    data: individuals,
    isLoading,
    isError: individualsError,
    error: individualsErrorDetail,
  } = useQuery({
    queryKey: ['fp_individuals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_individuals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const {
    data: roleCounts,
    isError: roleCountsError,
  } = useQuery({
    queryKey: ['fp_individual_roles_counts'],
    enabled: !!(individuals && individuals.length > 0),
    queryFn: async () => {
      const ids = (individuals ?? []).map((r: any) => r.id as string);
      if (!ids.length) return {};
      const { data, error } = await supabase
        .from('fp_individual_roles')
        .select('individual_id')
        .in('individual_id', ids)
        .eq('is_current', true);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        const key = (row as any).individual_id as string;
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return counts;
    },
  });

  // Merge role counts into individuals
  const merged: IndividualRow[] = (individuals ?? []).map((ind: any) => ({
    ...ind,
    activeRoleCount: roleCounts ? (roleCounts[ind.id] ?? 0) : 0,
  }));

  // Filtered by search
  const filtered = merged.filter((ind) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      ind.full_name?.toLowerCase().includes(q) ||
      ind.national_id?.toLowerCase().includes(q) ||
      ind.email?.toLowerCase().includes(q) ||
      ind.nationality?.toLowerCase().includes(q)
    );
  });

  // Stats
  const totalCount = merged.length;
  const activeCount = merged.filter((i) => i.status === 'active').length;
  const multiRoleCount = merged.filter((i) => i.activeRoleCount > 1).length;

  // ── Deduplication check ──────────────────────────────────────────────────

  const checkDuplicate = useCallback(async (name: string) => {
    if (!name.trim() || name.trim().length < 3) {
      setDupWarning(null);
      return;
    }
    setDupChecking(true);
    try {
      const { data } = await supabase
        .from('fp_individuals')
        .select('id, full_name, national_id')
        .ilike('full_name', `%${name.trim()}%`)
        .limit(1);
      if (data && data.length > 0) {
        const found = data[0] as any;
        setDupWarning({
          name: found.full_name,
          national_id: found.national_id,
          id: found.id,
        });
      } else {
        setDupWarning(null);
      }
    } catch {
      setDupWarning(null);
    } finally {
      setDupChecking(false);
    }
  }, []);

  const handleNameChange = (value: string) => {
    setForm((f) => ({ ...f, full_name: value }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => checkDuplicate(value), 600);
  };

  // ── Insert mutation ──────────────────────────────────────────────────────

  // EPR-04 M2: the subject register is written only by
  // `fp_individual_create`, which owns the duplicate rule, the initial status
  // and the audit entry. Direct inserts are revoked.
  const addIndividual = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim()) throw new Error('Full name is required.');
      await fpIndividualCreate({
        full_name: form.full_name.trim(),
        national_id: form.national_id.trim() || null,
        nationality: form.nationality.trim() || null,
        date_of_birth: form.date_of_birth || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success('Individual registered successfully.');
      qc.invalidateQueries({ queryKey: ['fp_individuals'] });
      qc.invalidateQueries({ queryKey: ['fp_individual_roles_counts'] });
      setOpen(false);
      setForm(EMPTY_FORM);
      setDupWarning(null);
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Failed to register individual.');
    },
  });

  const handleDialogOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setForm(EMPTY_FORM);
      setDupWarning(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          title="Individual Register"
          description="Register and manage regulated individuals — FPA-002"
          actions={
            <Dialog open={open} onOpenChange={handleDialogOpenChange}>
              <DialogTrigger asChild>
                <Button data-rbac="fit_and_proper.create">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Individual
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Register New Individual</DialogTitle>
                </DialogHeader>

                {/* Deduplication warning */}
                {dupWarning && (
                  <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-500" />
                    <div>
                      <span className="font-medium">Possible duplicate: </span>
                      &ldquo;{dupWarning.name}&rdquo; is already registered
                      {dupWarning.national_id
                        ? ` (ID: ${dupWarning.national_id})`
                        : ''}
                      .{' '}
                      <Link
                        to={`/fpa/individuals/${dupWarning.id}`}
                        className="underline font-medium"
                        onClick={() => setOpen(false)}
                      >
                        Open existing profile instead?
                      </Link>
                    </div>
                  </div>
                )}

                {dupChecking && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Checking for duplicates…
                  </p>
                )}

                {/* Phase 3A — ranked soft duplicate candidates (name + DOB + identifier) */}
                <FpDuplicateCandidates
                  fullName={form.full_name}
                  dateOfBirth={form.date_of_birth || null}
                  nationalId={form.national_id || null}
                  onOpenExisting={() => setOpen(false)}
                />


                <div className="space-y-4 py-1">
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <Label>
                        Full Name <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        value={form.full_name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        placeholder="e.g. Jane Adisa Okonkwo"
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>National ID</Label>
                      <Input
                        value={form.national_id}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, national_id: e.target.value }))
                        }
                        placeholder="e.g. A1234567"
                      />
                    </div>
                    <div>
                      <Label>Nationality</Label>
                      <Input
                        value={form.nationality}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, nationality: e.target.value }))
                        }
                        placeholder="e.g. Nigerian"
                      />
                    </div>
                    <div>
                      <Label>Date of Birth</Label>
                      <Input
                        type="date"
                        value={form.date_of_birth}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, date_of_birth: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, email: e.target.value }))
                        }
                        placeholder="jane@example.com"
                      />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input
                        value={form.phone}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, phone: e.target.value }))
                        }
                        placeholder="+234 800 000 0000"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Address</Label>
                    <Textarea
                      rows={2}
                      value={form.address}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, address: e.target.value }))
                      }
                      placeholder="Registered address"
                    />
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Textarea
                      rows={2}
                      value={form.notes}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, notes: e.target.value }))
                      }
                      placeholder="Internal notes (not shown to applicant)"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button data-rbac="fit_and_proper.edit"
                    onClick={() => addIndividual.mutate()}
                    disabled={addIndividual.isPending || !form.full_name.trim()}
                  >
                    {addIndividual.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Register Individual
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            icon={Users}
            label="Total Registered"
            value={totalCount}
            accent="bg-blue-50 text-blue-600"
          />
          <StatCard
            icon={UserCheck}
            label="Active"
            value={activeCount}
            accent="bg-emerald-50 text-emerald-600"
          />
          <StatCard
            icon={Layers}
            label="Multi-Role"
            value={multiRoleCount}
            accent="bg-red-50 text-red-600"
          />
        </div>

        {/* Search + Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base">Registered Individuals</CardTitle>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search by name, ID, email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading individuals…</span>
              </div>
            ) : individualsError ? (
              <div className="flex items-center gap-3 rounded-md border border-red-200 bg-red-50 m-4 p-4 text-sm text-red-800">
                <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-500" />
                <div>
                  <p className="font-medium">Failed to load individuals</p>
                  <p className="text-xs mt-0.5 text-red-700">
                    {(individualsErrorDetail as any)?.message ||
                      'An unexpected error occurred. Please refresh the page or contact support.'}
                  </p>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                {search
                  ? 'No individuals match your search.'
                  : 'No individuals registered yet. Use "Add Individual" to begin.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>National ID</TableHead>
                      <TableHead>Nationality</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-center">Active Roles</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((ind) => (
                      <TableRow key={ind.id}>
                        <TableCell>
                          <Link
                            to={`/fpa/individuals/${ind.id}`}
                            className="font-medium text-foreground hover:text-primary hover:underline"
                          >
                            {ind.full_name}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {ind.national_id ?? <span className="italic">—</span>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {ind.nationality ?? <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {ind.email ?? <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {roleCountsError ? (
                            <Badge
                              variant="outline"
                              className="gap-1 border-amber-300 text-amber-700 bg-amber-50"
                              title="Role data could not be loaded — count may be inaccurate"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              ?
                            </Badge>
                          ) : roleCounts === undefined ? (
                            <Loader2 className="h-3 w-3 animate-spin inline text-muted-foreground" />
                          ) : (
                            roleBadge(ind.activeRoleCount)
                          )}
                        </TableCell>
                        <TableCell>{statusBadge(ind.status)}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5"
                            asChild
                          >
                            <Link to={`/fpa/individuals/${ind.id}`}>
                              <ExternalLink className="h-3.5 w-3.5" />
                              Open
                            </Link>
                          </Button>
                        </TableCell>
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
