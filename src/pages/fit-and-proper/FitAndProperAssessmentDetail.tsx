import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Save, Send, ShieldCheck, Users, CheckCircle2, XCircle, Plus, Trash2 } from 'lucide-react';
import { HistoryButton } from '@/components/audit/HistoryButton';

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700' },
  submitted: { label: 'Submitted', className: 'bg-blue-100 text-blue-800' },
  screening: { label: 'Screening', className: 'bg-amber-100 text-amber-800' },
  awaiting_committee: { label: 'Awaiting committee', className: 'bg-purple-100 text-purple-800' },
  determined: { label: 'Determined', className: 'bg-green-100 text-green-800' },
  closed: { label: 'Closed', className: 'bg-slate-100 text-slate-700' },
};

type Employment = { employer: string; role: string; from: string; to: string; reason_for_leaving: string };
type Qualification = { title: string; institution: string; year: string };

interface Declaration {
  employment_history: Employment[];
  qualifications: Qualification[];
  regulatory_history: string;
  criminal_record: string;
  financial_soundness: string;
  related_parties: string;
  disqualifications: boolean;
  bankruptcy: boolean;
  disciplinary: boolean;
  confirmation: boolean;
}

const EMPTY_DECL: Declaration = {
  employment_history: [],
  qualifications: [],
  regulatory_history: '',
  criminal_record: '',
  financial_soundness: '',
  related_parties: '',
  disqualifications: false,
  bankruptcy: false,
  disciplinary: false,
  confirmation: false,
};

