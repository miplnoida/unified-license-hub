import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ConductSignal,
  DISPOSITION_LABELS,
  SETTABLE_DISPOSITIONS,
  SignalDisposition,
  useAddSignalEvidence,
  useReferSignalToInvestigation,
  useSetSignalDisposition,
  useSignalEvents,
  useSignalEvidence,
} from '@/hooks/useConductSurveillance';
import { ArrowUpRight, Loader2 } from 'lucide-react';

const SEV_VARIANT: Record<string, any> = {
  low: 'outline',
  medium: 'secondary',
  high: 'default',
  critical: 'destructive',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="col-span-2">{children}</span>
    </div>
  );
}

export function SignalDetailDrawer({
  signal,
  open,
  onOpenChange,
}: {
  signal: ConductSignal | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const events = useSignalEvents(signal?.id);
  const evidence = useSignalEvidence(signal?.id);
  const setDisposition = useSetSignalDisposition();
  const refer = useReferSignalToInvestigation();
  const addEvidence = useAddSignalEvidence();

  const [disposition, setLocalDisposition] = useState<SignalDisposition>('UNDER_REVIEW');
  const [reason, setReason] = useState('');
  const [allegation, setAllegation] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [evLabel, setEvLabel] = useState('');
  const [evNote, setEvNote] = useState('');

  useEffect(() => {
    setLocalDisposition('UNDER_REVIEW');
    setReason('');
    setAllegation(signal?.title ?? '');
    setPriority(signal?.severity === 'critical' || signal?.severity === 'high' ? 'high' : 'medium');
    setDueDate('');
    setEvLabel('');
    setEvNote('');
  }, [signal?.id]);

  if (!signal) return null;

  const locked = signal.disposition === 'ESCALATED' || signal.disposition === 'CLOSED';
  const reasonRequired = disposition === 'FALSE_POSITIVE' || disposition === 'CLOSED';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="pr-6">{signal.title}</SheetTitle>
          <SheetDescription>
            Surveillance signal · {signal.kind.replace(/_/g, ' ')} ·{' '}
            {new Date(signal.created_at).toLocaleString()}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant={SEV_VARIANT[signal.severity] || 'outline'} className="capitalize">
            {signal.severity}
          </Badge>
          <Badge variant="outline">{DISPOSITION_LABELS[signal.disposition] ?? signal.disposition}</Badge>
          {signal.rule_version != null && <Badge variant="outline">Rule v{signal.rule_version}</Badge>}
        </div>

        <Tabs defaultValue="detail" className="mt-4">
          <TabsList>
            <TabsTrigger value="detail">Detail</TabsTrigger>
            <TabsTrigger value="disposition">Disposition</TabsTrigger>
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="detail" className="pt-3">
            <Row label="Entity">
              {signal.licensee_id ? (
                <Link className="text-primary hover:underline" to={`/conduct/entities/${signal.licensee_id}`}>
                  {signal.licensees?.name || 'View entity'}
                </Link>
              ) : (
                '—'
              )}
            </Row>
            <Row label="Product">{signal.conduct_products?.name || '—'}</Row>
            <Row label="Channel">{signal.conduct_channels?.name || '—'}</Row>
            <Row label="Risk category">{signal.conduct_risk_categories?.name || '—'}</Row>
            <Row label="Instrument / reference">{signal.instrument_ref || '—'}</Row>
            <Row label="Observation window">
              {signal.observation_start
                ? `${new Date(signal.observation_start).toLocaleDateString()} → ${
                    signal.observation_end ? new Date(signal.observation_end).toLocaleDateString() : 'open'
                  }`
                : '—'}
            </Row>
            <Row label="Threshold">{signal.threshold_value ?? '—'}</Row>
            <Row label="Explanation">{signal.explanation || '—'}</Row>
            <Row label="Source records">
              {signal.source_record_ids?.length ? `${signal.source_record_ids.length} linked record(s)` : '—'}
            </Row>
            <Row label="Related complaint">
              {signal.complaint_id ? (
                <Link className="text-primary hover:underline" to={`/complaints/${signal.complaint_id}`}>
                  Open complaint
                </Link>
              ) : (
                '—'
              )}
            </Row>
            <Row label="Investigation">
              {signal.investigation_id ? (
                <Link
                  className="text-primary hover:underline inline-flex items-center gap-1"
                  to={`/conduct/investigations/${signal.investigation_id}`}
                >
                  Open investigation <ArrowUpRight className="h-3 w-3" />
                </Link>
              ) : (
                'Not referred'
              )}
            </Row>
          </TabsContent>

          <TabsContent value="disposition" className="pt-3 space-y-6">
            {locked ? (
              <p className="text-sm text-muted-foreground">
                This signal is {DISPOSITION_LABELS[signal.disposition].toLowerCase()} and can no longer be
                re-dispositioned. {signal.disposition_reason ? `Reason: ${signal.disposition_reason}` : ''}
              </p>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label>Set disposition</Label>
                  <Select value={disposition} onValueChange={(v) => setLocalDisposition(v as SignalDisposition)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SETTABLE_DISPOSITIONS.filter((d) => d !== signal.disposition).map((d) => (
                        <SelectItem key={d} value={d}>{DISPOSITION_LABELS[d]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reason {reasonRequired && <span className="text-destructive">*</span>}</Label>
                  <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
                <Button
                  data-rbac="market_conduct.edit"
                  disabled={setDisposition.isPending || (reasonRequired && !reason.trim())}
                  onClick={() =>
                    setDisposition.mutate(
                      { signal_id: signal.id, disposition, reason },
                      { onSuccess: () => setReason('') },
                    )
                  }
                >
                  {setDisposition.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Record disposition
                </Button>
              </div>
            )}

            <Separator />

            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-medium">Escalate to formal investigation</h4>
                <p className="text-xs text-muted-foreground">
                  Creates an investigation and preserves the signal, rule version and observation window as
                  provenance.
                </p>
              </div>
              {signal.investigation_id ? (
                <p className="text-sm text-muted-foreground">
                  Already referred —{' '}
                  <Link className="text-primary hover:underline" to={`/conduct/investigations/${signal.investigation_id}`}>
                    open the investigation
                  </Link>
                  .
                </p>
              ) : (
                <>
                  <div>
                    <Label>Allegation</Label>
                    <Textarea rows={3} value={allegation} onChange={(e) => setAllegation(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Priority</Label>
                      <Select value={priority} onValueChange={setPriority}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['low', 'medium', 'high', 'critical'].map((p) => (
                            <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Target completion</Label>
                      <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <Label>Referral reason</Label>
                    <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                  </div>
                  <Button
                    data-rbac="market_conduct.edit"
                    variant="secondary"
                    disabled={refer.isPending || !allegation.trim()}
                    onClick={() =>
                      refer.mutate({
                        signal_id: signal.id,
                        allegation,
                        reason,
                        priority,
                        due_date: dueDate || null,
                      })
                    }
                  >
                    {refer.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Refer to investigation
                  </Button>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="evidence" className="pt-3 space-y-4">
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Label</Label>
                  <Input value={evLabel} onChange={(e) => setEvLabel(e.target.value)} />
                </div>
                <div>
                  <Label>Note</Label>
                  <Input value={evNote} onChange={(e) => setEvNote(e.target.value)} />
                </div>
              </div>
              <Button
                data-rbac="market_conduct.edit"
                size="sm"
                disabled={!evLabel.trim() || addEvidence.isPending}
                onClick={() =>
                  addEvidence.mutate(
                    { signal_id: signal.id, label: evLabel, note: evNote },
                    { onSuccess: () => { setEvLabel(''); setEvNote(''); } },
                  )
                }
              >
                Add evidence record
              </Button>
            </div>
            <Separator />
            {evidence.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (evidence.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No evidence recorded for this signal.</p>
            ) : (
              <ul className="space-y-2">
                {evidence.data!.map((e) => (
                  <li key={e.id} className="rounded-md border p-2 text-sm">
                    <div className="font-medium">{e.label || 'Evidence'}</div>
                    {e.note && <div className="text-muted-foreground text-xs">{e.note}</div>}
                    <div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="history" className="pt-3">
            {events.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (events.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No disposition history yet.</p>
            ) : (
              <ol className="space-y-2">
                {events.data!.map((ev) => (
                  <li key={ev.id} className="rounded-md border p-2 text-sm">
                    <div className="font-medium">
                      {(ev.from_disposition
                        ? DISPOSITION_LABELS[ev.from_disposition as SignalDisposition] ?? ev.from_disposition
                        : 'Created')}{' '}
                      → {DISPOSITION_LABELS[ev.to_disposition as SignalDisposition] ?? ev.to_disposition}
                    </div>
                    {ev.reason && <div className="text-xs text-muted-foreground">{ev.reason}</div>}
                    <div className="text-xs text-muted-foreground">{new Date(ev.created_at).toLocaleString()}</div>
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
