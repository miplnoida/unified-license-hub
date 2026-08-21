/**
 * Entity 360 — onboarding & identity activity for a canonical entity.
 * Data comes from the governed `entity_onboarding_activity` RPC, which enforces
 * the onboarding audit permission server-side.
 */
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Search, UserCheck, GitMerge } from 'lucide-react';
import { formatDateTime } from '@/lib/datetime';
import { useEntityOnboardingActivity } from '@/hooks/useOnboardingAudit';

const outcomeTone = (o: string) =>
  o === 'EXACT_MATCH' ? 'default' : o === 'POSSIBLE_MATCH' ? 'secondary' : 'outline';

export function OnboardingActivityPanel({ entityId }: { entityId: string }) {
  const { data, isLoading, error } = useEntityOnboardingActivity(entityId);

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /></div>;
  }
  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Onboarding activity is restricted to users with onboarding audit access.
        </CardContent>
      </Card>
    );
  }

  const matches = data?.identity_matches ?? [];
  const memberships = data?.membership_requests ?? [];
  const cases = data?.resolution_cases ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" /> Identity search activity</CardTitle>
          <CardDescription>Every attempt to identify this organisation during registration.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {matches.length === 0 && <p className="text-sm text-muted-foreground">No identification attempts recorded.</p>}
          {matches.map((m) => (
            <div key={m.event_reference} className="grid gap-1 rounded border p-2 text-sm sm:grid-cols-3">
              <div>
                <div className="font-medium">{m.searched_legal_name || '—'}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{m.event_reference}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                <Badge variant={outcomeTone(m.outcome)} className="mr-1.5 text-[10px]">{m.outcome}</Badge>
                {m.journey_type} {m.match_basis ? `· ${m.match_basis}` : ''}
              </div>
              <div className="text-xs text-muted-foreground sm:text-right">
                {m.user_email || 'unknown user'} · {formatDateTime(m.occurred_at)}
                {m.follow_up_action ? <div>follow-up: {m.follow_up_action}</div> : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><UserCheck className="h-4 w-4" /> Access requests</CardTitle>
          <CardDescription>Users who requested authority to act for this organisation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {memberships.length === 0 && <p className="text-sm text-muted-foreground">No access requests recorded.</p>}
          {memberships.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded border p-2 text-sm">
              <span>{m.user_email || 'unknown user'} <span className="text-xs text-muted-foreground">· {m.role || '—'}</span></span>
              <span className="text-xs text-muted-foreground">
                <Badge variant="outline" className="mr-1.5 text-[10px]">{m.status}</Badge>
                {formatDateTime(m.requested_at)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><GitMerge className="h-4 w-4" /> Resolution cases</CardTitle>
          <CardDescription>Officer-decided identity matches affecting this organisation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {cases.length === 0 && <p className="text-sm text-muted-foreground">No resolution cases recorded.</p>}
          {cases.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded border p-2 text-sm">
              <span className="font-mono text-xs">{c.case_number}</span>
              <span className="text-xs text-muted-foreground">
                {c.subject_name} · <Badge variant="outline" className="text-[10px]">{c.status}</Badge> {formatDateTime(c.created_at)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default OnboardingActivityPanel;
