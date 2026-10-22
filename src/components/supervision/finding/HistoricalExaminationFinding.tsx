/**
 * Read-only view of a finding held in the historical examination finding store
 * (`examination_findings`, recorded before the supervisory finding register).
 *
 * `/supervision/findings/:id` is the canonical finding URL. When the id is not
 * in `supervisory_finding` but is a historical examination finding, this view
 * shows it with its examination and corrective action instead of reporting
 * that the finding does not exist. Visibility stays with RLS: if the caller
 * cannot read the row, nothing is shown.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';

const sb = supabase as any;

const humanise = (s?: string | null) => (s ? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—');

export function useHistoricalExaminationFinding(id?: string, enabled = true) {
  return useQuery({
    queryKey: ['historical-examination-finding', id],
    enabled: !!id && enabled,
    queryFn: async () => {
      const { data: finding, error } = await sb.from('examination_findings').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!finding) return null;
      const [{ data: exam }, { data: action }] = await Promise.all([
        sb.from('examinations').select('id, reference, title, stage, entity_id, domain_code')
          .eq('id', finding.examination_id).maybeSingle(),
        finding.remediation_action_id
          ? sb.from('prudential_actions').select('id, title, status, due_date, description')
              .eq('id', finding.remediation_action_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (exam?.entity_id) {
        const { data: l } = await sb.from('licensees').select('name').eq('id', exam.entity_id).maybeSingle();
        exam.licensee = l ?? null;
      }
      return { finding, exam, action } as { finding: any; exam: any; action: any };
    },
  });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{children || <span className="text-muted-foreground">Not recorded</span>}</div>
    </div>
  );
}

export function HistoricalExaminationFinding({ id, notFoundMessage }: { id?: string; notFoundMessage: string }) {
  const { data, isLoading } = useHistoricalExaminationFinding(id);

  if (isLoading) return <div className="space-y-4 p-6"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (!data) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">{notFoundMessage}</CardContent></Card>
      </div>
    );
  }
  const { finding: f, exam, action } = data;
  return (
    <div className="space-y-4 p-6">
      {exam && (
        <Button asChild variant="ghost" size="sm">
          <Link to={`/supervision/examinations/${exam.id}`}><ArrowLeft className="mr-1 h-4 w-4" />Back to {exam.reference}</Link>
        </Button>
      )}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-mono text-xs text-muted-foreground">{f.reference}</p>
              <CardTitle className="text-lg">{f.title}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {exam?.licensee?.name ?? 'Entity'} · {exam?.reference} · {exam?.title}
              </p>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline">{humanise(f.severity)} severity</Badge>
              <Badge variant="outline">{humanise(f.status)}</Badge>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Examination finding recorded before the supervisory finding register. Shown read-only.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Row label="Category">{humanise(f.category)}</Row>
          <Row label="Criteria breached">{f.criteria_breached}</Row>
          <Row label="What did we find?">{f.observation}</Row>
          <Row label="Root cause">{f.root_cause}</Row>
          <Row label="Recommendation">{f.recommendation}</Row>
          <Row label="Entity response">{f.entity_response}</Row>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Corrective action</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {action ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{action.title}</span>
              <Badge variant="outline">{humanise(action.status)}</Badge>
              {action.due_date && <span className="text-muted-foreground">Due {new Date(action.due_date).toLocaleDateString()}</span>}
              <Button asChild size="sm" variant="outline"><Link to="/prudential/actions">Open actions list</Link></Button>
            </div>
          ) : (
            <p className="text-muted-foreground">Corrective action not yet created, or not visible to you.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
