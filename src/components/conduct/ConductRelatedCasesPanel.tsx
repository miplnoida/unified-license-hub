/**
 * P08 closure — canonical Related Cases for a conduct case.
 *
 * Every row comes from `conduct_related_cases`, which joins only on real
 * canonical link columns (source complaint, investigations, alerts, findings,
 * remediation actions, enforcement cases sourced from conduct, and canonical
 * correspondence threads). Nothing is inferred in the browser, and each linked
 * record keeps its own lifecycle in its own module.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/datetime';
import { ExternalLink, Loader2 } from 'lucide-react';

interface ConductRelatedCases {
  case_type: string;
  case_id: string;
  entity: { id: string; name: string | null; href: string } | null;
  enforcement: Array<{ id: string; case_number: string | null; status: string; source_kind: string | null; href: string }>;
  investigations: Array<{ id: string; code: string | null; status: string; href: string }>;
  complaints: Array<{ id: string; reference: string | null; status: string; href: string }>;
  alerts: Array<{ id: string; title: string | null; status: string; severity: string | null; href: string }>;
  findings: Array<{ id: string; reference: string | null; title: string | null; status: string; risk_rating: string | null; href: string }>;
  remediation_actions: Array<{ id: string; title: string | null; status: string; due_date: string | null; href: string }>;
  correspondence: Array<{ id: string; reference: string | null; subject: string | null; thread_state: string; last_activity_at: string | null; href: string }>;
}

interface Row { key: string; primary: string; secondary?: string | null; status?: string | null; href?: string | null }

export function ConductRelatedCasesPanel({
  caseType,
  caseId,
}: {
  /** Canonical conduct case type: complaint | conduct_investigation. */
  caseType: 'complaint' | 'conduct_investigation';
  caseId: string;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['conduct-related-cases', caseType, caseId],
    enabled: !!caseId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('conduct_related_cases', {
        _case_type: caseType,
        _case_id: caseId,
      });
      if (error) throw new Error(error.message);
      return data as ConductRelatedCases;
    },
  });

  if (isLoading) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading related regulatory records…
      </CardContent></Card>
    );
  }
  if (error || !data) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
        Related regulatory records could not be loaded.
      </CardContent></Card>
    );
  }

  const groups: Array<{ label: string; rows: Row[] }> = [
    {
      label: 'Regulated entity',
      rows: data.entity
        ? [{ key: data.entity.id, primary: data.entity.name ?? 'Regulated entity', href: data.entity.href }]
        : [],
    },
    {
      label: 'Complaints',
      rows: (data.complaints ?? []).map((c) => ({
        key: c.id, primary: c.reference ?? 'Complaint', status: c.status, href: c.href,
      })),
    },
    {
      label: 'Conduct alerts',
      rows: (data.alerts ?? []).map((a) => ({
        key: a.id, primary: a.title ?? 'Conduct alert', secondary: a.severity, status: a.status, href: a.href,
      })),
    },
    {
      label: 'Investigations',
      rows: (data.investigations ?? []).map((i) => ({
        key: i.id, primary: i.code ?? 'Investigation', status: i.status, href: i.href,
      })),
    },
    {
      label: 'Findings',
      rows: (data.findings ?? []).map((f) => ({
        key: f.id,
        primary: f.reference ? `${f.reference} — ${f.title ?? 'Finding'}` : (f.title ?? 'Finding'),
        secondary: f.risk_rating ? `Risk: ${f.risk_rating}` : null,
        status: f.status,
        href: f.href,
      })),
    },
    {
      label: 'Remediation actions',
      rows: (data.remediation_actions ?? []).map((a) => ({
        key: a.id,
        primary: a.title ?? 'Remediation action',
        secondary: a.due_date ? `Due ${a.due_date}` : null,
        status: a.status,
        href: a.href,
      })),
    },
    {
      label: 'Enforcement',
      rows: (data.enforcement ?? []).map((e) => ({
        key: e.id,
        primary: e.case_number ?? 'Enforcement case',
        secondary: e.source_kind ? `From ${e.source_kind.replace(/_/g, ' ').toLowerCase()}` : null,
        status: e.status,
        href: e.href,
      })),
    },
  ];

  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const correspondence = data.correspondence ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Related cases</CardTitle>
          <CardDescription>
            Only genuinely linked regulatory records are shown — {total} linked record(s). Each record keeps
            its own lifecycle in its own module.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {total === 0 && (
            <p className="text-sm text-muted-foreground">No other regulatory record is linked to this case yet.</p>
          )}
          {groups.filter((g) => g.rows.length > 0).map((g) => (
            <div key={g.label} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label}</p>
              <div className="space-y-1">
                {g.rows.map((r) => (
                  <div key={`${g.label}-${r.key}`} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate">{r.primary}</div>
                      {r.secondary && <div className="text-xs capitalize text-muted-foreground">{r.secondary}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {r.status && <Badge variant="secondary" className="text-[10px] capitalize">{r.status.replace(/_/g, ' ')}</Badge>}
                      {r.href && (
                        <Button asChild variant="ghost" size="sm">
                          <Link to={r.href}>Open<ExternalLink className="ml-1 h-3 w-3" /></Link>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Correspondence</CardTitle>
          <CardDescription>
            Canonical correspondence threads linked to this case. Messages live only in the central
            correspondence store — this workspace keeps no separate message log.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {correspondence.length === 0 ? (
            <p className="text-sm text-muted-foreground">No correspondence thread is linked to this case yet.</p>
          ) : correspondence.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate">{t.subject ?? 'Correspondence thread'}</div>
                <div className="text-xs text-muted-foreground">
                  {t.reference ?? '—'}
                  {t.last_activity_at ? ` · last activity ${formatDateTime(t.last_activity_at)}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="secondary" className="text-[10px] capitalize">{t.thread_state.replace(/_/g, ' ')}</Badge>
                <Button asChild variant="ghost" size="sm">
                  <Link to={t.href}>Open<ExternalLink className="ml-1 h-3 w-3" /></Link>
                </Button>
              </div>
            </div>
          ))}
          <Button asChild variant="outline" size="sm">
            <Link to="/correspondence/inbox">Open correspondence work queue</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default ConductRelatedCasesPanel;
