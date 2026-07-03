import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { logAction } from '@/hooks/useAuditLog';
import { ArrowLeft, Loader2, Gavel, CheckCircle2, XCircle, UserCheck, AlertTriangle, Printer } from 'lucide-react';
import { ComplaintAcknowledgement, type ComplaintAckInput } from '@/components/complaints/ComplaintAcknowledgement';
import ComplaintInvestigationTab from '@/components/complaints/ComplaintInvestigationTab';
import { HistoryButton } from '@/components/audit/HistoryButton';
import { OverrideReasonDialog } from '@/components/audit/OverrideReasonDialog';
import { ConductClassificationCard } from '@/components/complaints/ConductClassificationCard';
import { TriageHistoryCard } from '@/components/complaints/TriageHistoryCard';
import { DecisionGatesBanner } from '@/components/decision-gates/DecisionGatesBanner';

const STATUS_META: Record<string, { label: string; variant: any }> = {
  submitted: { label: 'Submitted', variant: 'default' },
  under_investigation: { label: 'Under Investigation', variant: 'outline' },
  resolved: { label: 'Resolved', variant: 'default' },
  closed: { label: 'Closed', variant: 'secondary' },
};

const SEVERITY_META: Record<string, { label: string; variant: any }> = {
  low: { label: 'Low', variant: 'outline' },
  medium: { label: 'Medium', variant: 'secondary' },
  high: { label: 'High', variant: 'default' },
  critical: { label: 'Critical', variant: 'destructive' },
};

