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

  const activeProfile = data.history.find((p) => p.id === data.entity_currency_profile_id) ?? null;
  const canManage = !!data.can_manage;
  const approvalMode = data.approval_mode ?? 'DIRECT_AUTHORIZED';
  const makerChecker = approvalMode === 'MAKER_CHECKER';
  const pending = data.pending_proposals ?? [];

  const submitOverride = async () => {
    if (!code || !effectiveFrom || reason.trim().length < 10) {
      toast.error('Select a currency, an effective date and give a reason of at least 10 characters.');
      return;
    }
    try {
      const res = await setOverride.mutateAsync({ entityId, currency: code, effectiveFrom, reason: reason.trim() });
      toast.success(res?.status === 'PROPOSED'
        ? `Override to ${code} proposed. It takes effect only once an independent approver accepts it.`
        : `Reporting currency override set to ${code}.`);
      setOpen(false); setCode(''); setEffectiveFrom(''); setReason('');
    } catch (e: any) {
      toast.error(e?.message ?? 'The override could not be set.');
    }
  };

  const decide = async (profileId: string, decision: 'APPROVE' | 'REJECT') => {
    const why = window.prompt(`Reason for ${decision === 'APPROVE' ? 'approving' : 'rejecting'} this proposed override (min 10 characters)`) ?? '';
    if (why.trim().length < 10) { toast.error('A reason of at least 10 characters is required.'); return; }
    try {
      await decideOverride.mutateAsync({ profileId, decision, reason: why.trim() });
      toast.success(decision === 'APPROVE' ? 'Override approved and now active.' : 'Proposed override rejected.');
    } catch (e: any) {
      toast.error(e?.message ?? 'The decision could not be recorded.');
    }
  };

  const withdraw = async (profileId: string) => {
    const why = window.prompt('Reason for withdrawing this proposal (min 10 characters)') ?? '';
    if (why.trim().length < 10) { toast.error('A reason of at least 10 characters is required.'); return; }
    try {
      await withdrawProposal.mutateAsync({ profileId, reason: why.trim() });
      toast.success('Proposal withdrawn.');
    } catch (e: any) {
      toast.error(e?.message ?? 'The proposal could not be withdrawn.');
    }
  };

  const supersede = async (profileId: string) => {
    const why = window.prompt('Reason for superseding this override (min 10 characters)') ?? '';
    if (why.trim().length < 10) { toast.error('A reason of at least 10 characters is required.'); return; }
    try {
      await supersedeOverride.mutateAsync({ profileId, reason: why.trim() });
      toast.success('Override superseded. History is retained.');
    } catch (e: any) {
      toast.error(e?.message ?? 'The override could not be superseded.');
    }
  };


  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Coins className="h-4 w-4" />Reporting &amp; currency</CardTitle>
            <CardDescription>
              The currency this entity prepares its regulatory returns in. Overrides are maintained only here.
            </CardDescription>
          </div>
          {canManage && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <GuardedButton module="licensee_management" action="edit" size="sm">Set override</GuardedButton>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{makerChecker ? 'Propose entity reporting currency' : 'Set entity reporting currency'}</DialogTitle>
                  <DialogDescription>
                    The override applies from the effective date onwards. Earlier reporting periods and already
                    opened filings keep the currency recorded at the time.
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
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label="Regulator base currency" value={data.regulator_base_currency} />
          <Field
            label="Entity reporting currency"
            value={
              <span className="flex items-center gap-2">
                <span className="font-mono">{data.currency}</span>
                <Badge variant="outline">{CURRENCY_SOURCE_LABELS[data.source]}</Badge>
              </span>
            }
          />
          <Field label="Regulator consolidated reporting currency" value={data.regulator_reporting_currency} />
          <Field label="Resolved as at" value={formatDateOnly(data.as_of)} />
          <Field label="Effective from" value={activeProfile ? formatDateOnly(activeProfile.effective_from) : '—'} />
          <Field label="Effective to" value={activeProfile?.effective_to ? formatDateOnly(activeProfile.effective_to) : 'Open-ended'} />
          <Field label="Status" value={activeProfile ? activeProfile.status : 'No override — inherited'} />
          <Field label="Last changed" value={activeProfile ? formatDateTime(activeProfile.created_at) : '—'} />
          <Field label="Returns FX date policy" value={data.returns_fx_date_policy.replace('_', ' ').toLowerCase()} />
          <Field label="Override approval control" value={CURRENCY_APPROVAL_MODE_LABELS[approvalMode]} />
        </CardContent>

        {data.source === 'REGULATOR_BASE' && (
          <CardContent className="pt-0 text-sm text-muted-foreground">
            Reporting currency: <span className="font-mono">{data.currency}</span> — inherited from the regulator base
            currency. No override record is stored for the default.
          </CardContent>
        )}
        {activeProfile && canManage && (
          <CardContent className="pt-0">
            <GuardedButton module="licensee_management" action="edit" variant="outline" size="sm"
              onClick={() => supersede(activeProfile.id)}>
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
                            <GuardedButton module="licensee_management" action="edit" size="sm"
                              onClick={() => decide(p.id, 'APPROVE')} disabled={decideOverride.isPending}>Approve</GuardedButton>
                            <GuardedButton module="licensee_management" action="edit" size="sm" variant="outline"
                              onClick={() => decide(p.id, 'REJECT')} disabled={decideOverride.isPending}>Reject</GuardedButton>
                          </>
                        )}
                        {isMaker && (
                          <>
                            <span className="mr-2 text-xs text-muted-foreground">You proposed this change — an independent approver must decide.</span>
                            <GuardedButton module="licensee_management" action="edit" size="sm" variant="outline"
                              onClick={() => withdraw(p.id)} disabled={withdrawProposal.isPending}>Withdraw</GuardedButton>
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
          {data.history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No override has ever been recorded for this entity.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead><TableHead>Effective from</TableHead><TableHead>Effective to</TableHead>
                  <TableHead>Status</TableHead><TableHead>Reason</TableHead><TableHead>Recorded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.history.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono">{p.reporting_currency_override}</TableCell>
                    <TableCell>{formatDateOnly(p.effective_from)}</TableCell>
                    <TableCell>{p.effective_to ? formatDateOnly(p.effective_to) : 'Open-ended'}</TableCell>
                    <TableCell><Badge variant="outline">{CURRENCY_PROFILE_STATUS_LABELS[p.status] ?? p.status}</Badge></TableCell>
                    <TableCell className="max-w-[22rem] truncate" title={p.reason ?? ''}>{p.reason ?? '—'}</TableCell>
                    <TableCell>{formatDateTime(p.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
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
