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
import { Loader2, ShieldCheck, Users, CheckCircle2, XCircle, Save, Send, Plus, Trash2, FileText, Sparkles, UserCheck } from 'lucide-react';
import { HistoryButton } from '@/components/audit/HistoryButton';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { migrateSectionsToRows } from '@/lib/formRows';
import type { FormSection } from '@/types/formBuilder';
import { logAudit } from '@/hooks/useAuditLog';
import { DecisionGatesBanner } from '@/components/decision-gates/DecisionGatesBanner';
import { FpAssessmentComparisonPanel } from '@/components/fit-and-proper/FpAssessmentComparisonPanel';

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700' },
  submitted: { label: 'Submitted', className: 'bg-blue-100 text-blue-800' },
  screening: { label: 'Screening', className: 'bg-amber-100 text-amber-800' },
  awaiting_committee: { label: 'Awaiting committee', className: 'bg-purple-100 text-purple-800' },
  determined: { label: 'Determined', className: 'bg-green-100 text-green-800' },
  closed: { label: 'Closed', className: 'bg-slate-100 text-slate-700' },
};

export default function FitAndProperAssessmentDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: assessment, isLoading } = useQuery({
    queryKey: ['fp_assessment', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_assessments').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as any;
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

  const isDraft = assessment?.status === 'draft';
  const meta = STATUS_META[assessment?.status || 'draft'] || STATUS_META.draft;

  const transition = useMutation({
    mutationFn: async (to: string) => {
      const patch: any = { status: to };
      if (to === 'determined') patch.determined_at = new Date().toISOString();
      if (to === 'closed') patch.closed_at = new Date().toISOString();
      const { error } = await supabase.from('fp_assessments').update(patch).eq('id', id!);
      if (error) throw error;
      await logAudit({
        action: `fp_assessment.status.${to}`,
        entityType: 'fp_assessment',
        entityId: id!,
        oldValue: { status: assessment?.status },
        newValue: { status: to },
        metadata: { individual_id: assessment?.individual_id },
      });
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

  const hasPinnedForm = !!assessment.form_version_id && !!assessment.form_template_id;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={`FP Personal Questionnaire — ${person?.full_name || '…'}`}
          description={`Assessment ${assessment.assessment_type} · created ${new Date(assessment.created_at).toLocaleDateString()}`}
          backHref={person ? `/fpa/individuals/${person.id}` : '/fit-and-proper'}
          backLabel={person ? 'Individual' : 'Register'}
          actions={<div className="flex items-center gap-2"><Badge variant="outline" className={meta.className}>{meta.label}</Badge><HistoryButton entityType="fp_assessment" entityId={assessment.id} title="Assessment history" /></div>}
        />

        <DecisionGatesBanner subjectType="fp_assessment" subjectId={assessment.id} compact />

        {/* D1 — AI analysis card */}
        <AiAnalysisCard assessmentId={assessment.id} individualId={assessment.individual_id} />

        {/* Phase 3D — what changed since the previous assessment for this individual */}
        <FpAssessmentComparisonPanel assessmentId={assessment.id} />

        {hasPinnedForm ? (
          <PinnedPqForm
            assessmentId={assessment.id}
            templateId={assessment.form_template_id}
            versionId={assessment.form_version_id}
            individualId={assessment.individual_id}
            existingResponseId={assessment.form_response_id}
            initialData={assessment.declaration_data || {}}
            currentStatus={assessment.status}
            userId={user?.id ?? null}
            onSubmitted={() => qc.invalidateQueries({ queryKey: ['fp_assessment', id] })}
          />
        ) : (
          <LegacyDeclarationView assessment={assessment} isDraft={isDraft} onSaved={() => qc.invalidateQueries({ queryKey: ['fp_assessment', id] })} />
        )}

        <div className="flex gap-2 justify-end">
          {nextActions.map((a) => (
            <Button key={a.to} onClick={() => transition.mutate(a.to)} disabled={transition.isPending}>
              <a.icon className="h-4 w-4 mr-2" /> {a.label}
            </Button>
          ))}
          {person && <Link to={`/fpa/individuals/${person.id}`}><Button variant="ghost">Back to individual</Button></Link>}
        </div>
      </div>
    </DashboardLayout>
  );
}

// ─── D1 AI Analysis Card ───
function AiAnalysisCard({ assessmentId, individualId }: { assessmentId: string; individualId: string }) {
  const { data: findings = [], isLoading } = useQuery({
    queryKey: ['fp_findings_for_assessment', assessmentId],
    enabled: !!assessmentId,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_findings')
        .select('id, check_type, severity, title, summary, source, confidence_score, is_false_positive, raw_payload, created_at, resolution_status')
        .eq('assessment_id', assessmentId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const aiFindings = (findings as any[]).filter(
    (f) => f.check_type === 'adverse_media' || String(f.source || '').toLowerCase().includes('ai')
  );
  const assessorFindings = (findings as any[]).filter(
    (f) => f.check_type !== 'adverse_media' && !String(f.source || '').toLowerCase().includes('ai')
  );

  const SEVERITY_CLASS: Record<string, string> = {
    high: 'bg-red-100 text-red-800',
    medium: 'bg-amber-100 text-amber-800',
    low: 'bg-slate-100 text-slate-700',
  };

  if (isLoading) return null;
  if (findings.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-600" />
          AI Analysis &amp; Assessor Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {aiFindings.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">AI-identified findings ({aiFindings.length})</span>
            </div>
            <div className="space-y-2">
              {aiFindings.map((f: any) => {
                const assessorNote = f.raw_payload && typeof f.raw_payload === 'object' ? (f.raw_payload as any).assessor_note : null;
                return (
                  <div key={f.id} className={`border rounded p-3 text-sm ${f.is_false_positive ? 'opacity-60' : 'border-blue-100 bg-blue-50/30'}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={SEVERITY_CLASS[f.severity] || SEVERITY_CLASS.low}>{f.severity}</Badge>
                      <span className="font-medium">{f.title}</span>
                      {typeof f.confidence_score === 'number' && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">AI confidence {Number(f.confidence_score).toFixed(0)}%</Badge>
                      )}
                      {f.is_false_positive && <Badge variant="outline" className="bg-slate-100 text-slate-600">dismissed</Badge>}
                    </div>
                    {f.summary && <p className="text-xs text-muted-foreground mt-1">{f.summary}</p>}
                    {assessorNote && (
                      <div className="mt-2 border-t border-blue-100 pt-2 flex items-start gap-2">
                        <UserCheck className="h-3 w-3 mt-0.5 text-green-600 flex-shrink-0" />
                        <p className="text-xs text-green-800 italic">Assessor note: {assessorNote}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {assessorFindings.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <UserCheck className="h-3.5 w-3.5 text-green-600" />
              <span className="text-sm font-medium text-green-800">Assessor-raised findings ({assessorFindings.length})</span>
            </div>
            <div className="space-y-2">
              {assessorFindings.map((f: any) => {
                const assessorNote = f.raw_payload && typeof f.raw_payload === 'object' ? (f.raw_payload as any).assessor_note : null;
                return (
                  <div key={f.id} className={`border rounded p-3 text-sm ${f.is_false_positive ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={SEVERITY_CLASS[f.severity] || SEVERITY_CLASS.low}>{f.severity}</Badge>
                      <span className="font-medium">{f.title}</span>
                      <span className="text-xs text-muted-foreground">· {f.check_type}{f.source ? ` · ${f.source}` : ''}</span>
                    </div>
                    {f.summary && <p className="text-xs text-muted-foreground mt-1">{f.summary}</p>}
                    {assessorNote && (
                      <p className="text-xs italic mt-1 text-green-800">Note: {assessorNote}</p>
                    )}
                    {f.resolution_status && (
                      <p className="text-xs mt-1 text-muted-foreground">Status: {String(f.resolution_status).replace(/_/g, ' ')}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── PQ rendered via Form Builder (pinned version) ───
function PinnedPqForm({
  assessmentId, templateId, versionId, individualId, existingResponseId, initialData, currentStatus, userId, onSubmitted,
}: {
  assessmentId: string;
  templateId: string;
  versionId: string;
  individualId: string;
  existingResponseId: string | null;
  initialData: Record<string, any>;
  currentStatus: string;
  userId: string | null;
  onSubmitted: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const { data: version, isLoading: loadingVersion } = useQuery({
    queryKey: ['fp_pq_version', versionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_versions')
        .select('id, template_id, version, semantic_version, schema_snapshot, status')
        .eq('id', versionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: existingResponse } = useQuery({
    queryKey: ['fp_pq_response', assessmentId, templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_responses')
        .select('id, response_data, status, submitted_at')
        .eq('entity_type', 'fp_assessment')
        .eq('entity_id', assessmentId)
        .eq('template_id', templateId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const sections = useMemo<FormSection[]>(() => {
    if (!version?.schema_snapshot) return [];
    return migrateSectionsToRows(version.schema_snapshot as unknown as FormSection[]);
  }, [version?.schema_snapshot]);

  const initial = (existingResponse?.response_data as Record<string, any> | undefined) || initialData || {};
  const readOnly = currentStatus !== 'draft';

  async function upsertResponse(data: Record<string, any>, status: 'draft' | 'submitted') {
    if (!userId) throw new Error('Not authenticated');
    setSaving(true);
    try {
      let responseId = existingResponse?.id || existingResponseId || null;
      if (responseId) {
        const { error } = await supabase.from('form_responses').update({
          version_id: versionId,
          user_id: userId,
          response_data: data,
          status,
          submitted_at: status === 'submitted' ? new Date().toISOString() : null,
        } as any).eq('id', responseId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase.from('form_responses').insert({
          template_id: templateId,
          version_id: versionId,
          user_id: userId,
          response_data: data,
          status,
          entity_type: 'fp_assessment',
          entity_id: assessmentId,
          submitted_at: status === 'submitted' ? new Date().toISOString() : null,
        } as any).select('id').single();
        if (error) throw error;
        responseId = inserted!.id;
      }
      const patch: any = { declaration_data: data };
      if (responseId && !existingResponseId) patch.form_response_id = responseId;
      if (status === 'submitted') {
        patch.status = 'submitted';
        patch.submitted_at = new Date().toISOString();
        patch.submitted_by = userId;
      }
      const { error: aErr } = await supabase.from('fp_assessments').update(patch).eq('id', assessmentId);
      if (aErr) throw aErr;

      await logAudit({
        action: status === 'submitted' ? 'fp_assessment.pq.submitted' : 'fp_assessment.pq.draft_saved',
        entityType: 'fp_assessment',
        entityId: assessmentId,
        newValue: { form_version_id: versionId, response_id: responseId, status },
        metadata: { individual_id: individualId, template_id: templateId },
      });
      if (status === 'submitted') {
        try {
          await supabase.functions.invoke('dispatch-notification-event', {
            body: { event_key: 'fp_assessment_submitted', entity_type: 'fp_assessment', entity_id: assessmentId, payload: { individual_id: individualId } },
          });
        } catch (e) { console.warn('dispatch-notification-event failed', e); }
      }
    } finally {
      setSaving(false);
    }
  }

  if (loadingVersion) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading personal questionnaire…</CardContent></Card>;
  }
  if (!version || sections.length === 0) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Pinned PQ form not available.</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Personal Questionnaire</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Form version pinned at start of assessment · v{version.version} ({version.semantic_version || '1.0'}) — historical submissions always render the exact schema used.</p>
        </div>
      </CardHeader>
      <CardContent>
        <FormRenderer
          formName=""
          sections={sections}
          initialData={initial}
          readOnly={readOnly}
          saving={saving}
          formId={templateId}
          formVersionId={versionId}
          submissionId={existingResponse?.id || existingResponseId || null}
          entityType="fp_assessment"
          entityId={assessmentId}
          onSaveDraft={async (data) => {
            try {
              await upsertResponse(data, 'draft');
              toast.success('Draft saved');
              onSubmitted();
            } catch (e: any) { toast.error(e?.message || 'Save failed'); }
          }}
          onSubmit={async (data) => {
            try {
              await upsertResponse(data, 'submitted');
              toast.success('Personal Questionnaire submitted');
              onSubmitted();
            } catch (e: any) { toast.error(e?.message || 'Submit failed'); }
          }}
        />
      </CardContent>
    </Card>
  );
}

// ─── Legacy hardcoded declaration (read-only fallback) ───
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
  employment_history: [], qualifications: [], regulatory_history: '', criminal_record: '',
  financial_soundness: '', related_parties: '', disqualifications: false, bankruptcy: false,
  disciplinary: false, confirmation: false,
};

function LegacyDeclarationView({ assessment, isDraft, onSaved }: { assessment: any; isDraft: boolean; onSaved: () => void }) {
  const { user } = useAuth();
  const [decl, setDecl] = useState<Declaration>(EMPTY_DECL);

  useEffect(() => {
    if (assessment?.declaration_data) {
      setDecl({ ...EMPTY_DECL, ...(assessment.declaration_data as any) });
    }
  }, [assessment?.id]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('fp_assessments').update({ declaration_data: decl as any }).eq('id', assessment.id);
      if (error) throw error;
      await logAudit({
        action: 'fp_assessment.pq.draft_saved',
        entityType: 'fp_assessment',
        entityId: assessment.id,
        oldValue: { declaration_data: assessment.declaration_data ?? null },
        newValue: { declaration_data: decl },
      });
    },
    onSuccess: () => { toast.success('Draft saved'); onSaved(); },
    onError: (e: any) => toast.error(e?.message || 'Save failed'),
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!decl.confirmation) throw new Error('You must confirm the declaration before submitting');
      const { error } = await supabase.from('fp_assessments').update({
        declaration_data: decl as any,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        submitted_by: user?.id,
      }).eq('id', assessment.id);
      if (error) throw error;
      await logAudit({
        action: 'fp_assessment.pq.submitted',
        entityType: 'fp_assessment',
        entityId: assessment.id,
        oldValue: { declaration_data: assessment.declaration_data ?? null, status: assessment.status },
        newValue: { declaration_data: decl, status: 'submitted' },
      });
      try {
        await supabase.functions.invoke('dispatch-notification-event', {
          body: { event_key: 'fp_assessment_submitted', entity_type: 'fp_assessment', entity_id: assessment.id, payload: { individual_id: assessment.individual_id, legacy: true } },
        });
      } catch (e) { console.warn('dispatch-notification-event failed', e); }
    },
    onSuccess: () => { toast.success('Declaration submitted'); onSaved(); },
    onError: (e: any) => toast.error(e?.message || 'Submit failed'),
  });

  const addEmployment = () => setDecl({ ...decl, employment_history: [...decl.employment_history, { employer: '', role: '', from: '', to: '', reason_for_leaving: '' }] });
  const removeEmployment = (i: number) => setDecl({ ...decl, employment_history: decl.employment_history.filter((_, idx) => idx !== i) });
  const addQualification = () => setDecl({ ...decl, qualifications: [...decl.qualifications, { title: '', institution: '', year: '' }] });
  const removeQualification = (i: number) => setDecl({ ...decl, qualifications: decl.qualifications.filter((_, idx) => idx !== i) });

  return (
    <>
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
          {isDraft && <Button data-rbac="fit_and_proper.edit" size="sm" variant="outline" onClick={addEmployment}><Plus className="h-4 w-4 mr-2" /> Add employment</Button>}
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
          {isDraft && <Button data-rbac="fit_and_proper.edit" size="sm" variant="outline" onClick={addQualification}><Plus className="h-4 w-4 mr-2" /> Add qualification</Button>}
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

      {isDraft && (
        <div className="flex gap-2 justify-end">
          <Button data-rbac="fit_and_proper.edit" variant="outline" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Save draft
          </Button>
          <Button data-rbac="fit_and_proper.edit" onClick={() => submit.mutate()} disabled={submit.isPending || !decl.confirmation}>
            {submit.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Submit declaration
          </Button>
        </div>
      )}
    </>
  );
}
