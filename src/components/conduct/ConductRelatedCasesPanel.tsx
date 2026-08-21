/**
 * P08 closure — canonical Related Cases for a conduct object.
 *
 * Every row comes from `conduct_related_cases`, which joins only on real
 * canonical link columns (source complaint/alert, investigations, findings,
 * remediation actions, enforcement cases sourced from conduct and canonical
 * correspondence threads). Nothing is inferred in the browser.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Loader2 } from 'lucide-react';

interface RelatedRow {
  id: string;
  label: string;
  status?: string | null;
  detail?: string | null;
  href?: string | null;
}

interface ConductRelatedCases {
  groups?: Array<{ key: string; label: string; rows: RelatedRow[] }>;
  source?: RelatedRow | null;
  investigations?: RelatedRow[];
  alerts?: RelatedRow[];
  complaints?: RelatedRow[];
  findings?: RelatedRow[];
  actions?: RelatedRow[];
  enforcement?: RelatedRow[];
  correspondence?: RelatedRow[];
}

const FALLBACK_GROUPS: Array<{ key: keyof ConductRelatedCases; label: string }> = [
  { key: 'complaints', label: 'Complaints' },
  { key: 'alerts', label: 'Conduct alerts' },
  { key: 'investigations', label: 'Investigations' },
  { key: 'findings', label: 'Findings' },
  { key: 'actions', label: 'Remediation actions' },
  { key: 'enforcement', label: 'Enforcement' },
];

export function ConductRelatedCasesPanel({
  objectType,
  objectId,
}: {
  /** Canonical conduct object type, e.g. conduct_investigation | complaint | conduct_alert. */
  objectType: string;
  objectId: string;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['conduct-related-cases', objectType, objectId],
    enabled: !!objectId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('conduct_related_cases', {
        _object_type: objectType,
        _object_id: objectId,
      });
      if (error) throw new Error(error.message);
      return (data ?? {}) as ConductRelatedCases;
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

  const groups = data.groups?.length
    ? data.groups
    : [
        ...(data.source ? [{ key: 'source', label: 'Originating record', rows: [data.source] }] : []),
        ...FALLBACK_GROUPS.map((g) => ({
          key: String(g.key),
          label: g.label,
          rows: ((data[g.key] as RelatedRow[] | undefined) ?? []),
        })),
      ];

  const correspondence = data.correspondence ?? [];
  const total = groups.reduce((n, g) => n + (g.rows?.length ?? 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Related cases</CardTitle>
          <CardDescription>
            Only genuinely linked regulatory records are shown — {total} linked record(s). Each record
            keeps its own lifecycle in its own module.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {total === 0 && (
            <p className="text-sm text-muted-foreground">No other regulatory record is linked yet.</p>
          )}
          {groups.filter((g) => (g.rows?.length ?? 0) > 0).map((g) => (
            <div key={g.key} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label}</p>
              <div className="space-y-1">
                {g.rows.map((r) => (
                  <div key={`${g.key}-${r.id}`} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="truncate">{r.label}</span>
                      {r.detail && <div className="text-xs text-muted-foreground">{r.detail}</div>}
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
                <span className="truncate">{t.label}</span>
                {t.detail && <div className="text-xs text-muted-foreground">{t.detail}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {t.status && <Badge variant="secondary" className="text-[10px] capitalize">{t.status.replace(/_/g, ' ')}</Badge>}
                <Button asChild variant="ghost" size="sm">
                  <Link to={t.href ?? `/correspondence/${t.id}`}>Open<ExternalLink className="ml-1 h-3 w-3" /></Link>
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
