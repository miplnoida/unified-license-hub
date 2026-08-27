import { useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ArrowUpCircle, CheckCircle2, UserCheck } from 'lucide-react';
import { PermissionGate } from '@/components/auth/PermissionGate';
import {
  SEVERITY_TONE,
  TIER_LABEL,
  humanise,
  useAcknowledgeEscalation,
  useEscalateTier,
  useEscalationDetail,
  useResolveEscalation,
  useTakeEscalationOwnership,
} from '@/hooks/useEscalations';

const dt = (v?: string | null) => (v ? new Date(v).toLocaleString() : '—');

interface Props {
  id: string | null;
  onOpenChange: (open: boolean) => void;
}

export function EscalationDetailDrawer({ id, onOpenChange }: Props) {
  const { data, isLoading } = useEscalationDetail(id);
  const ack = useAcknowledgeEscalation();
  const own = useTakeEscalationOwnership();
  const escalate = useEscalateTier();
  const resolve = useResolveEscalation();

  const [narrative, setNarrative] = useState('');
  const [rootCause, setRootCause] = useState('');

  const e = data?.escalation;
  const terminal = e?.status === 'resolved' || e?.status === 'closed';
  const busy = ack.isPending || own.isPending || escalate.isPending || resolve.isPending;

  return (
    <Sheet open={!!id} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{e?.escalation_ref ?? 'Escalation'}</SheetTitle>
        </SheetHeader>

        {isLoading || !e ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 pt-4">
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant="outline" className={SEVERITY_TONE[e.severity]}>{e.severity}</Badge>
              <Badge variant="outline">{humanise(e.status)}</Badge>
              <Badge variant="outline">{TIER_LABEL[e.current_tier] ?? `Tier ${e.current_tier}`}</Badge>
              <Badge variant="outline">{humanise(e.source_module)}</Badge>
            </div>

            <Card>
              <CardContent className="pt-4 text-sm grid gap-2 sm:grid-cols-2">
                <div><span className="text-muted-foreground">Type:</span> {humanise(e.escalation_type)}</div>
                <div><span className="text-muted-foreground">Rule:</span> {data.rule?.name ?? '—'}</div>
                <div><span className="text-muted-foreground">Source event:</span> {e.source_event}</div>
                <div><span className="text-muted-foreground">Source ref:</span> {e.source_reference ?? '—'}</div>
                <div><span className="text-muted-foreground">Owner:</span> {e.owner_name ?? e.assigned_role ?? 'Unassigned'}</div>
                <div><span className="text-muted-foreground">Raised:</span> {dt(e.created_at)}</div>
                <div><span className="text-muted-foreground">Acknowledge by:</span> {dt(e.acknowledgement_deadline)}</div>
                <div><span className="text-muted-foreground">Acknowledged:</span> {e.acknowledged_at ? `${dt(e.acknowledged_at)} — ${e.acknowledged_by_name ?? ''}` : 'Not yet'}</div>
                <div><span className="text-muted-foreground">Resolve by:</span> {dt(e.resolution_deadline)}</div>
                <div><span className="text-muted-foreground">Resolved:</span> {e.resolved_at ? `${dt(e.resolved_at)} — ${e.resolved_by_name ?? ''}` : '—'}</div>
              </CardContent>
            </Card>

            {!terminal && (
              <div className="flex flex-wrap gap-2">
                <PermissionGate module="escalation_management" action="acknowledge">
                  <Button size="sm" variant="outline" disabled={busy || !!e.acknowledged_at}
                    onClick={() => ack.mutate({ id: e.id })}>
                    <CheckCircle2 className="h-4 w-4 mr-2" />Acknowledge
                  </Button>
                </PermissionGate>
                <PermissionGate module="escalation_management" action="own">
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => own.mutate({ id: e.id })}>
                    <UserCheck className="h-4 w-4 mr-2" />Take ownership
                  </Button>
                </PermissionGate>
                <PermissionGate module="escalation_management" action="escalate">
                  <Button size="sm" variant="outline" disabled={busy || e.current_tier >= 3}
                    onClick={() => escalate.mutate({ id: e.id })}>
                    <ArrowUpCircle className="h-4 w-4 mr-2" />Escalate tier
                  </Button>
                </PermissionGate>
              </div>
            )}

            {!terminal && (
              <PermissionGate module="escalation_management" action="resolve">
                <Card>
                  <CardContent className="pt-4 space-y-3">
                    <div>
                      <Label>Root cause</Label>
                      <Textarea rows={2} value={rootCause} onChange={(ev) => setRootCause(ev.target.value)} />
                    </div>
                    <div>
                      <Label>Resolution narrative <span className="text-destructive">*</span></Label>
                      <Textarea rows={4} value={narrative} onChange={(ev) => setNarrative(ev.target.value)}
                        placeholder="Describe what was done, the outcome, and any follow-up (minimum 50 characters)." />
                      <div className="text-xs text-muted-foreground mt-1">{narrative.trim().length}/50 characters</div>
                    </div>
                    <div className="flex gap-2">
                      <Button data-rbac="complaint_management.edit" size="sm" disabled={busy || narrative.trim().length < 50}
                        onClick={() => resolve.mutate({ id: e.id, narrative, rootCause })}>
                        {resolve.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Resolve
                      </Button>
                      <GuardedButton module="complaint_management" action="edit" data-rbac="complaint_management.edit" size="sm" variant="outline" disabled={busy || narrative.trim().length < 50}
                        onClick={() => resolve.mutate({ id: e.id, narrative, rootCause, close: true })}>
                        Resolve &amp; close
                      </GuardedButton>
                    </div>
                  </CardContent>
                </Card>
              </PermissionGate>
            )}

            {terminal && (
              <Card>
                <CardContent className="pt-4 text-sm space-y-2">
                  <div className="font-medium">Resolution</div>
                  <div><span className="text-muted-foreground">Root cause:</span> {e.root_cause ?? '—'}</div>
                  <div className="whitespace-pre-wrap">{e.resolution_narrative ?? '—'}</div>
                </CardContent>
              </Card>
            )}

            <Separator />

            <Tabs defaultValue="tiers">
              <TabsList>
                <TabsTrigger value="tiers">Tier history</TabsTrigger>
                <TabsTrigger value="ownership">Ownership</TabsTrigger>
                <TabsTrigger value="notifications">Notifications</TabsTrigger>
                <TabsTrigger value="source">Source event</TabsTrigger>
              </TabsList>

              <TabsContent value="tiers" className="mt-3 space-y-2">
                {(data.tier_history ?? []).map((t: any) => (
                  <Card key={t.id}><CardContent className="pt-3 text-sm space-y-1">
                    <div className="font-medium">
                      {t.from_tier === null ? 'Raised' : `${TIER_LABEL[t.from_tier]} → ${TIER_LABEL[t.to_tier]}`}
                      {' · '}<span className="text-muted-foreground">{humanise(t.trigger_source)}</span>
                    </div>
                    <div>{t.reason}</div>
                    <div className="text-xs text-muted-foreground">
                      {dt(t.created_at)} · Notified: {t.recipient_role ?? '—'}
                      {t.actor_name ? ` · By ${t.actor_name}` : ''}
                    </div>
                  </CardContent></Card>
                ))}
                {!(data.tier_history ?? []).length && <p className="text-sm text-muted-foreground">No tier changes recorded.</p>}
              </TabsContent>

              <TabsContent value="ownership" className="mt-3 space-y-2">
                {(data.ownership_history ?? []).map((o: any) => (
                  <Card key={o.id}><CardContent className="pt-3 text-sm space-y-1">
                    <div className="font-medium">{humanise(o.event_type)}</div>
                    {o.note && <div className="whitespace-pre-wrap">{o.note}</div>}
                    <div className="text-xs text-muted-foreground">
                      {dt(o.created_at)}{o.to_name ? ` · ${o.to_name}` : ''}{o.actor_name ? ` · By ${o.actor_name}` : ''}
                    </div>
                  </CardContent></Card>
                ))}
                {!(data.ownership_history ?? []).length && <p className="text-sm text-muted-foreground">No ownership changes yet.</p>}
              </TabsContent>

              <TabsContent value="notifications" className="mt-3 space-y-2">
                {(data.notification_history ?? []).map((n: any) => (
                  <div key={n.id} className="text-sm border rounded p-2">
                    <div className="flex justify-between gap-2">
                      <span>{humanise(n.event_key)} · {n.channel}</span>
                      <Badge variant="outline">{humanise(n.outcome)}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {TIER_LABEL[n.tier] ?? `Tier ${n.tier}`} · {n.recipient_name ?? n.recipient_role ?? '—'} · {dt(n.created_at)}
                    </div>
                  </div>
                ))}
                {!(data.notification_history ?? []).length && <p className="text-sm text-muted-foreground">No notifications recorded.</p>}
                {!!(data.delivery_records ?? []).length && (
                  <div className="pt-2">
                    <div className="text-xs font-medium text-muted-foreground mb-1">Delivery log</div>
                    {data.delivery_records.map((d: any) => (
                      <div key={d.id} className="text-xs border rounded p-2 mb-1">
                        {d.channel} · {d.status} · {d.recipient_email ?? '—'} · {dt(d.created_at)}
                        {d.error ? <div className="text-destructive">{d.error}</div> : null}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="source" className="mt-3">
                <Card><CardContent className="pt-3 text-sm space-y-1">
                  <div><span className="text-muted-foreground">Module:</span> {humanise(data.source_event?.module)}</div>
                  <div><span className="text-muted-foreground">Event:</span> {data.source_event?.event}</div>
                  <div><span className="text-muted-foreground">Entity:</span> {data.source_event?.entity_type ?? '—'} {data.source_event?.entity_id ?? ''}</div>
                  <div><span className="text-muted-foreground">Reference:</span> {data.source_event?.reference ?? '—'}</div>
                  <div><span className="text-muted-foreground">Correlation ID:</span> <span className="font-mono text-xs">{data.source_event?.correlation_id ?? '—'}</span></div>
                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">{JSON.stringify(data.source_event?.metadata ?? {}, null, 2)}</pre>
                </CardContent></Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default EscalationDetailDrawer;
