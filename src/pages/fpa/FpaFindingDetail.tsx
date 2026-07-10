import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Loader2,
  ArrowLeft,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  FileText,
  User,
  ClipboardList,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(dt: string | null | undefined): string {
  if (!dt) return '—';
  try {
    return new Date(dt).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function severityBadgeClass(sev: string): string {
  switch (sev.toUpperCase()) {
    case 'HIGH':
      return 'bg-red-100 text-red-800 border border-red-300';
    case 'MEDIUM':
      return 'bg-amber-100 text-amber-800 border border-amber-300';
    case 'LOW':
      return 'bg-green-100 text-green-800 border border-green-300';
    default:
      return 'bg-slate-100 text-slate-700 border border-slate-200';
  }
}

function statusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'open':
      return 'bg-blue-100 text-blue-800 border border-blue-300';
    case 'under_review':
      return 'bg-amber-100 text-amber-800 border border-amber-300';
    case 'confirmed':
      return 'bg-red-100 text-red-800 border border-red-300';
    case 'false_positive':
      return 'bg-green-100 text-green-800 border border-green-300';
    default:
      return 'bg-slate-100 text-slate-600 border border-slate-200';
  }
}

function SeverityIcon({ sev }: { sev: string }) {
  switch (sev.toUpperCase()) {
    case 'HIGH':
      return <ShieldAlert className="h-5 w-5 text-red-600" />;
    case 'MEDIUM':
      return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case 'LOW':
      return <ShieldCheck className="h-5 w-5 text-green-600" />;
    default:
      return <ShieldOff className="h-5 w-5 text-slate-400" />;
  }
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function FpaFindingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: finding, isLoading, isError, error } = useQuery({
    queryKey: ['fp_finding_detail', id],
    queryFn: async () => {
      if (!id) throw new Error('No finding ID provided');

      const { data, error: fetchError } = await (supabase as any)
        .from('fp_findings')
        .select(`
          id,
          assessment_id,
          individual_id,
          title,
          summary,
          severity,
          resolution_status,
          check_type,
          source,
          confidence_score,
          review_note,
          is_false_positive,
          created_at,
          reviewed_at,
          reviewed_by,
          resolved_at,
          resolved_by,
          resolution_reason,
          run_id,
          evidence_url,
          citations,
          severity_basis
        `)
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Fetch individual name
      let individualName = '—';
      let assessmentRef = '—';

      if (data.individual_id) {
        const { data: ind } = await (supabase as any)
          .from('fp_individuals')
          .select('full_name')
          .eq('id', data.individual_id)
          .maybeSingle();
        if (ind?.full_name) individualName = ind.full_name;
      }

      if (data.assessment_id) {
        const { data: ass } = await (supabase as any)
          .from('fp_assessments')
          .select('id, status')
          .eq('id', data.assessment_id)
          .maybeSingle();
        if (ass) assessmentRef = ass.id;
      }

      return { ...data, individualName, assessmentRef };
    },
    enabled: !!id,
  });

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading finding…
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !finding) {
    const msg = (error as any)?.message ?? 'Failed to load finding';
    toast.error(msg);
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/fpa/findings')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Findings
          </Button>
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-6 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-red-800">Failed to load finding</p>
                <p className="text-sm text-red-700 mt-1">{msg}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const sev = (finding.severity ?? '').toUpperCase();
  const status = (finding.resolution_status ?? '').toLowerCase();

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-4xl">
        {/* Back nav + action */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate('/fpa/findings')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Findings Console
          </Button>
          <Button size="sm" onClick={() => navigate(`/fpa/manual-tasks/${id}`)}>
            <ClipboardList className="h-4 w-4 mr-1.5" />
            Manage in Review Queue
          </Button>
        </div>

        {/* Page header */}
        <PageHeader
          title={finding.title ?? 'Finding Detail'}
          description="Full detail view for this FPA finding — FPA-007"
        />

        {/* Severity + status row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <SeverityIcon sev={sev} />
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold tracking-wide ${severityBadgeClass(sev)}`}
            >
              {sev || '—'}
            </span>
          </div>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium whitespace-nowrap ${statusBadgeClass(status)}`}
          >
            {status.replace(/_/g, ' ') || '—'}
          </span>
          {finding.is_false_positive && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
              False Positive
            </Badge>
          )}
          {finding.severity_basis?.escalated && (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
              Escalated
            </Badge>
          )}
          {finding.check_type && (
            <Badge variant="outline" className="text-xs">
              {finding.check_type.replace(/_/g, ' ')}
            </Badge>
          )}
        </div>

        {/* Main detail card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Finding Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {finding.summary && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Summary</p>
                <p className="text-sm leading-relaxed">{finding.summary}</p>
              </div>
            )}

            {finding.severity_basis?.reason && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Why this severity?</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{finding.severity_basis.reason}</p>
              </div>
            )}

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Source</p>
                <p>{finding.source ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Confidence Score</p>
                <p>
                  {finding.confidence_score != null
                    ? `${Math.round(finding.confidence_score)}%`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Created At</p>
                <p>{formatDate(finding.created_at)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Reviewed At</p>
                <p>{formatDate(finding.reviewed_at)}</p>
              </div>
              {finding.resolved_at && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Resolved At</p>
                  <p>{formatDate(finding.resolved_at)}</p>
                </div>
              )}
              {finding.resolution_reason && (
                <div className="col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Resolution Reason</p>
                  <p>{finding.resolution_reason}</p>
                </div>
              )}
            </div>

            {finding.review_note && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Review Note</p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/30 rounded p-3 border">
                    {finding.review_note}
                  </p>
                </div>
              </>
            )}

            {finding.evidence_url && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Evidence URL</p>
                  <a
                    href={finding.evidence_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline break-all"
                  >
                    {finding.evidence_url}
                  </a>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Individual / Assessment card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Subject &amp; Context
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Individual</p>
                {finding.individual_id ? (
                  <Link to={`/fpa/individuals/${finding.individual_id}`} className="text-primary hover:underline">
                    {finding.individualName}
                  </Link>
                ) : (
                  <p>{finding.individualName}</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Assessment ID</p>
                <p className="font-mono text-xs">{finding.assessmentRef}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Screening Run ID</p>
                <p className="font-mono text-xs">{finding.run_id ?? '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Audit trail card */}
        {(finding.reviewed_by || finding.resolved_by) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Audit Trail
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                {finding.reviewed_by && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Reviewed By</p>
                    <p className="font-mono text-xs">{finding.reviewed_by}</p>
                  </div>
                )}
                {finding.resolved_by && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Resolved By</p>
                    <p className="font-mono text-xs">{finding.resolved_by}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
