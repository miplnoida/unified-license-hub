import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { FpAssessmentsPanel } from '@/components/fit-and-proper/FpAssessmentsPanel';
import { FpScreeningPanel } from '@/components/fit-and-proper/FpScreeningPanel';
import { FpDeterminationsPanel } from '@/components/fit-and-proper/FpDeterminationsPanel';
import { FpConditionsPanel } from '@/components/fit-and-proper/FpConditionsPanel';
import { FpAppealsPanel } from '@/components/fit-and-proper/FpAppealsPanel';

export default function FitAndProperIndividualDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: person, isLoading } = useQuery({
    queryKey: ['fp_individual', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_individuals').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: roles } = useQuery({
    queryKey: ['fp_individual_roles', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_individual_roles')
        .select('id, role_type, role_title, licensee_id, is_current, effective_from, effective_to')
        .eq('individual_id', id!).order('is_current', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: latestAssessment } = useQuery({
    queryKey: ['fp_latest_assessment', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_assessments')
        .select('id').eq('individual_id', id!).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const latestAssessmentId = latestAssessment?.id ?? null;

  if (isLoading) return <DashboardLayout><div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div></DashboardLayout>;
  if (!person) return <DashboardLayout><div className="p-8 text-center text-muted-foreground">Not found or access denied.</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={person.full_name}
          description={`${person.nationality || 'Unknown nationality'}${person.national_id ? ` · ID ${person.national_id}` : ''}`}
          backHref="/fit-and-proper"
          backLabel="Register"
          actions={<Badge variant="outline">{person.status}</Badge>}
        />

        <Card><CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><div className="text-xs text-muted-foreground">Date of birth</div><div>{person.date_of_birth || '—'}</div></div>
          <div><div className="text-xs text-muted-foreground">Email</div><div>{person.email || '—'}</div></div>
          <div><div className="text-xs text-muted-foreground">Phone</div><div>{person.phone || '—'}</div></div>
          <div><div className="text-xs text-muted-foreground">Address</div><div>{person.address || '—'}</div></div>
        </CardContent></Card>

        <Tabs defaultValue="roles">
          <TabsList>
            <TabsTrigger value="roles">Roles ({roles?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="assessments">Assessments</TabsTrigger>
            <TabsTrigger value="screening">Screening</TabsTrigger>
            <TabsTrigger value="determinations">Determinations</TabsTrigger>
            <TabsTrigger value="conditions">Conditions</TabsTrigger>
            <TabsTrigger value="appeals">Appeals</TabsTrigger>
            <TabsTrigger value="monitoring" disabled>Monitoring</TabsTrigger>
          </TabsList>

          <TabsContent value="roles">
            <Card><CardContent className="p-4 space-y-2">
              {(roles ?? []).length === 0 && <p className="text-sm text-muted-foreground">No roles linked yet.</p>}
              {(roles ?? []).map((r: any) => (
                <div key={r.id} className="border rounded p-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{r.role_type.replace(/_/g, ' ')}{r.role_title ? ` — ${r.role_title}` : ''}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.licensee_id ? <Link to={`/admin/licensees/${r.licensee_id}`} className="underline">Licensee {String(r.licensee_id).slice(0, 8)}…</Link> : 'No licensee link'}
                      {' · '}{r.effective_from || '?'} → {r.effective_to || 'present'}
                    </div>
                  </div>
                  {r.is_current && <Badge variant="outline" className="bg-green-100 text-green-800">current</Badge>}
                </div>
              ))}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="assessments">
            {id && <FpAssessmentsPanel individualId={id} />}
          </TabsContent>

          <TabsContent value="screening">
            {id && <FpScreeningPanel individualId={id} assessmentId={latestAssessmentId} />}
          </TabsContent>

          <TabsContent value="determinations">
            {id && <FpDeterminationsPanel individualId={id} assessmentId={latestAssessmentId} />}
          </TabsContent>

          <TabsContent value="conditions">
            {id && <FpConditionsPanel individualId={id} />}
          </TabsContent>

          <TabsContent value="appeals">
            {id && <FpAppealsPanel individualId={id} />}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
