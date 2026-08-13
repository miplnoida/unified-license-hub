import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import {
  Loader2, FileText, Shield, MessageSquareWarning, Gavel, ClipboardList, AlertTriangle,
} from 'lucide-react';
import { formatTaxonomyLabel } from '@/lib/formatTaxonomyLabel';

export type ConsolidatedCaseSection =
  | 'other_applications'
  | 'licenses'
  | 'complaints'
  | 'enforcement'
  | 'pending_returns'
  | 'prudential_breaches';

interface Props {
  applicationId: string;
  applicantId: string;
  /** Sections to suppress (used by the Decision tab to avoid duplicated data). */
  hiddenSections?: ConsolidatedCaseSection[];
}

interface Bundle {
  otherApplications: any[];
  licenses: any[];
  complaints: any[];
  enforcement: any[];
  pendingReturns: any[];
  prudentialBreaches: any[];
}

const empty: Bundle = {
  otherApplications: [],
  licenses: [],
  complaints: [],
  enforcement: [],
  pendingReturns: [],
  prudentialBreaches: [],
};

export function ConsolidatedCaseTab({ applicationId, applicantId, hiddenSections = [] }: Props) {
  const isHidden = (s: ConsolidatedCaseSection) => hiddenSections.includes(s);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Bundle>(empty);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Parallel: sibling apps + licenses held by same applicant
        const [appsRes, licRes] = await Promise.all([
          supabase
            .from('applications')
            .select('id, application_number, license_type, status, created_at, submitted_at')
            .eq('applicant_id', applicantId)
            .neq('id', applicationId)
            .order('created_at', { ascending: false })
            .limit(25),
          supabase
            .from('licenses')
            .select('id, license_number, license_type, status, issued_at, valid_until')
            .eq('holder_id', applicantId)
            .order('issued_at', { ascending: false })
            .limit(25),
        ]);

        const licenses = licRes.data || [];
        const licenseIds = licenses.map((l: any) => l.id);

        // Resolve entity ids linked to those licenses
        let entityIds: string[] = [];
        if (licenseIds.length) {
          const { data: ents } = await supabase
            .from('licensees')
            .select('id')
            .in('license_id', licenseIds);
          entityIds = (ents || []).map((e: any) => e.id);
        }

        const [compRes, enfRes, retRes, breachRes] = await Promise.all([
          entityIds.length
            ? supabase
                .from('complaints')
                .select('id, complaint_number, subject, status, created_at')
                .in('license_holder_id', entityIds)
                .neq('status', 'resolved')
                .order('created_at', { ascending: false })
                .limit(15)
            : Promise.resolve({ data: [] as any[] }),
          entityIds.length
            ? supabase
                .from('enforcement_actions')
                .select('id, case_number, enforcement_type, status, date_opened, penalty_amount')
                .in('entity_id', entityIds)
                .order('date_opened', { ascending: false })
                .limit(15)
            : Promise.resolve({ data: [] as any[] }),
          entityIds.length
            ? supabase
                .from('returns_filed')
                .select('id, unique_id, return_period, return_year, status, due_date, workflow_status')
                .in('entity_id', entityIds)
                .in('status', ['pending', 'draft', 'in_progress', 'overdue'])
                .order('due_date', { ascending: true })
                .limit(15)
            : Promise.resolve({ data: [] as any[] }),
          entityIds.length
            ? supabase
                .from('return_threshold_breaches' as any)
                .select('id, ratio_key, breach_severity, breach_value, threshold_value, created_at, returns_filed_id')
                .order('created_at', { ascending: false })
                .limit(10)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        if (cancelled) return;
        setData({
          otherApplications: appsRes.data || [],
          licenses,
          complaints: (compRes.data as any[]) || [],
          enforcement: (enfRes.data as any[]) || [],
          pendingReturns: (retRes.data as any[]) || [],
          prudentialBreaches: (breachRes.data as any[]) || [],
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [applicationId, applicantId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isEmpty =
    (isHidden('other_applications') || !data.otherApplications.length) &&
    (isHidden('licenses') || !data.licenses.length) &&
    (isHidden('complaints') || !data.complaints.length) &&
    (isHidden('enforcement') || !data.enforcement.length) &&
    (isHidden('pending_returns') || !data.pendingReturns.length) &&
    (isHidden('prudential_breaches') || !data.prudentialBreaches.length);

  if (isEmpty) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No related records found for this entity.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {!isHidden('other_applications') && data.otherApplications.length > 0 && (
        <Section
          icon={<FileText className="h-4 w-4" />}
          title="Other Applications"
          count={data.otherApplications.length}
        >
          <div className="space-y-2">
            {data.otherApplications.map((a) => (
              <RowLink key={a.id} to={`/applications/${a.id}`}>
                <div className="font-mono text-xs">{a.application_number}</div>
                <div className="flex-1 text-sm">{formatTaxonomyLabel(a.license_type)}</div>
                <Badge variant="outline" className="text-xs">{a.status}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleDateString()}
                </span>
              </RowLink>
            ))}
          </div>
        </Section>
      )}

      {!isHidden('licenses') && data.licenses.length > 0 && (
        <Section
          icon={<Shield className="h-4 w-4" />}
          title="Held Licenses"
          count={data.licenses.length}
        >
          <div className="space-y-2">
            {data.licenses.map((l) => (
              <RowLink key={l.id} to={`/licenses/${l.id}`}>
                <div className="font-mono text-xs">{l.license_number}</div>
                <div className="flex-1 text-sm">{formatTaxonomyLabel(l.license_type)}</div>
                <Badge variant="outline" className="text-xs">{l.status}</Badge>
                <span className="text-xs text-muted-foreground">
                  {l.valid_until ? `until ${new Date(l.valid_until).toLocaleDateString()}` : '—'}
                </span>
              </RowLink>
            ))}
          </div>
        </Section>
      )}

      {data.complaints.length > 0 && (
        <Section
          icon={<MessageSquareWarning className="h-4 w-4" />}
          title="Open Complaints"
          count={data.complaints.length}
          tone="warning"
        >
          <div className="space-y-2">
            {data.complaints.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded border px-3 py-2 text-sm">
                <div className="font-mono text-xs">{c.complaint_number}</div>
                <div className="flex-1 truncate">{c.subject}</div>
                <Badge variant="outline" className="text-xs">{c.status}</Badge>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.enforcement.length > 0 && (
        <Section
          icon={<Gavel className="h-4 w-4" />}
          title="Past Enforcement Actions"
          count={data.enforcement.length}
          tone="warning"
        >
          <div className="space-y-2">
            {data.enforcement.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded border px-3 py-2 text-sm">
                <div className="font-mono text-xs">{e.case_number}</div>
                <div className="flex-1">{e.enforcement_type}</div>
                <Badge variant="outline" className="text-xs">{e.status}</Badge>
                {e.penalty_amount ? (
                  <span className="text-xs text-muted-foreground">
                    ${Number(e.penalty_amount).toLocaleString()}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.pendingReturns.length > 0 && (
        <Section
          icon={<ClipboardList className="h-4 w-4" />}
          title="Pending Returns"
          count={data.pendingReturns.length}
        >
          <div className="space-y-2">
            {data.pendingReturns.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded border px-3 py-2 text-sm">
                <div className="font-mono text-xs">{r.unique_id}</div>
                <div className="flex-1">
                  {r.return_period} {r.return_year}
                </div>
                <Badge variant="outline" className="text-xs">{r.status}</Badge>
                <span className="text-xs text-muted-foreground">
                  {r.due_date ? `due ${new Date(r.due_date).toLocaleDateString()}` : '—'}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.prudentialBreaches.length > 0 && (
        <Section
          icon={<AlertTriangle className="h-4 w-4" />}
          title="Recent Prudential Breaches"
          count={data.prudentialBreaches.length}
          tone="warning"
        >
          <div className="space-y-2">
            {data.prudentialBreaches.map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded border px-3 py-2 text-sm">
                <div className="font-mono text-xs">{b.ratio_key}</div>
                <div className="flex-1">
                  {b.breach_value} vs {b.threshold_value}
                </div>
                <Badge variant="destructive" className="text-xs">{b.breach_severity}</Badge>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({
  icon, title, count, tone, children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  tone?: 'warning';
  children: React.ReactNode;
}) {
  return (
    <Card className={tone === 'warning' ? 'border-warning/40' : undefined}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {icon}
          {title}
          <Badge variant="secondary" className="ml-1">{count}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function RowLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
    >
      {children}
    </Link>
  );
}

export default ConsolidatedCaseTab;