export default function ComplaintDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  const [resolution, setResolution] = useState('');
  const [severity, setSeverity] = useState<string>('');
  const [escalateNote, setEscalateNote] = useState('');
  const [severityOverride, setSeverityOverride] = useState<null | { from: string; to: string }>(null);
  const [ackOpen, setAckOpen] = useState(false);

  const { data: complaint, isLoading } = useQuery({
    queryKey: ['complaint', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('complaints').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: complainant } = useQuery({
    queryKey: ['complaint_complainant', complaint?.complainant_id],
    enabled: !!complaint?.complainant_id,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('full_name, email, user_type').eq('id', complaint!.complainant_id).maybeSingle();
      return data;
    },
  });

  const { data: complaintType } = useQuery({
    queryKey: ['complaint_type', complaint?.complaint_type_id],
    enabled: !!complaint?.complaint_type_id,
    queryFn: async () => {
      const { data } = await supabase.from('complaint_types').select('name, sla_days').eq('id', complaint!.complaint_type_id).maybeSingle();
      return data as any;
    },
  });

  const { data: enforcement } = useQuery({
    queryKey: ['complaint_enforcement', complaint?.enforcement_action_id],
    enabled: !!complaint?.enforcement_action_id,
    queryFn: async () => {
      const { data } = await supabase.from('enforcement_actions').select('id, case_number, status').eq('id', complaint!.enforcement_action_id).maybeSingle();
      return data as any;
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['complaint', id] });

  const takeInvestigation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('complaints').update({
        status: 'under_investigation',
        investigator_id: user?.id,
        acknowledged_at: new Date().toISOString(),
      }).eq('id', id!);
      if (error) throw error;
      await logAction('complaint.investigation_started', 'complaint', id!);
    },
    onSuccess: () => { toast.success('Investigation started'); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const setSeverityMut = useMutation({
    mutationFn: async () => {
      if (!severity) throw new Error('Pick a severity');
      const { error } = await supabase.from('complaints').update({ severity }).eq('id', id!);
      if (error) throw error;
      await logAction('complaint.severity_set', 'complaint', id!, { meta: { severity } });
    },
    onSuccess: () => { toast.success('Severity updated'); setSeverity(''); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  // Applies the severity change ONLY after the override is logged.
  async function applySeverityChange(next: string) {
    const { error } = await supabase.from('complaints').update({ severity: next }).eq('id', id!);
    if (error) throw error;
    await logAction('complaint.severity_set', 'complaint', id!, { meta: { severity: next, via: 'override' } });
    toast.success('Severity overridden');
    setSeverity('');
    invalidate();
  }

  function handleSeverityUpdate() {
    if (!severity) { toast.error('Pick a severity'); return; }
    const current = complaint?.severity;
    // If severity is unchanged, no-op. If different from current system severity,
    // treat as an override: require justification via OverrideReasonDialog.
    if (!current || current === severity) {
      setSeverityMut.mutate();
      return;
    }
    setSeverityOverride({ from: current, to: severity });
  }

  const resolve = useMutation({
    mutationFn: async () => {
      if (resolution.trim().length < 5) throw new Error('Resolution notes required');
      const { error } = await supabase.from('complaints').update({
        status: 'resolved',
        resolution: resolution.trim(),
        resolved_at: new Date().toISOString(),
      }).eq('id', id!);
      if (error) throw error;
      await logAction('complaint.resolved', 'complaint', id!);
    },
    onSuccess: () => { toast.success('Complaint resolved'); setResolution(''); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const close = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('complaints').update({ status: 'closed' }).eq('id', id!);
      if (error) throw error;
      await logAction('complaint.closed', 'complaint', id!);
    },
    onSuccess: () => { toast.success('Complaint closed'); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const escalate = useMutation({
    mutationFn: async () => {
      if (!complaint?.licensee_id) throw new Error('Link a licensee before escalating.');
      if (escalateNote.trim().length < 10) throw new Error('Provide findings (min 10 chars)');
      const { data: created, error } = await (supabase.from('enforcement_actions') as any).insert({
        entity_id: complaint.licensee_id,
        enforcement_type: 'complaint_escalation',
        status: 'open',
        description: `Escalated from complaint ${complaint.complaint_number}: ${complaint.subject}\n\nFindings: ${escalateNote.trim()}`,
        findings: escalateNote.trim(),
        opened_by: user?.id ?? null,
        source_type: 'complaint',
        source_reference_id: complaint.id,
      }).select('id, case_number').single();
      if (error) throw error;
      await supabase.from('complaints').update({ enforcement_action_id: created.id }).eq('id', id!);
      await (supabase.from('enforcement_case_events') as any).insert({
        case_id: created.id,
        event_type: 'opened',
        note: `Auto-opened from complaint ${complaint.complaint_number}`,
        detail: { complaint_id: complaint.id },
        actor_id: user?.id ?? null,
      });
      await logAction('complaint.escalated_to_enforcement', 'complaint', id!, { meta: { enforcement_id: created.id } });
      return created;
    },
    onSuccess: (row) => {
      toast.success(`Enforcement case ${row.case_number} opened`);
      setEscalateNote('');
      invalidate();
      nav(`/enforcement/${row.id}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <DashboardLayout><div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div></DashboardLayout>;
  if (!complaint) return <DashboardLayout><div className="p-8 text-center text-muted-foreground">Complaint not found.</div></DashboardLayout>;

  const statusMeta = STATUS_META[complaint.status] || { label: complaint.status, variant: 'outline' };
  const sevMeta = SEVERITY_META[complaint.severity] || { label: complaint.severity, variant: 'outline' };
  const slaDays = complaintType?.sla_days || 30;
  const daysOpen = Math.floor((Date.now() - new Date(complaint.created_at).getTime()) / (1000 * 60 * 60 * 24));
  const slaStatus = complaint.resolved_at
    ? 'met'
    : daysOpen > slaDays ? 'breached' : daysOpen > slaDays * 0.8 ? 'at_risk' : 'on_track';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={`Complaint ${complaint.complaint_number}`}
          description={complaint.subject}
          actions={
            <div className="flex items-center gap-2">
              <HistoryButton entityType="complaint" entityId={complaint.id} title={`History — ${complaint.complaint_number}`} />
              <Button variant="outline" size="sm" onClick={() => setAckOpen(true)}>
                <Printer className="h-4 w-4 mr-2" />Reprint acknowledgement
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/complaints"><ArrowLeft className="h-4 w-4 mr-2" />Back to Complaints</Link>
              </Button>
            </div>
          }
        />

        <DecisionGatesBanner subjectType="complaint" subjectId={complaint.id} compact />

        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Status</p><Badge variant={statusMeta.variant} className="mt-1">{statusMeta.label}</Badge></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Severity</p><Badge variant={sevMeta.variant} className="mt-1">{sevMeta.label}</Badge></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Days Open</p><p className="text-2xl font-semibold">{daysOpen}<span className="text-xs text-muted-foreground ml-1">/ {slaDays}</span></p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">SLA</p>
            <Badge variant={slaStatus === 'breached' ? 'destructive' : slaStatus === 'at_risk' ? 'secondary' : 'default'} className="mt-1 capitalize">{slaStatus.replace('_', ' ')}</Badge>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="investigation">Investigation</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div><p className="text-muted-foreground">Type</p><p>{complaintType?.name || '—'}</p></div>
                <div><p className="text-muted-foreground">Description</p><p className="whitespace-pre-wrap">{complaint.description}</p></div>
                {complaint.resolution && <div><p className="text-muted-foreground">Resolution</p><p className="whitespace-pre-wrap">{complaint.resolution}</p></div>}
                {enforcement && (
                  <div>
                    <p className="text-muted-foreground">Linked Enforcement</p>
                    <Link to={`/enforcement/${enforcement.id}`} className="text-primary underline">{enforcement.case_number} ({enforcement.status})</Link>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Complainant</CardTitle></CardHeader>
              <CardContent className="grid gap-2 text-sm md:grid-cols-3">
                <div><p className="text-muted-foreground">Name</p><p>{complainant?.full_name || '—'}</p></div>
                <div><p className="text-muted-foreground">Email</p><p>{complaint.email || complainant?.email || '—'}</p></div>
                <div><p className="text-muted-foreground">User Type</p><p className="capitalize">{complainant?.user_type || '—'}</p></div>
              </CardContent>
            </Card>
            <ConductClassificationCard complaint={complaint} />
            <TriageHistoryCard complaint={complaint} />
          </TabsContent>

          <TabsContent value="investigation">
            <ComplaintInvestigationTab complaintId={id!} complaintStatus={complaint.status} />
          </TabsContent>

          <TabsContent value="actions" className="space-y-4">
            {complaint.status === 'closed' ? (
              <Card><CardContent className="pt-6 text-sm text-muted-foreground">This complaint is closed; no further actions can be taken.</CardContent></Card>
            ) : (
              <>
                <Card>
                  <CardHeader><CardTitle className="text-base">Triage</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label>Severity</Label>
                        <Select value={severity || complaint.severity} onValueChange={setSeverity}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(SEVERITY_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleSeverityUpdate} disabled={setSeverityMut.isPending || !severity}>Update</Button>
                    </div>
                    {complaint.status === 'submitted' && (
                      <Button onClick={() => takeInvestigation.mutate()} disabled={takeInvestigation.isPending} className="w-full">
                        <UserCheck className="h-4 w-4 mr-2" />Take Investigation
                      </Button>
                    )}
                  </CardContent>
                </Card>

                {complaint.status === 'under_investigation' && (
                  <Card>
                    <CardHeader><CardTitle className="text-base">Resolve</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <Textarea rows={3} placeholder="Resolution notes…" value={resolution} onChange={e => setResolution(e.target.value)} />
                      <div className="flex gap-2">
                        <Button onClick={() => resolve.mutate()} disabled={resolve.isPending} className="flex-1"><CheckCircle2 className="h-4 w-4 mr-2" />Mark Resolved</Button>
                        <Button variant="outline" onClick={() => close.mutate()} disabled={close.isPending}><XCircle className="h-4 w-4 mr-2" />Close</Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {complaint.status === 'resolved' && (
                  <Card><CardContent className="pt-6"><Button variant="outline" onClick={() => close.mutate()} disabled={close.isPending} className="w-full"><XCircle className="h-4 w-4 mr-2" />Close Complaint</Button></CardContent></Card>
                )}

                {!complaint.enforcement_action_id && (
                  <Card>
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Gavel className="h-4 w-4" /> Escalate to Enforcement</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {!complaint.licensee_id && (
                        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs flex gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                          <span>Link this complaint to a licensee (via the DB or complaint intake) before escalating.</span>
                        </div>
                      )}
                      <Textarea rows={3} placeholder="Findings that justify enforcement…" value={escalateNote} onChange={e => setEscalateNote(e.target.value)} />
                      <Button variant="destructive" onClick={() => escalate.mutate()} disabled={escalate.isPending || !complaint.licensee_id} className="w-full">
                        <Gavel className="h-4 w-4 mr-2" />Open Enforcement Case
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        {severityOverride && complaint && (
          <OverrideReasonDialog
            open={!!severityOverride}
            onOpenChange={(o) => { if (!o) setSeverityOverride(null); }}
            module="complaints"
            entityType="complaint"
            entityId={complaint.id}
            ruleKey="complaints.triage.severity_override"
            originalValue={{ severity: severityOverride.from }}
            overriddenValue={{ severity: severityOverride.to }}
            metadata={{
              source: 'phase1_override_framework',
              screen: 'ComplaintDetail',
              complaint_id: complaint.id,
              previous_severity: severityOverride.from,
              new_severity: severityOverride.to,
              recommendation_source: 'triage_engine',
            }}
            title="Override complaint severity"
            description={`Changing severity from ${severityOverride.from} to ${severityOverride.to} contradicts the current triage classification. Provide a written justification.`}
            onOverridden={async () => {
              const next = severityOverride.to;
              setSeverityOverride(null);
              await applySeverityChange(next);
            }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
