import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Plus, FileText } from 'lucide-react';
import { logFpAction } from '@/lib/fpAudit';

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700' },
  submitted: { label: 'Submitted', className: 'bg-blue-100 text-blue-800' },
  screening: { label: 'Screening', className: 'bg-amber-100 text-amber-800' },
  awaiting_committee: { label: 'Awaiting committee', className: 'bg-purple-100 text-purple-800' },
  determined: { label: 'Determined', className: 'bg-green-100 text-green-800' },
  closed: { label: 'Closed', className: 'bg-slate-100 text-slate-700' },
};

interface Props {
  individualId: string;
}

export function FpAssessmentsPanel({ individualId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [assessmentType, setAssessmentType] = useState('initial');
  const [roleId, setRoleId] = useState<string>('none');
  const [regulatorId, setRegulatorId] = useState<string>('none');

  const { data: regulators = [] } = useQuery({
    queryKey: ['regulators-active-fp'],
    queryFn: async () => (await supabase.from('regulators').select('id, name').order('name')).data ?? [],
  });

  const { data: assessments, isLoading } = useQuery({
    queryKey: ['fp_assessments', individualId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assessments')
        .select('id, assessment_type, status, submitted_at, determined_at, created_at')
        .eq('individual_id', individualId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: roles } = useQuery({
    queryKey: ['fp_individual_roles_for_assess', individualId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_individual_roles')
        .select('id, role_type, role_title, licensee_id')
        .eq('individual_id', individualId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const role = roles?.find((r) => r.id === roleId);
      const { data, error } = await supabase
        .from('fp_assessments')
        .insert({
          individual_id: individualId,
          assessment_type: assessmentType,
          role_id: roleId === 'none' ? null : roleId,
          regulator_id: regulatorId === 'none' ? null : regulatorId,
          licensee_id: role?.licensee_id ?? null,
          created_by: user?.id,
          status: 'draft',
          declaration_data: {},
        })
        .select('id, individual_id, assessment_type, role_id, licensee_id, form_template_id, form_version_id, form_response_id')
        .single();
      if (error) throw error;
      // The BEFORE INSERT trigger pins the PQ form; enforce that it succeeded.
      if (!data.form_template_id || !data.form_version_id) {
        throw new Error('Personal Questionnaire form is not configured for Fit & Proper. Ask an admin to publish the FP PQ template before starting an assessment.');
      }
      await logFpAction('fp.assessment.created', 'fp_assessment', data.id, {
        after: {
          assessment_type: data.assessment_type,
          role_id: data.role_id,
          licensee_id: data.licensee_id,
          form_template_id: data.form_template_id,
          form_version_id: data.form_version_id,
          form_response_id: data.form_response_id,
        },
        context: {
          individualId: data.individual_id,
          assessmentId: data.id,
          extra: {
            pinned_template: data.form_template_id,
            pinned_version: data.form_version_id,
            source: 'FpAssessmentsPanel',
          },
        },
      });
      return data;
    },
    onSuccess: (data) => {
      toast.success('Assessment started · PQ pinned');
      qc.invalidateQueries({ queryKey: ['fp_assessments', individualId] });
      setOpen(false);
      window.location.href = `/fit-and-proper/assessments/${data.id}`;
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Assessments</div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Start Assessment</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Start FP Assessment</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Assessment type</Label>
                  <Select value={assessmentType} onValueChange={setAssessmentType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="initial">Initial (new licence)</SelectItem>
                      <SelectItem value="renewal">Renewal / periodic review</SelectItem>
                      <SelectItem value="change_of_role">Role change</SelectItem>
                      <SelectItem value="triggered">Ad-hoc supervisory action</SelectItem>
                      <SelectItem value="ongoing_monitoring">Ongoing monitoring</SelectItem>
                      <SelectItem value="cycle">Cycle-based reassessment</SelectItem>
                      <SelectItem value="material_change">Material change</SelectItem>
                      <SelectItem value="adverse_event">Adverse event triggered</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Linked role (optional)</Label>
                  <Select value={roleId} onValueChange={setRoleId}>
                    <SelectTrigger><SelectValue placeholder="No role link" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No role link</SelectItem>
                      {(roles ?? []).map((r: any) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.role_type.replace(/_/g, ' ')}{r.role_title ? ` — ${r.role_title}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Regulator (for multi-regulator isolation)</Label>
                  <Select value={regulatorId} onValueChange={setRegulatorId}>
                    <SelectTrigger><SelectValue placeholder="No regulator scope" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Cross-regulator (no scope)</SelectItem>
                      {(regulators as any[]).map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Create draft
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>
        ) : !assessments || assessments.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">No assessments yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Determined</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {assessments.map((a: any) => {
                const meta = STATUS_META[a.status] || STATUS_META.draft;
                return (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm capitalize">{a.assessment_type.replace(/_/g, ' ')}</TableCell>
                    <TableCell><Badge variant="outline" className={meta.className}>{meta.label}</Badge></TableCell>
                    <TableCell className="text-xs">{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—'}</TableCell>
                    <TableCell className="text-xs">{a.determined_at ? new Date(a.determined_at).toLocaleDateString() : '—'}</TableCell>
                    <TableCell>
                      <Link to={`/fit-and-proper/assessments/${a.id}`}>
                        <Button size="sm" variant="ghost"><FileText className="h-4 w-4 mr-1" /> Open</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
