/**
 * Response Semantics — version-owned profiles.
 *
 * Ownership is shown explicitly: a profile belongs to this methodology version,
 * so changing meaning requires a new version rather than a silent edit.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useSupervisoryMethodologySemantics } from '@/hooks/useSupervisoryMethodologyAdmin';
import { EmptyPanel, ErrorPanel, humanize } from '../labels';

function ResponseMeaning({ meaning }: { meaning: Record<string, unknown> | null }) {
  const entries = Object.entries(meaning ?? {});
  if (!entries.length) return <p className="text-sm text-muted-foreground">No response meaning is recorded.</p>;
  return (
    <ul className="space-y-1.5">
      {entries.map(([k, v]) => (
        <li key={k} className="flex flex-wrap items-baseline gap-2 text-sm">
          <Badge variant="secondary" className="font-mono text-[11px]">{k}</Badge>
          <span className="text-foreground">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
        </li>
      ))}
    </ul>
  );
}

export function SemanticsTab({ methodologyId }: { methodologyId: string }) {
  const { data, isLoading, error } = useSupervisoryMethodologySemantics(methodologyId);
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) return <ErrorPanel error={error} />;
  if (!data?.length) return <EmptyPanel title="No response semantics profile is defined for this version." />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {data.length} response semantics {data.length === 1 ? 'profile is' : 'profiles are'} owned by this methodology version.
        Response meaning is version-owned: it cannot be changed without a new version.
      </p>
      {data.map((p) => (
        <Card key={p.id}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                <span className="font-mono">{p.semantic_code}</span>
                {p.label ? <span className="ml-2 font-normal text-muted-foreground">{p.label}</span> : null}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-1.5">
                {p.profile_version ? <Badge variant="outline">Profile version {p.profile_version}</Badge> : null}
                <Badge variant="outline">{p.question_count ?? 0} questions</Badge>
                {p.owner ? <Badge variant="secondary">Owned by {p.owner.code} v{p.owner.version}</Badge> : null}
              </div>
            </div>
            {p.description ? <p className="text-sm text-muted-foreground">{p.description}</p> : null}
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Response meaning</p>
            <ResponseMeaning meaning={p.response_meaning} />
            {p.owner ? (
              <p className="mt-3 text-xs text-muted-foreground">Origin: {humanize(p.owner.origin_label)}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
