/**
 * Entity 360 → Reporting & currency.
 *
 * The single authority for an entity's regulatory reporting currency. Where no
 * override exists the panel states plainly that the entity inherits the
 * regulator's base currency — it never stores a redundant "default" row.
 * Overrides are effective-dated and superseded, never destructively edited, and
 * every change is made through a governed audited RPC.
 */
import { useState } from 'react';
import { Coins, History, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ReasonDialog, type ReasonDialogRequest } from '@/components/governance/ReasonDialog';
import { formatDateOnly, formatDateTime } from '@/lib/datetime';

import {
  CURRENCY_APPROVAL_MODE_LABELS, CURRENCY_PROFILE_STATUS_LABELS, CURRENCY_SOURCE_LABELS,
  useCurrencyMaster, useEntityCurrencyMutations, useEntityCurrencyOverview,
} from '@/hooks/useEntityCurrency';

export function EntityReportingCurrencyPanel({ entityId, asOf }: { entityId: string; asOf?: string | null }) {
  const asOfDate = asOf ? asOf.slice(0, 10) : null;
  const { data, isLoading, error } = useEntityCurrencyOverview(entityId, asOfDate);
  const { data: currencies = [] } = useCurrencyMaster();
  const { setOverride, supersedeOverride, decideOverride, withdrawProposal } = useEntityCurrencyMutations();


  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [reason, setReason] = useState('');
  const [decision, setDecision] = useState<ReasonDialogRequest | null>(null);
  const [bodyId, setBodyId] = useState<string | null>(null);


  if (isLoading) {
    return <Card><CardContent className="py-10 text-center"><Loader2 className="inline h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }
  if (error || !data) {
    return (
      <Card><CardContent className="py-8 text-center text-sm text-destructive">
        {(error as Error)?.message?.includes('FORBIDDEN')
          ? 'You do not have access to this entity\u2019s reporting currency.'
          : (error as Error)?.message ?? 'Reporting currency could not be resolved.'}
      </CardContent></Card>
    );
  }

  const bodies = data.regulator_bodies ?? [];
  // Each applicable regulator body carries its own monetary configuration,
  // override history and approval control, so the panel is always scoped to one
  // canonical regulator body (regulators.id) at a time.
  const selectedBody =
    bodies.find((b) => b.regulator_id === bodyId) ??
    bodies.find((b) => b.regulator_id === data.regulator_id) ??
    bodies[0] ?? null;
  const scopedRegulatorId = selectedBody?.regulator_id ?? data.regulator_id ?? null;
  const scopedHistory = selectedBody ? selectedBody.overrides ?? [] : data.history;
  const activeProfileId = selectedBody
    ? selectedBody.entity_currency_profile_id ?? null
    : data.entity_currency_profile_id;
  const activeProfile = scopedHistory.find((p) => p.id === activeProfileId) ?? null;
  const canManage = !!data.can_manage;
  const approvalMode = selectedBody?.approval_mode ?? data.approval_mode ?? 'DIRECT_AUTHORIZED';
  const makerChecker = approvalMode === 'MAKER_CHECKER';
  const pending = (selectedBody ? selectedBody.pending_proposals : data.pending_proposals) ?? [];
  const configurationRequired = !!selectedBody && !selectedBody.monetary_config_present;
  const resolvedCurrency = selectedBody ? selectedBody.currency ?? null : data.currency;
  const resolvedSource = (selectedBody ? selectedBody.source : data.source) ?? null;
  const baseCurrency = selectedBody?.base_currency ?? data.regulator_base_currency;
  const consolidatedCurrency = selectedBody?.reporting_currency ?? data.regulator_reporting_currency;

  const submitOverride = async () => {
    if (!code || !effectiveFrom || reason.trim().length < 10) {
      toast.error('Select a currency, an effective date and give a reason of at least 10 characters.');
      return;
    }
    try {
      const res = await setOverride.mutateAsync({
        entityId, currency: code, effectiveFrom, reason: reason.trim(), regulatorId: scopedRegulatorId,
      });
      toast.success(res?.status === 'PROPOSED'
        ? `Override to ${code} proposed. It takes effect only once an independent approver accepts it.`
        : `Reporting currency override set to ${code}.`);
      setOpen(false); setCode(''); setEffectiveFrom(''); setReason('');
    } catch (e: any) {
      toast.error(e?.message ?? 'The override could not be set.');
    }
  };

  const decide = (p: { id: string; reporting_currency_override: string; effective_from: string; reason?: string | null }, decision: 'APPROVE' | 'REJECT') =>
    setDecision({
      title: decision === 'APPROVE' ? 'Approve reporting currency override' : 'Reject proposed reporting currency override',
      description: decision === 'APPROVE'
        ? 'Approving activates this override from its effective date. Filings already opened keep the currency recorded at the time.'
        : 'Rejecting leaves the entity on its current reporting currency. The proposal is retained in history.',
      context: [
        { label: 'Proposed currency', value: <span className="font-mono">{p.reporting_currency_override}</span> },
        { label: 'Effective from', value: formatDateOnly(p.effective_from) },
        { label: 'Proposal reason', value: p.reason ?? '—' },
        { label: 'Current reporting currency', value: <span className="font-mono">{resolvedCurrency ?? '—'}</span> },
      ],
      confirmLabel: decision === 'APPROVE' ? 'Approve override' : 'Reject proposal',
      destructive: decision === 'REJECT',
      onConfirm: async (why) => {
        await decideOverride.mutateAsync({ profileId: p.id, decision, reason: why });
        toast.success(decision === 'APPROVE' ? 'Override approved and now active.' : 'Proposed override rejected.');
      },
    });

  const withdraw = (p: { id: string; reporting_currency_override: string; effective_from: string }) =>
    setDecision({
      title: 'Withdraw proposed override',
      description: 'Withdrawing removes the proposal from the approval queue. The record is retained in history.',
      context: [
        { label: 'Proposed currency', value: <span className="font-mono">{p.reporting_currency_override}</span> },
        { label: 'Effective from', value: formatDateOnly(p.effective_from) },
      ],
      confirmLabel: 'Withdraw proposal',
      destructive: true,
      onConfirm: async (why) => {
        await withdrawProposal.mutateAsync({ profileId: p.id, reason: why });
        toast.success('Proposal withdrawn.');
      },
    });

  const supersede = (p: { id: string; reporting_currency_override: string; effective_from: string }) =>
    setDecision({
      title: 'Supersede current reporting currency override',
      description: 'The entity reverts to the regulator base currency, or to the next applicable override, from today. Historical periods stay resolvable.',
      context: [
        { label: 'Current override', value: <span className="font-mono">{p.reporting_currency_override}</span> },
        { label: 'Effective from', value: formatDateOnly(p.effective_from) },
        { label: 'Regulator base currency', value: <span className="font-mono">{baseCurrency ?? '—'}</span> },
      ],
      confirmLabel: 'Supersede override',
      destructive: true,
      onConfirm: async (why) => {
        await supersedeOverride.mutateAsync({ profileId: p.id, reason: why });
        toast.success('Override superseded. History is retained.');
      },
    });



  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-base"><Coins className="h-4 w-4" />Reporting &amp; currency</CardTitle>
            <CardDescription>
              The currency this entity prepares its regulatory returns in, per regulator. Overrides are maintained only here.
            </CardDescription>
            {bodies.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Regulator</Label>
                <Select value={scopedRegulatorId ?? undefined} onValueChange={setBodyId}>
                  <SelectTrigger className="h-8 w-[20rem]"><SelectValue placeholder="Select regulator" /></SelectTrigger>
                  <SelectContent>
                    {bodies.map((b) => (
                      <SelectItem key={b.regulator_id} value={b.regulator_id}>
                        {b.name ?? b.code ?? b.regulator_id}{b.code ? ` (${b.code})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Badge variant="secondary">Supervised by {bodies.length} regulators</Badge>
              </div>
            )}
            {selectedBody?.sources?.length ? (
              <p className="text-xs text-muted-foreground">
                Regulator determined from: {selectedBody.sources.join(', ').toLowerCase().replace(/_/g, ' ')}
              </p>
            ) : null}
          </div>
          {canManage && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <GuardedButton module="licensee_management" action="edit" size="sm" disabled={configurationRequired}>
                  Set override
                </GuardedButton>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{makerChecker ? 'Propose entity reporting currency' : 'Set entity reporting currency'}</DialogTitle>
                  <DialogDescription>
                    The override applies to {selectedBody?.name ?? 'this regulator'} only, from the effective date onwards.
                    Earlier reporting periods and already opened filings keep the currency recorded at the time.
                    {makerChecker && ' This regulator requires an independent approver, so the change is recorded as a proposal first.'}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Reporting currency</Label>
                    <Select value={code || undefined} onValueChange={setCode}>
                      <SelectTrigger><SelectValue placeholder="Select an ISO currency" /></SelectTrigger>
                      <SelectContent>
                        {currencies.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.code} — {c.name}{c.display_symbol ? ` (${c.display_symbol})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ecp-from">Effective from</Label>
                    <Input id="ecp-from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ecp-reason">Reason</Label>
                    <Textarea id="ecp-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                      placeholder="Why this entity reports in a currency other than the regulator base currency" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <GuardedButton module="licensee_management" action="edit" onClick={submitOverride} disabled={setOverride.isPending}>
                    {makerChecker ? 'Submit for approval' : 'Set override'}
                  </GuardedButton>
                </DialogFooter>

              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        {configurationRequired && (
          <CardContent className="pt-0">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Monetary configuration required</p>
              <p className="mt-1">
                {selectedBody?.name ?? 'This regulator'} has no monetary configuration of its own, so no base currency
                can be resolved and no override may be recorded. Configure this regulator&rsquo;s currency settings first.
              </p>
            </div>
          </CardContent>
        )}
        {data.data_remediation_required && (
          <CardContent className="pt-0">
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive">Historical record requires remediation</p>
              <p className="mt-1 text-muted-foreground">
                At least one historical override is not attributed to a regulator. It is retained unchanged and is
                excluded from currency resolution until it is remediated.
              </p>
            </div>
          </CardContent>
        )}
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label="Regulator" value={selectedBody?.name ?? '—'} />
          <Field label="Regulator base currency" value={baseCurrency ?? 'Not configured'} />
          <Field
            label="Entity reporting currency"
            value={
              resolvedCurrency ? (
                <span className="flex items-center gap-2">
                  <span className="font-mono">{resolvedCurrency}</span>
                  {resolvedSource && <Badge variant="outline">{CURRENCY_SOURCE_LABELS[resolvedSource]}</Badge>}
                </span>
              ) : (
                <span className="text-muted-foreground">Not resolvable — {selectedBody?.error ?? 'configuration required'}</span>
              )
            }
          />
          <Field label="Regulator consolidated reporting currency" value={consolidatedCurrency ?? 'Not configured'} />
          <Field label="Resolved as at" value={formatDateOnly(data.as_of)} />
          <Field label="Effective from" value={activeProfile ? formatDateOnly(activeProfile.effective_from) : '—'} />
          <Field label="Effective to" value={activeProfile?.effective_to ? formatDateOnly(activeProfile.effective_to) : 'Open-ended'} />
          <Field label="Status" value={activeProfile ? activeProfile.status : 'No override — inherited'} />
          <Field label="Last changed" value={activeProfile ? formatDateTime(activeProfile.created_at) : '—'} />
          <Field label="Returns FX date policy" value={data.returns_fx_date_policy.replace('_', ' ').toLowerCase()} />
          <Field label="Override approval control" value={CURRENCY_APPROVAL_MODE_LABELS[approvalMode]} />
        </CardContent>

        {resolvedSource === 'REGULATOR_BASE' && (
          <CardContent className="pt-0 text-sm text-muted-foreground">
            Reporting currency: <span className="font-mono">{resolvedCurrency}</span> — inherited from the regulator base
            currency. No override record is stored for the default.
          </CardContent>
        )}
        {activeProfile && canManage && (
          <CardContent className="pt-0">
            <GuardedButton module="licensee_management" action="edit" variant="outline" size="sm"
              onClick={() => supersede(activeProfile)}>
              Supersede current override
            </GuardedButton>
          </CardContent>
        )}
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Proposed overrides awaiting approval</CardTitle>
            <CardDescription>
              A proposal does not change the reporting currency. Returns keep resolving to the current active
              currency until an independent approver accepts the proposal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead><TableHead>Effective from</TableHead>
                  <TableHead>Proposed</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((p) => {
                  const isMaker = !!data.current_user_id && (p.proposed_by ?? p.created_by) === data.current_user_id;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono">{p.reporting_currency_override}</TableCell>
                      <TableCell>{formatDateOnly(p.effective_from)}</TableCell>
                      <TableCell>{formatDateTime(p.proposed_at ?? p.created_at)}</TableCell>
                      <TableCell className="max-w-[18rem] truncate" title={p.reason ?? ''}>{p.reason ?? '—'}</TableCell>
                      <TableCell className="space-x-2 text-right">
                        {canManage && !isMaker && (
                          <>
                            <GuardedButton module="licensee_management" action="edit" data-rbac="licensee_management.edit" size="sm"
                              onClick={() => decide(p, 'APPROVE')} disabled={decideOverride.isPending}>Accept proposal</GuardedButton>
                            <GuardedButton module="licensee_management" action="edit" data-rbac="licensee_management.edit" size="sm" variant="outline"
                              onClick={() => decide(p, 'REJECT')} disabled={decideOverride.isPending}>Decline proposal</GuardedButton>

                          </>
                        )}
                        {isMaker && (
                          <>
                            <span className="mr-2 text-xs text-muted-foreground">You proposed this change — an independent approver must decide.</span>
                            <GuardedButton module="licensee_management" action="edit" size="sm" variant="outline"
                              onClick={() => withdraw(p)} disabled={withdrawProposal.isPending}>Withdraw</GuardedButton>
                          </>
                        )}
                        {!canManage && !isMaker && <span className="text-xs text-muted-foreground">Awaiting approval</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}


      {data.mandated_definitions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Return definitions with a mandated currency</CardTitle>
            <CardDescription>
              These returns must be filed in the currency configured on the return definition, regardless of the entity preference.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Return</TableHead><TableHead>Mandated currency</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.mandated_definitions.map((d) => (
                  <TableRow key={d.return_definition_id}>
                    <TableCell>{d.code} — {d.name}</TableCell>
                    <TableCell className="font-mono">{d.currency}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" />Override history</CardTitle>
          <CardDescription>Superseded overrides are retained so historical periods stay resolvable.</CardDescription>
        </CardHeader>
        <CardContent>
          {scopedHistory.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No override has ever been recorded for this entity.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead><TableHead>Effective from</TableHead><TableHead>Effective to</TableHead>
                  <TableHead>Status</TableHead><TableHead>Reason</TableHead><TableHead>Proposed by</TableHead>
                  <TableHead>Decision</TableHead><TableHead>Recorded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scopedHistory.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono">{p.reporting_currency_override}</TableCell>
                    <TableCell>{formatDateOnly(p.effective_from)}</TableCell>
                    <TableCell>{p.effective_to ? formatDateOnly(p.effective_to) : 'Open-ended'}</TableCell>
                    <TableCell><Badge variant="outline">{CURRENCY_PROFILE_STATUS_LABELS[p.status] ?? p.status}</Badge></TableCell>
                    <TableCell className="max-w-[22rem] truncate" title={p.reason ?? ''}>{p.reason ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.proposed_at ? formatDateTime(p.proposed_at) : '—'}
                    </TableCell>
                    <TableCell className="max-w-[18rem] text-xs text-muted-foreground" title={p.decision_reason ?? ''}>
                      {p.decision_at
                        ? `${formatDateTime(p.decision_at)} — ${p.decision_reason ?? 'no reason recorded'}`
                        : 'No decision recorded'}
                    </TableCell>
                    <TableCell>{formatDateTime(p.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <ReasonDialog request={decision} onClose={() => setDecision(null)} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}
