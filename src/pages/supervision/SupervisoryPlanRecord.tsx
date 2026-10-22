/**
 * Read-only view of one canonical supervisory plan (`supervisory_plan`).
 * Lifecycle changes stay with the governed plan operations; RLS decides
 * whether the caller may read the plan.
 */
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import { formatDate } from '@/lib/datetime';

const sb = supabase as any;
const humanise = (s?: string | null) => (s ? s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : '—');

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{children || <span className="text-muted-foreground">Not recorded</span>}</div>
    </div>
  );
}

export default function SupervisoryPlanRecord() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['canonical-supervisory-plan', id],
    enabled: !!id,
    queryFn: async () => {
      const { data: plan, error } = await sb.from('supervisory_plan').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!plan) return null;
      const { data: ls } = plan.entity_ids?.length
        ? await sb.from('licensees').select('id, name').in('id', plan.entity_ids)
        : { data: [] };
      return { plan, entities: (ls ?? []) as any[] };
    },
  });

  return (
    <DashboardLayout>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link to="/supervision/plans"><ArrowLeft className="mr-1 h-4 w-4" />Supervisory plans</Link>
      </Button>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">This plan does not exist, or you are not authorised to see it.</CardContent></Card>
      ) : (
        <>
          <PageHeader title={data.plan.title} description={data.plan.reference} />
          <Card>
            <CardHeader>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{humanise(data.plan.status)}</Badge>
                <Badge variant="outline">{humanise(data.plan.priority)} priority</Badge>
                <Badge variant="outline">{humanise(data.plan.domain_code)}</Badge>
              </div>
              <CardTitle className="text-base sr-only">Plan</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Row label="Entity">{data.entities.map(e => (
                <Link key={e.id} className="text-primary hover:underline mr-2" to={`/entities/${e.id}`}>{e.name}</Link>
              ))}</Row>
              <Row label="Period">{[humanise(data.plan.planning_period), data.plan.period_label].filter(Boolean).join(' · ')}</Row>
              <Row label="Start">{data.plan.start_date ? formatDate(data.plan.start_date) : null}</Row>
              <Row label="Target completion">{data.plan.target_completion ? formatDate(data.plan.target_completion) : null}</Row>
              <Row label="Objective">{data.plan.objective}</Row>
              <Row label="Scope">{data.plan.scope}</Row>
              <Row label="Factual basis">{data.plan.factual_basis}</Row>
            </CardContent>
          </Card>
        </>
      )}
    </DashboardLayout>
  );
}
