/**
 * MC-08 — AI Governance overview.
 *
 * The institutional control panel: what AI is permitted to do, what it actually
 * did, where governance exceptions sit, and the stop control. Every figure comes
 * from a governed server operation; nothing here can change a regulatory record.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertTriangle, Ban, ClipboardCheck, Cpu, Gavel, Loader2, ScrollText, ShieldAlert, ShieldCheck,
} from 'lucide-react';
import {
  useAiGovernanceExceptions, useAiGovernanceOverview, useAiStopControlSet, useAiStopControls,
  useGovernanceEvents, useProhibitedActions,
} from '@/hooks/useAiGovernance';
import { EVENT_LABEL, EXCEPTION_LABEL, OBJECT_LABEL, label } from '@/lib/aiGovernanceLabels';
import { formatDateTime } from '@/lib/datetime';
import { useCan } from '@/hooks/useCan';

const Tile = ({ title, value, help, tone = 'default' }: {
  title: string; value: number | string; help?: string; tone?: 'default' | 'warn' | 'bad';
}) => (
  <Card>
    <CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className={`mt-1 font-mono text-2xl ${tone === 'bad' ? 'text-destructive' : tone === 'warn' ? 'text-amber-600' : ''}`}>{value}</p>
      {help && <p className="mt-1 text-xs text-muted-foreground">{help}</p>}
    </CardContent>
  </Card>
);

export default function AiGovernanceOverview() {
  const canApprove = useCan('ai_management', 'approve');
  const { data: o, isLoading } = useAiGovernanceOverview();
  const { data: exceptions = [] } = useAiGovernanceExceptions(100);
  const { data: stops = [] } = useAiStopControls();
  const { data: events = [] } = useGovernanceEvents(undefined, undefined, 20);
  const { data: prohibited = [] } = useProhibitedActions();
  const setStop = useAiStopControlSet();

  const [target, setTarget] = useState<{ scopeKey: string; scopeLabel: string; engage: boolean } | null>(null);
  const [reason, setReason] = useState('');

  const engaged = stops.filter((s) => s.is_engaged);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="AI Governance"
          helpSurface="ai-governance"
          description="How artificial intelligence is authorised, controlled, used and reviewed across supervision. AI assistance is advisory only: recorded facts and rule outcomes come first, AI may suggest wording, and a person always decides."
          actions={canApprove ? undefined : <Badge variant="outline">View only</Badge>}
        />

        <Card>
          <CardContent className="grid gap-3 p-4 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
            <p className="flex items-start gap-2"><ScrollText className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong className="text-foreground">Fact</strong> — the recorded regulatory position.</span></p>
            <p className="flex items-start gap-2"><Gavel className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong className="text-foreground">Rule outcome</strong> — what the deterministic rules produced.</span></p>
            <p className="flex items-start gap-2"><Cpu className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong className="text-foreground">AI suggestion</strong> — advisory wording, never a decision.</span></p>
            <p className="flex items-start gap-2"><ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong className="text-foreground">Human decision</strong> — the officer decides and is accountable.</span></p>
          </CardContent>
        </Card>

        {engaged.length > 0 && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>AI assistance is stopped</AlertTitle>
            <AlertDescription>
              {engaged.map((s) => (
                <p key={s.scope_key}>
                  <strong>{s.scope_label}</strong> — stopped {s.engaged_at ? formatDateTime(s.engaged_at) : ''}.
                  {s.engaged_reason ? ` Reason: ${s.engaged_reason}` : ''}
                </p>
              ))}
              <p className="mt-1">Regulatory records, deterministic rule outcomes and supervisory workflow are unaffected and remain fully available.</p>
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Preparing governance position…
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile title="AI assistance prepared" value={o?.prepared ?? 0} help="Advisory items recorded for review." />
              <Tile title="Awaiting human review" value={o?.awaiting_review ?? 0} tone={(o?.awaiting_review ?? 0) > 0 ? 'warn' : 'default'} help="No advisory item is used until an officer reviews it." />
              <Tile title="Accepted" value={o?.accepted ?? 0} />
              <Tile title="Modified" value={o?.modified ?? 0} help="Officer rewrote the wording before use." />
              <Tile title="Rejected" value={o?.rejected ?? 0} />
              <Tile title="Refused by governance" value={o?.governance_refusals ?? 0} help="Requests the control plane would not allow." />
              <Tile title="Discarded output" value={o?.refusals ?? 0} tone={(o?.refusals ?? 0) > 0 ? 'warn' : 'default'} help="Failed the grounding or content controls." />
              <Tile title="Service failures" value={o?.failures ?? 0} tone={(o?.failures ?? 0) > 0 ? 'bad' : 'default'} />
              <Tile title="Approved capabilities" value={o?.active_use_cases ?? 0} />
              <Tile title="Suspended capabilities" value={o?.suspended_use_cases ?? 0} tone={(o?.suspended_use_cases ?? 0) > 0 ? 'warn' : 'default'} />
              <Tile title="Open assurance reviews" value={o?.open_assurance ?? 0} />
              <Tile title="Control failures found" value={o?.assurance_control_failures ?? 0} tone={(o?.assurance_control_failures ?? 0) > 0 ? 'bad' : 'default'} />
            </div>
            <p className="text-xs text-muted-foreground">{o?.governance_caveat}</p>
          </>
        )}

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/governance/ai/activity">AI activity register</Link></Button>
        </div>


        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Ban className="h-4 w-4" /> AI stop control
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Stops AI assistance immediately for the chosen scope. Recorded facts, deterministic rule outcomes,
              queues, decisions and every supervisory workflow continue to operate exactly as before.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last change</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stops.map((s) => (
                  <TableRow key={s.scope_key}>
                    <TableCell className="font-medium">{s.scope_label}</TableCell>
                    <TableCell>
                      <Badge variant={s.is_engaged ? 'destructive' : 'default'}>
                        {s.is_engaged ? 'AI stopped' : 'AI available'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(s.updated_at)}
                      {s.is_engaged && s.engaged_reason ? ` — ${s.engaged_reason}` : ''}
                      {!s.is_engaged && s.released_note ? ` — ${s.released_note}` : ''}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={s.is_engaged ? 'outline' : 'destructive'}
                        disabled={!canApprove}
                        onClick={() => { setReason(''); setTarget({ scopeKey: s.scope_key, scopeLabel: s.scope_label, engage: !s.is_engaged }); }}
                      >
                        {s.is_engaged ? 'Reinstate AI assistance' : 'Stop AI assistance'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" /> Governance exceptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {exceptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No governance exceptions outstanding.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Exception</TableHead>
                    <TableHead>Capability</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exceptions.slice(0, 50).map((e) => (
                    <TableRow key={`${e.exception_code}-${e.activity_id}`}>
                      <TableCell>
                        <Badge variant={e.severity === 'high' ? 'destructive' : e.severity === 'medium' ? 'secondary' : 'outline'}>
                          {label(EXCEPTION_LABEL, e.exception_code)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{e.use_case_code ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(e.occurred_at)}</TableCell>
                      <TableCell className="text-xs">{e.detail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" /> Actions AI may never take
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {prohibited.map((p) => (
                <div key={p.code} className="rounded border p-2">
                  <p className="text-sm font-medium">{p.label}</p>
                  <p className="text-xs text-muted-foreground">{p.enforcement}</p>
                </div>
              ))}

              {prohibited.length === 0 && <p className="text-sm text-muted-foreground">No entries recorded.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent governance decisions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {events.map((e) => (
                <div key={e.id} className="rounded border p-2">
                  <p className="text-sm">
                    <strong>{label(EVENT_LABEL, e.event_type)}</strong>
                    {' — '}{label(OBJECT_LABEL, e.object_type)}{e.object_code ? ` · ${e.object_code}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(e.created_at)}
                    {e.rationale ? ` — ${e.rationale}` : ''}
                  </p>
                </div>
              ))}
              {events.length === 0 && <p className="text-sm text-muted-foreground">No governance decisions recorded yet.</p>}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{target?.engage ? 'Stop AI assistance' : 'Reinstate AI assistance'}</DialogTitle>
            <DialogDescription>
              {target?.scopeLabel}. {target?.engage
                ? 'This takes effect immediately for every AI request in scope. Regulatory records, rule outcomes and supervisory workflow are unaffected.'
                : 'AI assistance becomes available again in this scope.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason (recorded permanently)</label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4}
              placeholder="Set out why this decision is being taken." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button
              variant={target?.engage ? 'destructive' : 'default'}
              disabled={!reason.trim() || setStop.isPending}
              onClick={() => {
                if (!target) return;
                setStop.mutate(
                  { scopeKey: target.scopeKey, engage: target.engage, reason: reason.trim() },
                  { onSuccess: () => setTarget(null) },
                );
              }}
            >
              {setStop.isPending ? 'Saving…' : target?.engage ? 'Stop AI assistance' : 'Reinstate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