export default function FitAndProperAssessmentDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [decl, setDecl] = useState<Declaration>(EMPTY_DECL);

  const { data: assessment, isLoading } = useQuery({
    queryKey: ['fp_assessment', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_assessments').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: person } = useQuery({
    queryKey: ['fp_individual_for_assess', assessment?.individual_id],
    enabled: !!assessment?.individual_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_individuals')
        .select('id, full_name, national_id, nationality').eq('id', assessment!.individual_id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (assessment?.declaration_data) {
      const d = assessment.declaration_data as any;
      setDecl({ ...EMPTY_DECL, ...d });
    }
  }, [assessment?.id]);

  const isDraft = assessment?.status === 'draft';
  const meta = STATUS_META[assessment?.status || 'draft'] || STATUS_META.draft;

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('fp_assessments')
        .update({ declaration_data: decl as any })
        .eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Draft saved'); qc.invalidateQueries({ queryKey: ['fp_assessment', id] }); },
    onError: (e: any) => toast.error(e?.message || 'Save failed'),
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!decl.confirmation) throw new Error('You must confirm the declaration before submitting');
      const { error } = await supabase.from('fp_assessments')
        .update({
          declaration_data: decl as any,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          submitted_by: user?.id,
        })
        .eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Declaration submitted'); qc.invalidateQueries({ queryKey: ['fp_assessment', id] }); },
    onError: (e: any) => toast.error(e?.message || 'Submit failed'),
  });

  const transition = useMutation({
    mutationFn: async (to: string) => {
      const patch: any = { status: to };
      if (to === 'determined') patch.determined_at = new Date().toISOString();
      if (to === 'closed') patch.closed_at = new Date().toISOString();
      const { error } = await supabase.from('fp_assessments').update(patch).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['fp_assessment', id] }); },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const nextActions = useMemo(() => {
    switch (assessment?.status) {
      case 'submitted': return [{ label: 'Send to screening', to: 'screening', icon: ShieldCheck }];
      case 'screening': return [{ label: 'Route to committee', to: 'awaiting_committee', icon: Users }];
      case 'awaiting_committee': return [{ label: 'Mark determined', to: 'determined', icon: CheckCircle2 }];
      case 'determined': return [{ label: 'Close case', to: 'closed', icon: XCircle }];
      default: return [];
    }
  }, [assessment?.status]);

  if (isLoading) return <DashboardLayout><div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div></DashboardLayout>;
  if (!assessment) return <DashboardLayout><div className="p-8 text-center text-muted-foreground">Not found or access denied.</div></DashboardLayout>;

  const addEmployment = () => setDecl({ ...decl, employment_history: [...decl.employment_history, { employer: '', role: '', from: '', to: '', reason_for_leaving: '' }] });
  const removeEmployment = (i: number) => setDecl({ ...decl, employment_history: decl.employment_history.filter((_, idx) => idx !== i) });
  const addQualification = () => setDecl({ ...decl, qualifications: [...decl.qualifications, { title: '', institution: '', year: '' }] });
  const removeQualification = (i: number) => setDecl({ ...decl, qualifications: decl.qualifications.filter((_, idx) => idx !== i) });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={`FP Declaration — ${person?.full_name || '…'}`}
          description={`Assessment ${assessment.assessment_type} · created ${new Date(assessment.created_at).toLocaleDateString()}`}
          backHref={person ? `/fit-and-proper/individuals/${person.id}` : '/fit-and-proper'}
          backLabel={person ? 'Individual' : 'Register'}
          actions={<Badge variant="outline" className={meta.className}>{meta.label}</Badge>}
        />

        <Card>
          <CardHeader><CardTitle className="text-base">Employment history</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {decl.employment_history.length === 0 && <p className="text-sm text-muted-foreground">No entries.</p>}
            {decl.employment_history.map((e, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end border rounded p-3">
                <div><Label className="text-xs">Employer</Label><Input disabled={!isDraft} value={e.employer} onChange={(ev) => { const c = [...decl.employment_history]; c[i] = { ...c[i], employer: ev.target.value }; setDecl({ ...decl, employment_history: c }); }} /></div>
                <div><Label className="text-xs">Role</Label><Input disabled={!isDraft} value={e.role} onChange={(ev) => { const c = [...decl.employment_history]; c[i] = { ...c[i], role: ev.target.value }; setDecl({ ...decl, employment_history: c }); }} /></div>
                <div><Label className="text-xs">From</Label><Input type="date" disabled={!isDraft} value={e.from} onChange={(ev) => { const c = [...decl.employment_history]; c[i] = { ...c[i], from: ev.target.value }; setDecl({ ...decl, employment_history: c }); }} /></div>
                <div><Label className="text-xs">To</Label><Input type="date" disabled={!isDraft} value={e.to} onChange={(ev) => { const c = [...decl.employment_history]; c[i] = { ...c[i], to: ev.target.value }; setDecl({ ...decl, employment_history: c }); }} /></div>
                <div className="flex gap-2">
                  <Input placeholder="Reason for leaving" disabled={!isDraft} value={e.reason_for_leaving} onChange={(ev) => { const c = [...decl.employment_history]; c[i] = { ...c[i], reason_for_leaving: ev.target.value }; setDecl({ ...decl, employment_history: c }); }} />
                  {isDraft && <Button size="sm" variant="ghost" onClick={() => removeEmployment(i)}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </div>
            ))}
            {isDraft && <Button size="sm" variant="outline" onClick={addEmployment}><Plus className="h-4 w-4 mr-2" /> Add employment</Button>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Qualifications</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {decl.qualifications.length === 0 && <p className="text-sm text-muted-foreground">No entries.</p>}
            {decl.qualifications.map((q, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end border rounded p-3">
                <div><Label className="text-xs">Title</Label><Input disabled={!isDraft} value={q.title} onChange={(ev) => { const c = [...decl.qualifications]; c[i] = { ...c[i], title: ev.target.value }; setDecl({ ...decl, qualifications: c }); }} /></div>
                <div><Label className="text-xs">Institution</Label><Input disabled={!isDraft} value={q.institution} onChange={(ev) => { const c = [...decl.qualifications]; c[i] = { ...c[i], institution: ev.target.value }; setDecl({ ...decl, qualifications: c }); }} /></div>
                <div><Label className="text-xs">Year</Label><Input disabled={!isDraft} value={q.year} onChange={(ev) => { const c = [...decl.qualifications]; c[i] = { ...c[i], year: ev.target.value }; setDecl({ ...decl, qualifications: c }); }} /></div>
                <div>{isDraft && <Button size="sm" variant="ghost" onClick={() => removeQualification(i)}><Trash2 className="h-4 w-4" /></Button>}</div>
              </div>
            ))}
            {isDraft && <Button size="sm" variant="outline" onClick={addQualification}><Plus className="h-4 w-4 mr-2" /> Add qualification</Button>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Disclosures</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>Regulatory history</Label><Textarea rows={3} disabled={!isDraft} value={decl.regulatory_history} onChange={(e) => setDecl({ ...decl, regulatory_history: e.target.value })} placeholder="Prior regulator interactions, sanctions, licence refusals…" /></div>
            <div><Label>Criminal record</Label><Textarea rows={3} disabled={!isDraft} value={decl.criminal_record} onChange={(e) => setDecl({ ...decl, criminal_record: e.target.value })} placeholder="Any convictions, pending charges, cautions…" /></div>
            <div><Label>Financial soundness</Label><Textarea rows={3} disabled={!isDraft} value={decl.financial_soundness} onChange={(e) => setDecl({ ...decl, financial_soundness: e.target.value })} placeholder="Bankruptcies, judgments, defaults, IVA…" /></div>
            <div><Label>Related-party disclosures</Label><Textarea rows={3} disabled={!isDraft} value={decl.related_parties} onChange={(e) => setDecl({ ...decl, related_parties: e.target.value })} placeholder="Family or business relationships with other regulated entities…" /></div>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-2"><Checkbox checked={decl.disqualifications} disabled={!isDraft} onCheckedChange={(v) => setDecl({ ...decl, disqualifications: !!v })} /><Label>I have been disqualified from acting as a director</Label></div>
              <div className="flex items-center gap-2"><Checkbox checked={decl.bankruptcy} disabled={!isDraft} onCheckedChange={(v) => setDecl({ ...decl, bankruptcy: !!v })} /><Label>I have been declared bankrupt / insolvent</Label></div>
              <div className="flex items-center gap-2"><Checkbox checked={decl.disciplinary} disabled={!isDraft} onCheckedChange={(v) => setDecl({ ...decl, disciplinary: !!v })} /><Label>I have been subject to disciplinary action by a professional body</Label></div>
            </div>
            <Separator />
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-3">
              <Checkbox checked={decl.confirmation} disabled={!isDraft} onCheckedChange={(v) => setDecl({ ...decl, confirmation: !!v })} />
              <Label className="text-sm">I confirm the information above is accurate and complete. I understand that misrepresentation may result in refusal of authorisation or removal from an authorised position.</Label>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2 justify-end">
          {isDraft && (
            <>
              <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Save draft
              </Button>
              <Button onClick={() => submit.mutate()} disabled={submit.isPending || !decl.confirmation}>
                {submit.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Submit declaration
              </Button>
            </>
          )}
          {nextActions.map((a) => (
            <Button key={a.to} onClick={() => transition.mutate(a.to)} disabled={transition.isPending}>
              <a.icon className="h-4 w-4 mr-2" /> {a.label}
            </Button>
          ))}
          {person && <Link to={`/fit-and-proper/individuals/${person.id}`}><Button variant="ghost">Back to individual</Button></Link>}
        </div>
      </div>
    </DashboardLayout>
  );
}
