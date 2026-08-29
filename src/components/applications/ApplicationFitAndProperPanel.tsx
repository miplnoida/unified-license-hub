/**
 * F5-B4 — Fit & Proper linkage panel for a post-licensing filing.
 *
 * The ONLY data source is `public.post_license_fp_overview(application_id)`,
 * which decides the audience server-side: regulator staff receive linkage
 * detail, entity users receive a safe pending/complete state only. The browser
 * never queries F&P tables directly and never widens what it was given.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShieldCheck, ExternalLink, AlertTriangle } from 'lucide-react';

interface FpLink {
  link_id: string;
  assessment_id: string;
  assessment_status: string | null;
  assessment_type: string | null;
  subject_name: string | null;
  proposed_role: string | null;
  reuse_basis: string | null;
  provenance: string | null;
  is_required: boolean | null;
  determination: string | null;
  is_current: boolean | null;
  effective_to: string | null;
  href: string;
}

interface FpOverview {
  found: boolean;
  fp_required?: boolean;
  audience?: 'regulator' | 'entity';
  state?: string;
  safe_status?: string;
  subject_count?: string;
  service_name?: string;
  required_count?: string;
  satisfied?: boolean;
  links?: FpLink[];
}

const STATE_LABEL: Record<string, string> = {
  OK: 'Fit & Proper requirements satisfied',
  NOT_REQUIRED: 'Fit & Proper assessment not required',
  FP_SUBJECT_REQUIRED: 'A canonical Fit & Proper subject must be nominated',
  FP_SUBJECT_NOT_CANONICAL: 'The nominated person is not a canonical Fit & Proper individual',
  FP_LINK_REQUIRED: 'An explicit Fit & Proper assessment link is required',
  FP_DETERMINATION_REQUIRED: 'A current positive determination is required',
};

export function ApplicationFitAndProperPanel({ applicationId }: { applicationId: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['post_license_fp_overview', applicationId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('post_license_fp_overview', {
        _application_id: applicationId,
      });
      if (error) throw new Error(error.message);
      return data as FpOverview;
    },
    enabled: !!applicationId,
    staleTime: 15_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Fit &amp; Proper</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Fit &amp; Proper</CardTitle></CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Fit &amp; Proper information could not be loaded
              {error instanceof Error && error.message.includes('FORBIDDEN')
                ? ' for this account.'
                : '. Please retry.'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!data?.found) return null;

  const required = data.fp_required === true;
  const links = data.links ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Fit &amp; Proper
        </CardTitle>
        <Badge variant={!required ? 'outline' : data.satisfied || data.state === 'OK' ? 'default' : 'secondary'}>
          {required ? (data.audience === 'entity' ? data.safe_status : STATE_LABEL[data.state ?? ''] ?? data.state) : 'Not required'}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-3">
        {!required && (
          <p className="text-sm text-muted-foreground">
            This service does not require a Fit &amp; Proper assessment.
          </p>
        )}

        {required && data.audience === 'entity' && (
          <p className="text-sm text-muted-foreground">
            {data.safe_status}
            {data.subject_count ? ` — ${data.subject_count} person(s) under assessment.` : ''} The
            regulator will contact you if anything further is needed.
          </p>
        )}

        {required && data.audience === 'regulator' && (
          <>
            <p className="text-sm text-muted-foreground">
              {data.service_name ?? 'Post-licensing service'} — {data.required_count ?? 0} required
              subject(s).
            </p>

            {links.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No Fit &amp; Proper assessment has been linked to this filing yet.
              </p>
            ) : (
              <ul className="divide-y">
                {links.map((l) => (
                  <li key={l.link_id} className="py-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{l.subject_name ?? 'Unnamed subject'}</span>
                      <Link
                        to={l.href}
                        className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                      >
                        Open assessment <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {l.proposed_role && <Badge variant="outline">{l.proposed_role}</Badge>}
                      {l.assessment_status && <Badge variant="secondary">{l.assessment_status}</Badge>}
                      <Badge variant={l.determination && l.is_current ? 'default' : 'outline'}>
                        {l.determination
                          ? `${l.determination}${l.is_current ? '' : ' (superseded)'}`
                          : 'No determination'}
                      </Badge>
                      {l.reuse_basis && <Badge variant="outline">{l.reuse_basis}</Badge>}
                      {l.is_required === false && <Badge variant="outline">not required</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ApplicationFitAndProperPanel;
