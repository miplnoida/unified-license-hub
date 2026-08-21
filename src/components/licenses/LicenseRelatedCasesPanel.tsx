/**
 * P04 A.23 / A.24 — canonical Related Cases and Correspondence for a licence.
 *
 * Every row comes from `license_related_cases`, which joins only on real
 * canonical link columns (originating application, lifecycle matters,
 * conditions, F&P roles and appeals, supervisory plans, enforcement cases
 * sourced from the licence, decision appeals and canonical correspondence
 * threads). Nothing is inferred, and correspondence is read from the canonical
 * Omni-Comms thread store — the licence workspace keeps no message store.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink } from 'lucide-react';

interface RelatedCases {
  originating_application: { id: string; status: string; created_at: string; href: string } | null;
  lifecycle_matters: Array<{ id: string; matter_kind: string; stage: string; status: string; source_kind: string | null }>;
  conditions: Array<{ id: string; status: string; description: string }>;
  fp_roles: Array<{ id: string; person_id: string; href: string }>;
  fp_appeals: Array<{ id: string; status: string }>;
  supervisory_plans: Array<{ id: string; status: string }>;
  enforcement: Array<{ id: string; case_number: string | null; status: string; href: string }>;
  decision_appeals: Array<{ id: string; status: string }>;
  correspondence: Array<{ id: string; subject: string | null; status: string; thread_type: string | null; href: string }>;
}

export default function LicenseRelatedCasesPanel({ licenseId }: { licenseId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['license-related-cases', licenseId],
    enabled: !!licenseId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('license_related_cases' as never, {
        _license_id: licenseId,
      } as never);
      if (error) throw new Error(error.message);
      return data as unknown as RelatedCases;
    },
  });

  if (isLoading) {
    return (
      <Card><CardContent className="text-muted-foreground p-8 text-center text-sm">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading related regulatory records…
      </CardContent></Card>
    );
  }
  if (error || !data) {
    return (
      <Card><CardContent className="text-muted-foreground p-8 text-center text-sm">
        Related regulatory records could not be loaded.
      </CardContent></Card>
    );
  }

  const groups: Array<{ label: string; rows: Array<{ key: string; primary: string; secondary?: string; href?: string }> }> = [
    {
      label: 'Originating application',
      rows: data.originating_application
        ? [{
            key: data.originating_application.id,
            primary: `Application ${data.originating_application.id.slice(0, 8)}`,
            secondary: data.originating_application.status,
            href: data.originating_application.href,
          }]
        : [],
    },
    {
      label: 'Lifecycle matters',
      rows: (data.lifecycle_matters ?? []).map((m) => ({
        key: m.id,
        primary: m.matter_kind.replace(/_/g, ' '),
        secondary: `${m.stage} · ${m.status}${m.source_kind ? ` · from ${m.source_kind.replace(/_/g, ' ')}` : ''}`,
      })),
    },
    {
      label: 'Licence conditions',
      rows: (data.conditions ?? []).map((c) => ({ key: c.id, primary: c.description || 'Condition', secondary: c.status })),
    },
    {
      label: 'Fit & proper roles',
      rows: (data.fp_roles ?? []).map((r) => ({ key: r.id, primary: 'Key person role', href: r.href })),
    },
    {
      label: 'Fit & proper appeals',
      rows: (data.fp_appeals ?? []).map((a) => ({ key: a.id, primary: 'F&P appeal', secondary: a.status })),
    },
    {
      label: 'Supervisory plans',
      rows: (data.supervisory_plans ?? []).map((p) => ({ key: p.id, primary: 'Supervisory plan', secondary: p.status })),
    },
    {
      label: 'Enforcement',
      rows: (data.enforcement ?? []).map((e) => ({
        key: e.id, primary: e.case_number ?? 'Enforcement case', secondary: e.status, href: e.href,
      })),
    },
    {
      label: 'Decision appeals',
      rows: (data.decision_appeals ?? []).map((a) => ({ key: a.id, primary: 'Decision appeal', secondary: a.status })),
    },
  ];

  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Related cases</CardTitle>
          <CardDescription>
            Only genuinely linked regulatory records are shown. {total} linked record(s).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {total === 0 && (
            <p className="text-muted-foreground text-sm">
              No other regulatory record is linked to this licence yet.
            </p>
          )}
          {groups.filter((g) => g.rows.length > 0).map((g) => (
            <div key={g.label} className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{g.label}</p>
              <div className="space-y-1">
                {g.rows.map((r) => (
                  <div key={r.key} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <div>
                      <span className="capitalize">{r.primary}</span>
                      {r.secondary && (
                        <span className="text-muted-foreground ml-2 text-xs capitalize">{r.secondary}</span>
                      )}
                    </div>
                    {r.href && (
                      <Button asChild variant="ghost" size="sm">
                        <Link to={r.href}>Open <ExternalLink className="ml-1 h-3 w-3" /></Link>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Correspondence</CardTitle>
          <CardDescription>
            Canonical correspondence threads sourced from this licence — renewal reminders,
            verification requests, RFIs, condition reminders, notices, representations and decision
            letters all live in the central correspondence store.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data.correspondence ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No correspondence thread is linked to this licence yet.
            </p>
          ) : (
            data.correspondence.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <div>
                  <span>{t.subject ?? 'Correspondence thread'}</span>
                  <div className="text-muted-foreground text-xs">
                    {t.thread_type ?? 'thread'} · <Badge variant="secondary">{t.status}</Badge>
                  </div>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link to={t.href}>Open <ExternalLink className="ml-1 h-3 w-3" /></Link>
                </Button>
              </div>
            ))
          )}
          <Button asChild variant="outline" size="sm">
            <Link to="/correspondence">Open correspondence workspace</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
