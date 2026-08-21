import { useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { fpAssessmentInitiate } from '@/lib/fpGovernedOps';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { logComplianceAudit } from '@/lib/complianceAudit';
import { logFpAction } from '@/lib/fpAudit';
import { FpRegulatorPositionsPanel } from '@/components/fit-and-proper/FpRegulatorPositionsPanel';
import { FpConditionsPanel } from '@/components/fit-and-proper/FpConditionsPanel';
import { FpAppealsPanel } from '@/components/fit-and-proper/FpAppealsPanel';
import { FpMonitoringPanel } from '@/components/fit-and-proper/FpMonitoringPanel';
import { RequestDeclarationDialog } from '@/components/fit-and-proper/RequestDeclarationDialog';
import { SubmittedDeclarationView } from '@/components/fit-and-proper/SubmittedDeclarationView';
import { canRequestDeclaration } from '@/lib/fpaAssessmentStatus';
import {
  Loader2,
  Pencil,
  Plus,
  ShieldAlert,
  ExternalLink,
  AlertTriangle,
  ClipboardList,
  PlayCircle,
  Save,
  Send,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function capitalize(s: string): string {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const INDIVIDUAL_STATUS_CLASS: Record<string, string> = {
  active: 'bg-green-100 text-green-800 border-green-200',
  inactive: 'bg-slate-100 text-slate-600 border-slate-200',
  suspended: 'bg-amber-100 text-amber-800 border-amber-200',
  revoked: 'bg-red-100 text-red-800 border-red-200',
};

const ASSESSMENT_STATUS_CLASS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-blue-100 text-blue-800',
  screening: 'bg-amber-100 text-amber-800',
  awaiting_committee: 'bg-purple-100 text-purple-800',
  determined: 'bg-green-100 text-green-800',
  closed: 'bg-slate-100 text-slate-700',
};

const ASSESSMENT_TYPES = [
  'initial',
  'renewal',
  'change_of_role',
  'triggered',
  'ongoing_monitoring',
  'cycle',
  'material_change',
  'adverse_event',
] as const;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm text-foreground">{value || <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: Profile
// ---------------------------------------------------------------------------

function ProfileTab({ individual, id }: { individual: any; id: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const openEdit = () => {
    setForm({
      full_name: individual.full_name ?? '',
      national_id: individual.national_id ?? '',
      passport_number: individual.passport_number ?? '',
      nationality: individual.nationality ?? '',
      date_of_birth: individual.date_of_birth ?? '',
      email: individual.email ?? '',
      phone: individual.phone ?? '',
      address: individual.address ?? '',
      status: individual.status ?? '',
      notes: individual.notes ?? '',
    });
    setOpen(true);
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('fp_individuals')
        .update({
          full_name: form.full_name.trim() || null,
          national_id: form.national_id.trim() || null,
          passport_number: form.passport_number.trim() || null,
          nationality: form.nationality.trim() || null,
          date_of_birth: form.date_of_birth || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          status: form.status || null,
          notes: form.notes.trim() || null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Profile updated');
      qc.invalidateQueries({ queryKey: ['fp_individual', id] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || 'Update failed'),
  });

  const statusClass =
    INDIVIDUAL_STATUS_CLASS[individual.status] ?? 'bg-slate-100 text-slate-600 border-slate-200';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Personal Details</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-rbac="fit_and_proper.edit" size="sm" variant="outline" onClick={openEdit}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Subject Profile</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-2">
                <div className="col-span-2">
                  <Label>Full Name</Label>
                  <Input
                    value={form.full_name ?? ''}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>National ID</Label>
                  <Input
                    value={form.national_id ?? ''}
                    onChange={(e) => setForm({ ...form, national_id: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Passport Number</Label>
                  <Input
                    value={form.passport_number ?? ''}
                    onChange={(e) => setForm({ ...form, passport_number: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Nationality</Label>
                  <Input
                    value={form.nationality ?? ''}
                    onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Date of Birth</Label>
                  <Input
                    type="date"
                    value={form.date_of_birth ?? ''}
                    onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email ?? ''}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={form.phone ?? ''}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Address</Label>
                  <Textarea
                    rows={2}
                    value={form.address ?? ''}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={form.status ?? ''}
                    onValueChange={(v) => setForm({ ...form, status: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="revoked">Revoked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Notes</Label>
                  <Textarea
                    rows={3}
                    value={form.notes ?? ''}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button data-rbac="fit_and_proper.edit"
                  onClick={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Save changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-5">
            <DetailField label="Full Name" value={individual.full_name} />
            <DetailField label="National ID" value={individual.national_id} />
            <DetailField label="Passport Number" value={individual.passport_number} />
            <DetailField label="Nationality" value={individual.nationality} />
            <DetailField label="Date of Birth" value={fmtDate(individual.date_of_birth)} />
            <DetailField label="Email" value={individual.email} />
            <DetailField label="Phone" value={individual.phone} />
            <DetailField
              label="Status"
              value={
                individual.status ? (
                  <Badge
                    variant="outline"
                    className={`text-xs font-medium ${statusClass}`}
                  >
                    {capitalize(individual.status)}
                  </Badge>
                ) : null
              }
            />
            <div className="col-span-2 md:col-span-3">
              <DetailField label="Address" value={individual.address} />
            </div>
          </div>
          {individual.notes && (
            <>
              <Separator className="my-5" />
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Notes
                </p>
                <p className="text-sm text-foreground whitespace-pre-line">{individual.notes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Roles
// ---------------------------------------------------------------------------

function RolesTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [roleType, setRoleType] = useState('');
  const [licenseeId, setLicenseeId] = useState('');
  const [isCurrent, setIsCurrent] = useState(true);
  const [reassessmentCycleMonths, setReassessmentCycleMonths] = useState('');
  const [cycleEdits, setCycleEdits] = useState<Record<string, string>>({});
  const [runningCycle, setRunningCycle] = useState(false);

  async function runCycleNow() {
    setRunningCycle(true);
    try {
      const { data, error } = await supabase.functions.invoke('fp-cycle-scheduler', { body: {} });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Scheduler failed');
      toast.success(`Cycle scheduler ran — opened ${data.opened}, evaluated ${data.evaluated}, due ${data.due}`);
      qc.invalidateQueries({ queryKey: ['fp_individual_roles', id] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to run cycle scheduler');
    } finally {
      setRunningCycle(false);
    }
  }

  async function saveCycle(roleId: string) {
    const raw = cycleEdits[roleId];
    const months = raw === '' || raw == null ? null : Number(raw);
    if (months != null && (!Number.isFinite(months) || months <= 0 || months > 120)) {
      toast.error('Cycle must be 1-120 months');
      return;
    }
    const patch: Record<string, unknown> = { reassessment_cycle_months: months };
    if (months != null) {
      const next = new Date();
      next.setMonth(next.getMonth() + months);
      patch.next_reassessment_due = next.toISOString().slice(0, 10);
    } else {
      patch.next_reassessment_due = null;
    }
    const { error } = await supabase.from('fp_individual_roles').update(patch).eq('id', roleId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Reassessment cycle updated');
    setCycleEdits((s) => { const c = { ...s }; delete c[roleId]; return c; });
    qc.invalidateQueries({ queryKey: ['fp_individual_roles', id] });
  }

  const { data: licensees = [], isLoading: licenseesLoading } = useQuery({
    queryKey: ['licensees-for-role-select'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('licensees')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: roles, isLoading } = useQuery({
    queryKey: ['fp_individual_roles', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_individual_roles')
        .select('*, licensees(name)')
        .eq('individual_id', id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const addRole = useMutation({
    mutationFn: async () => {
      if (!roleType.trim()) throw new Error('Role type is required');
      const months = reassessmentCycleMonths ? Number(reassessmentCycleMonths) : null;
      if (months != null && (!Number.isFinite(months) || months <= 0 || months > 120)) {
        throw new Error('Reassessment cycle must be 1-120 months');
      }
      const nextDue = months
        ? (() => { const d = new Date(); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10); })()
        : null;
      const payload = {
        individual_id: id,
        role_type: roleType.trim(),
        licensee_id: licenseeId || null,
        is_current: isCurrent,
        reassessment_cycle_months: months,
        next_reassessment_due: nextDue,
        created_by: user?.id ?? null,
      };
      const { data, error } = await supabase.from('fp_individual_roles').insert(payload).select('id').single();
      if (error) throw error;
      await logFpAction('fp.role.added', 'fp_individual_role', data.id, {
        after: payload,
        context: { individualId: id },
      });
    },
    onSuccess: () => {
      toast.success('Role added');
      qc.invalidateQueries({ queryKey: ['fp_individual_roles', id] });
      setOpen(false);
      setRoleType('');
      setLicenseeId('');
      setReassessmentCycleMonths('');
      setIsCurrent(true);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to add role'),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Roles &amp; Positions</CardTitle>
        <div className="flex gap-2">
          <Button data-rbac="fit_and_proper.edit" size="sm" variant="outline" onClick={runCycleNow} disabled={runningCycle}>
            {runningCycle ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5 mr-1.5" />}
            Run Cycle Scheduler
          </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-rbac="fit_and_proper.create" size="sm">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Role
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Role</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Role Type *</Label>
                <Select value={roleType} onValueChange={setRoleType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role type…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="director">Director</SelectItem>
                    <SelectItem value="chairperson">Chairperson</SelectItem>
                    <SelectItem value="ceo">CEO</SelectItem>
                    <SelectItem value="cfo">CFO</SelectItem>
                    <SelectItem value="key_person">Key Person</SelectItem>
                    <SelectItem value="controller">Controller</SelectItem>
                    <SelectItem value="shareholder">Shareholder</SelectItem>
                    <SelectItem value="senior_manager">Senior Manager</SelectItem>
                    <SelectItem value="trustee">Trustee</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Entity Name</Label>
                <Select value={licenseeId} onValueChange={setLicenseeId}>
                  <SelectTrigger disabled={licenseesLoading}>
                    <SelectValue placeholder={licenseesLoading ? 'Loading entities…' : 'Select an entity…'} />
                  </SelectTrigger>
                  <SelectContent>
                    {licensees.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="is-current"
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 accent-primary"
                  checked={isCurrent}
                  onChange={(e) => setIsCurrent(e.target.checked)}
                />
                <Label htmlFor="is-current">Currently held</Label>
              </div>
              <div>
                <Label>Reassessment cycle (months)</Label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={reassessmentCycleMonths}
                  onChange={(e) => setReassessmentCycleMonths(e.target.value)}
                  placeholder="e.g. 24 — leave blank for no automatic cycle"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button data-rbac="fit_and_proper.create" onClick={() => addRole.mutate()} disabled={addRole.isPending}>
                {addRole.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Role
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-10 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 inline animate-spin mr-2" />
            Loading roles…
          </div>
        ) : (roles ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No roles recorded for this individual.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role Type</TableHead>
                  <TableHead>Entity Name</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Reassessment Cycle</TableHead>
                  <TableHead>Recorded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(roles ?? []).map((r: any) => {
                  const editVal = cycleEdits[r.id];
                  const shown = editVal !== undefined ? editVal : (r.reassessment_cycle_months ?? '');
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{capitalize(r.role_type)}</TableCell>
                      <TableCell>{r.licensees?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        {r.is_current ? (
                          <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 text-xs">
                            Yes
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 text-xs">
                            No
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.is_current ? (
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={1}
                              max={120}
                              placeholder="months"
                              value={shown}
                              onChange={(e) => setCycleEdits((s) => ({ ...s, [r.id]: e.target.value }))}
                              className="h-8 w-20"
                            />
                            <Button size="sm" variant="outline" className="h-8" onClick={() => saveCycle(r.id)} disabled={editVal === undefined}>
                              <Save className="h-3.5 w-3.5" />
                            </Button>
                            {r.next_reassessment_due && (
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                due {fmtDate(r.next_reassessment_due)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">
                        {fmtDate(r.created_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab 3: Assessments
// ---------------------------------------------------------------------------

function AssessmentDetailDialog({
  assessment,
  open,
  onClose,
}: {
  assessment: any | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [requestDeclOpen, setRequestDeclOpen] = useState(false);
  const { data: detail, isLoading } = useQuery({
    queryKey: ['fp_assessment_detail', assessment?.id],
    enabled: open && !!assessment?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assessments')
        .select('*, fp_individuals(full_name)')
        .eq('id', assessment.id)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  // A Fit & Proper declaration is a self-attestation by the individual, not
  // something staff should key in on their behalf — so a draft assessment
  // (no declaration invited or submitted yet) offers the same identity-gated
  // "Request Declaration" invitation used on /fpa/initiation rather than an
  // inline form staff could edit directly.
  const isDraft = canRequestDeclaration(detail?.status);

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assessment Detail</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 inline animate-spin mr-2" />
            Loading assessment…
          </div>
        ) : detail ? (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <DetailField label="Assessment ID" value={detail.id} />
              <DetailField label="Type" value={capitalize(detail.assessment_type)} />
              <DetailField label="Status" value={
                <Badge
                  variant="outline"
                  className={`text-xs font-medium ${ASSESSMENT_STATUS_CLASS[detail.status] ?? 'bg-slate-100 text-slate-700'}`}
                >
                  {capitalize(detail.status)}
                </Badge>
              } />
              <DetailField label="Created" value={fmtDate(detail.created_at)} />
              {detail.updated_at && (
                <DetailField label="Last Updated" value={fmtDate(detail.updated_at)} />
              )}
              {detail.determination && (
                <DetailField label="Determination" value={capitalize(detail.determination)} />
              )}
            </div>
            {detail.notes && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</p>
                <p className="text-sm text-foreground whitespace-pre-line">{detail.notes}</p>
              </div>
            )}

            <Separator />

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Declaration</p>
              {isDraft ? (
                <div className="border rounded p-3 space-y-2 bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    This assessment is still in Draft — no declaration has been requested or submitted yet.
                    The individual must complete their own Personal Questionnaire declaration through a
                    secure, identity-verified link; staff cannot fill it in on their behalf.
                  </p>
                  <Button
                    data-rbac="fit_and_proper.edit"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setRequestDeclOpen(true)}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Request Declaration
                  </Button>
                </div>
              ) : (
                <SubmittedDeclarationView
                  formTemplateId={detail.form_template_id}
                  formVersionId={detail.form_version_id}
                  declarationData={detail.declaration_data}
                />
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4">Assessment details unavailable.</p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {detail && (
      <RequestDeclarationDialog
        open={requestDeclOpen}
        onOpenChange={setRequestDeclOpen}
        individualId={detail.individual_id}
        individualName={detail.fp_individuals?.full_name ?? ''}
        assessmentId={detail.id}
        assessmentLabel={`${capitalize(detail.assessment_type)} · ${capitalize(detail.status)}`}
        onSent={() => qc.invalidateQueries({ queryKey: ['fp_assessment_detail', assessment?.id] })}
      />
    )}
    </>
  );
}

function AssessmentsTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [assessmentType, setAssessmentType] = useState<string>('initial');
  const [viewAssessment, setViewAssessment] = useState<any | null>(null);
  const [viewOpen, setViewOpen] = useState(false);

  const { data: assessments, isLoading } = useQuery({
    queryKey: ['fp_assessments_individual', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assessments')
        .select('id, assessment_type, status, created_at')
        .eq('individual_id', id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const startAssessment = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('No individual selected');
      await fpAssessmentInitiate({ individualId: id, assessmentType });
    },
    onSuccess: () => {
      toast.success('Assessment created');
      qc.invalidateQueries({ queryKey: ['fp_assessments_individual', id] });
      setOpen(false);
      setAssessmentType('initial');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to create assessment'),
  });

  return (
    <>
      <AssessmentDetailDialog
        assessment={viewAssessment}
        open={viewOpen}
        onClose={() => { setViewOpen(false); setViewAssessment(null); }}
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Assessments</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-rbac="fit_and_proper.create" size="sm">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Start New Assessment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start New Assessment</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Assessment Type</Label>
                  <Select value={assessmentType} onValueChange={setAssessmentType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSESSMENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {capitalize(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button data-rbac="fit_and_proper.create" onClick={() => startAssessment.mutate()} disabled={startAssessment.isPending}>
                  {startAssessment.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Create Assessment
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 inline animate-spin mr-2" />
              Loading assessments…
            </div>
          ) : (assessments ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No assessments on record for this individual.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(assessments ?? []).map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-medium">
                          {capitalize(a.assessment_type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs font-medium ${ASSESSMENT_STATUS_CLASS[a.status] ?? 'bg-slate-100 text-slate-700'}`}
                        >
                          {capitalize(a.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">
                        {fmtDate(a.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        {/* EPR-04: the assessment CASE is the process authority —
                            open its workspace rather than a person-level dialog. */}
                        <Button size="sm" variant="ghost" asChild>
                          <Link to={`/fpa/assessments/${a.id}`}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            Open case
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab 4: Access Control
// ---------------------------------------------------------------------------

function AccessControlTab({ id }: { id: string }) {
  const [denialOpen, setDenialOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Attempt to query compliance_audit_logs; gracefully degrade if unavailable.
  const { data: auditLogs, isLoading: logsLoading, error: logsError } = useQuery({
    queryKey: ['compliance_audit_logs_fp', id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('compliance_audit_logs')
        .select('entry_id, timestamp, user_id, action_type, object_type, justification, metadata')
        .eq('object_type', 'fp_individual')
        .eq('object_id', id)
        .order('timestamp', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    retry: false,
  });

  const handleLogDenial = async () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason for the denial');
      return;
    }
    setSubmitting(true);
    try {
      await logComplianceAudit({
        action_type: 'ACCESS_DENIED',
        object_type: 'fp_individual',
        object_id: id,
        justification: reason.trim(),
      });
      toast.success('Access denial logged to audit trail');
      setDenialOpen(false);
      setReason('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to log denial');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Compliance notice banner */}
      <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-amber-800">
          <span className="font-semibold">Access control:</span> all profile views are logged
          to the compliance audit trail. Unauthorised disclosure of subject data must be
          formally recorded via the button below.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            Audit Log — Recent Access Events
          </CardTitle>
          <Dialog open={denialOpen} onOpenChange={setDenialOpen}>
            <DialogTrigger asChild>
              <Button data-rbac="fit_and_proper.edit" size="sm" variant="destructive">
                <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
                Log Access Denial
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Log Access Denial</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <p className="text-sm text-muted-foreground">
                  This entry will be permanently recorded against this subject's compliance
                  audit trail and cannot be removed.
                </p>
                <div>
                  <Label>Reason for denial *</Label>
                  <Textarea
                    rows={4}
                    placeholder="Describe why access was denied or restricted…"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDenialOpen(false)}>
                  Cancel
                </Button>
                <Button data-rbac="fit_and_proper.edit"
                  variant="destructive"
                  onClick={handleLogDenial}
                  disabled={submitting}
                >
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Submit Denial Log
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="py-10 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 inline animate-spin mr-2" />
              Loading audit records…
            </div>
          ) : logsError ? (
            <div className="rounded-md border border-dashed border-destructive/40 bg-destructive/5 px-5 py-8 text-center space-y-2">
              <AlertTriangle className="h-8 w-8 mx-auto text-destructive/60" />
              <p className="text-sm font-medium text-destructive">
                Failed to load audit log
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto break-words">
                {(logsError as any)?.message || 'An unexpected error occurred.'}
              </p>
              {/relation.*does not exist|undefined_table/i.test((logsError as any)?.message ?? '') && (
                <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                  The <code className="font-mono text-xs bg-muted px-1 rounded">compliance_audit_logs</code> table
                  does not appear to be provisioned. Once provisioned, access events for this subject will appear here automatically.
                </p>
              )}
            </div>
          ) : (auditLogs ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No audit entries found for this individual.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(auditLogs ?? []).map((log: any) => (
                    <TableRow key={log.entry_id}>
                      <TableCell className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {fmtDateTime(log.timestamp)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-mono">
                          {log.action_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {log.user_id ? log.user_id.slice(0, 8) + '…' : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.justification ||
                          log.metadata?.reason ||
                          <span className="italic">—</span>}
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
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

// EPR-04: this screen is PERSON MASTER / HISTORY. It no longer hosts a
// screening tab or the assessment-operating determination panel — those belong
// to the assessment case workspace at /fpa/assessments/:id.
const PROFILE_TAB_VALUES = ['profile', 'roles', 'assessments', 'determinations', 'conditions', 'appeals', 'monitoring', 'access-control'];

export default function FpaIndividualProfile() {
  const { id } = useParams<{ id: string }>();
  // Deep-links (notification bell, entity redirects) land on a specific tab
  // via ?tab=... — Tabs below stays uncontrolled otherwise, this only seeds
  // its initial value.
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab = requestedTab && PROFILE_TAB_VALUES.includes(requestedTab) ? requestedTab : 'profile';

  const { data: individual, isLoading, error: individualError, refetch } = useQuery({
    queryKey: ['fp_individual', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_individuals')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  // EPR-04: no "latest assessment" lookup lives here any more. Assessment
  // process work (declaration, screening, findings, committee, determination)
  // is done in the assessment case workspace, which is always opened with an
  // explicit assessment id.



  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-3" />
          Loading subject profile…
        </div>
      </DashboardLayout>
    );
  }

  if (individualError) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="flex flex-col items-center gap-2 text-center max-w-sm">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-base font-medium text-destructive">Failed to load subject profile</p>
            <p className="text-sm text-muted-foreground break-words">
              {(individualError as any)?.message || 'An unexpected error occurred.'}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/fpa/individuals">Back to Individuals</Link>
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!individual) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
          <p className="text-base font-medium">Subject not found</p>
          <Button variant="outline" asChild>
            <Link to="/fpa/individuals">Back to Individuals</Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={individual.full_name || 'Unnamed Subject'}
          description="Full subject profile — FPA-003"
          backHref="/fpa/individuals"
          backLabel="Individuals"
          actions={
            <>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/fpa/findings?individual_id=${id}`}>
                  <ClipboardList className="h-4 w-4 mr-1.5" />
                  View Findings
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/admin/case-audit/fp_individual/${id}`}>
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  Case Audit Trail
                </Link>
              </Button>
            </>
          }
        />

        <Tabs defaultValue={initialTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="assessments">Assessments</TabsTrigger>
            <TabsTrigger value="determinations">Determinations</TabsTrigger>
            <TabsTrigger value="conditions">Conditions</TabsTrigger>
            <TabsTrigger value="appeals">Appeals</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
            <TabsTrigger value="access-control">Access Control</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <ProfileTab individual={individual} id={id!} />
          </TabsContent>

          <TabsContent value="roles">
            <RolesTab id={id!} />
          </TabsContent>

          <TabsContent value="assessments">
            <AssessmentsTab id={id!} />
          </TabsContent>

          <TabsContent value="determinations" className="space-y-4">
            {/* Person-level regulatory position only (Twin Peaks). Assessment
                determinations are recorded in the assessment case workspace. */}
            <FpRegulatorPositionsPanel individualId={id!} />
          </TabsContent>


          <TabsContent value="conditions">
            <FpConditionsPanel individualId={id!} />
          </TabsContent>

          <TabsContent value="appeals">
            <FpAppealsPanel individualId={id!} />
          </TabsContent>

          <TabsContent value="monitoring">
            <FpMonitoringPanel individualId={id!} />
          </TabsContent>

          <TabsContent value="access-control">
            <AccessControlTab id={id!} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
