/**
 * RDM-ENTITY-001 Wave B — Public entity detail (`/registry/entities/:slug`).
 * Content is filtered server-side by the entity's publication policy.
 */
import { useParams, Link } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { formatDateTime } from '@/lib/datetime';
import { usePublicEntityDetail } from '@/hooks/useWaveB';

export default function PublicEntityDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading } = usePublicEntityDetail(slug);
  const notFound = !isLoading && (!data || data.found === false);

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link to="/registry/entities" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to Entity Register
        </Link>

        {isLoading && <div className="py-16 text-center"><Loader2 className="inline h-6 w-6 animate-spin" /></div>}

        {notFound && (
          <Card><CardContent className="py-10 text-center text-muted-foreground">
            This entity is not published on the public register.
          </CardContent></Card>
        )}

        {data && data.found !== false && (
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-bold">{data.legal_name}</h1>
              {data.trading_name && data.trading_name !== data.legal_name && (
                <p className="text-sm text-muted-foreground">trading as {data.trading_name}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {data.sector && <Badge variant="outline">{data.sector}</Badge>}
                {data.entity_status && <Badge variant="outline">{data.entity_status}</Badge>}
                {data.publication_policy_label && <Badge variant="outline">{data.publication_policy_label}</Badge>}
              </div>
            </div>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Licences held</CardTitle></CardHeader>
              <CardContent>
                {data.licences.length === 0 && <p className="text-sm text-muted-foreground">Licence detail is not published for this entity.</p>}
                <div className="space-y-2">
                  {data.licences.map((l) => (
                    <div key={`${l.license_number}-${l.license_type}`} className="rounded border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-xs">{l.license_number}</span>
                        <Badge variant="outline" className="text-xs">{l.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {l.license_type || 'Licence'}
                        {l.valid_from ? ` · valid from ${formatDateTime(l.valid_from)}` : ''}
                        {l.valid_until ? ` · until ${formatDateTime(l.valid_until)}` : ''}
                        {l.is_primary ? ' · primary' : ''}
                      </p>
                      {l.conditions && <p className="mt-1 text-xs">Conditions: {l.conditions}</p>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {data.former_names?.length > 0 && (
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Previous names</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {data.former_names.map((n, idx) => (
                    <p key={`${n.name}-${idx}`}>{n.name} <span className="text-xs text-muted-foreground">· recorded {formatDateTime(n.recorded_at)}</span></p>
                  ))}
                </CardContent>
              </Card>
            )}

            {data.enforcement?.length > 0 && (
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Published enforcement</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {data.enforcement.map((e, idx) => (
                    <p key={idx}>{e.enforcement_type} — {e.status}
                      {e.date_opened ? <span className="text-xs text-muted-foreground"> · opened {e.date_opened}</span> : null}
                    </p>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
