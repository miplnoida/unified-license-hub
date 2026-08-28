/**
 * GAP-F1-01 — Decision Authority configuration workspace.
 *
 * Operators configure who may take each regulatory decision, with effective
 * dates, conflict validation and a full audit trail. Enforcement is deliberately
 * conservative: rules default to OBSERVE_ONLY, which records what WOULD have
 * happened without changing behaviour. A rule only blocks a decision once an
 * operator explicitly sets it to ENFORCED — the platform never invents
 * regulator policy.
 */
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Info, Pencil, Plus, ShieldCheck } from 'lucide-react';
import Swal from 'sweetalert2';
import { useToast } from '@/hooks/use-toast';
import { useCan } from '@/hooks/useCan';
import {
  useDecisionAuthorityMutations,
  useDecisionAuthorityOverview,
  type DecisionAuthorityRule,
  type DecisionAuthorityRuleInput,
  type EnforcementMode,
} from '@/hooks/useDecisionAuthority';

const MODES: EnforcementMode[] = ['OFF', 'OBSERVE_ONLY', 'ENFORCED'];

const MODE_TONE: Record<EnforcementMode, 'secondary' | 'outline' | 'destructive'> = {
  OFF: 'outline',
  OBSERVE_ONLY: 'secondary',
  ENFORCED: 'destructive',
};

function emptyDraft(): DecisionAuthorityRuleInput {
  return {
    decision_type: '',
    required_module_key: '',
    required_permission_key: '',
    requires_maker_checker: true,
    requires_committee: false,
    committee_kind: '',
    minimum_quorum: null,
    requires_conflict_clearance: true,
    allow_delegation: true,
    enforcement_mode: 'OBSERVE_ONLY',
    notes: '',
    effective_from: '',
    effective_to: '',
    reason: '',
  };
}

function toDraft(rule: DecisionAuthorityRule): DecisionAuthorityRuleInput {
  return {
    id: rule.id,
    decision_type: rule.decision_type,
    regulator_id: rule.regulator_id,
    regulatory_function_id: rule.regulatory_function_id,
    sector_id: rule.sector_id,
    sub_sector_id: rule.sub_sector_id,
    service_id: rule.service_id,
    required_module_key: rule.required_module_key ?? '',
    required_permission_key: rule.required_permission_key ?? '',
    requires_maker_checker: rule.requires_maker_checker ?? true,
    requires_committee: rule.requires_committee ?? false,
    committee_kind: rule.committee_kind ?? '',
    minimum_quorum: rule.minimum_quorum,
    requires_conflict_clearance: rule.requires_conflict_clearance ?? true,
    allow_delegation: rule.allow_delegation ?? true,
    enforcement_mode: rule.enforcement_mode,
    notes: rule.notes ?? '',
    effective_from: rule.effective_from ? rule.effective_from.slice(0, 10) : '',
    effective_to: rule.effective_to ? rule.effective_to.slice(0, 10) : '',
    reason: '',
  };
}

function scopeLabel(rule: DecisionAuthorityRule): string {
  const parts = [
    rule.regulator_name, rule.regulatory_function_name,
    rule.sector_name, rule.sub_sector_name, rule.service_name,
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(' › ') : 'All scopes';
}

export default function DecisionAuthorityManager() {
  const { toast } = useToast();
  const canWrite = useCan('role_management', 'manage_config');
  const { data, isLoading, error } = useDecisionAuthorityOverview();
  const { save, setStatus } = useDecisionAuthorityMutations();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DecisionAuthorityRuleInput>(emptyDraft);

  const rules = data?.rules ?? [];
  const active = useMemo(() => rules.filter((r) => r.status === 'active'), [rules]);
  const retired = useMemo(() => rules.filter((r) => r.status !== 'active'), [rules]);
  const enforced = active.filter((r) => r.enforcement_mode === 'ENFORCED').length;
  const observing = active.filter((r) => r.enforcement_mode === 'OBSERVE_ONLY').length;

  const set = (patch: Partial<DecisionAuthorityRuleInput>) => setDraft((d) => ({ ...d, ...patch }));

  const openNew = () => { setDraft(emptyDraft()); setOpen(true); };
  const openEdit = (rule: DecisionAuthorityRule) => { setDraft(toDraft(rule)); setOpen(true); };

  const submit = async () => {
    try {
      await save.mutateAsync({
        ...draft,
        required_module_key: draft.required_module_key || null,
        required_permission_key: draft.required_permission_key || null,
        committee_kind: draft.committee_kind || null,
        notes: draft.notes || null,
        effective_from: draft.effective_from || null,
        effective_to: draft.effective_to || null,
        reason: draft.reason || null,
      });
      toast({ title: draft.id ? 'Rule updated' : 'Rule created', description: 'The change is recorded in the configuration audit log.' });
      setOpen(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Could not save rule', description: (e as Error).message });
    }
  };

  const changeStatus = async (rule: DecisionAuthorityRule, status: 'active' | 'retired') => {
    const result = await Swal.fire({
      title: status === 'retired' ? 'Retire this rule?' : 'Reactivate this rule?',
      text: status === 'retired'
        ? 'The rule stops applying from now. History and observations are retained.'
        : 'The rule will apply again from its effective date.',
      input: 'text',
      inputLabel: 'Reason (recorded in the audit log)',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: status === 'retired' ? 'Retire' : 'Reactivate',
    });
    if (!result.isConfirmed) return;
    try {
      await setStatus.mutateAsync({ id: rule.id, status, reason: result.value || null });
      toast({ title: status === 'retired' ? 'Rule retired' : 'Rule reactivated' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Could not change status', description: (e as Error).message });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Decision Authority"
        description="Configure who may take each regulatory decision — required permission, maker-checker, committee and conflict clearance — with effective dates and audit history."
        backHref="/admin/roles"
        backLabel="Roles & Permissions"
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Observation first, enforcement by decision</AlertTitle>
        <AlertDescription>
          New rules default to <strong>Observe only</strong>: the platform records what a rule would have
          decided without changing any outcome. Switch a rule to <strong>Enforced</strong> only once the
          regulator has confirmed the policy — enforced rules block decisions.
          {!canWrite && ' You have read-only access to this configuration.'}
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load decision authority</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Active rules', value: active.length },
          { label: 'Observing', value: observing },
          { label: 'Enforced', value: enforced },
        ].map((m) => (
          <Card key={m.label}>
            <CardHeader className="pb-2">
              <CardDescription>{m.label}</CardDescription>
              <CardTitle className="font-mono text-2xl">{isLoading ? '—' : m.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="observations">Observations</TabsTrigger>
          <TabsTrigger value="retired">Retired</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4">
          <div className="flex justify-end">
            <GuardedButton module="role_management" action="manage_config" onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> New rule
            </GuardedButton>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" /> Active authority rules
              </CardTitle>
              <CardDescription>
                Most specific scope wins. Two active rules may not cover the same scope over the same period.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : active.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active rules configured.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Decision type</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Requires</TableHead>
                      <TableHead>Controls</TableHead>
                      <TableHead>Effective</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Observations</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {active.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.decision_type}</TableCell>
                        <TableCell className="text-xs">{scopeLabel(r)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.required_module_key && r.required_permission_key
                            ? `${r.required_module_key}.${r.required_permission_key}`
                            : '—'}
                        </TableCell>
                        <TableCell className="space-x-1 text-xs">
                          {r.requires_maker_checker && <Badge variant="outline">Maker-checker</Badge>}
                          {r.requires_committee && <Badge variant="outline">Committee{r.minimum_quorum ? ` ≥${r.minimum_quorum}` : ''}</Badge>}
                          {r.requires_conflict_clearance && <Badge variant="outline">Conflict clearance</Badge>}
                          {r.allow_delegation === false && <Badge variant="outline">No delegation</Badge>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.effective_from?.slice(0, 10)}{r.effective_to ? ` → ${r.effective_to.slice(0, 10)}` : ''}
                        </TableCell>
                        <TableCell>
                          <Badge variant={MODE_TONE[r.enforcement_mode]}>{r.enforcement_mode.replace('_', ' ')}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.observation_count}{r.would_deny_count ? ` (${r.would_deny_count} would deny)` : ''}
                        </TableCell>
                        <TableCell className="space-x-2 text-right">
                          <GuardedButton module="role_management" action="manage_config" variant="ghost" size="sm" onClick={() => openEdit(r)}>
                            <Pencil className="h-4 w-4" />
                          </GuardedButton>
                          <GuardedButton module="role_management" action="manage_config" variant="ghost" size="sm" onClick={() => changeStatus(r, 'retired')}>
                            Retire
                          </GuardedButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="observations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Authority observations</CardTitle>
              <CardDescription>
                Every recorded decision is evaluated against the configured authority. Use this evidence to
                decide which rules are safe to enforce.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {isLoading ? <Skeleton className="h-32 w-full" /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Decision type</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Evaluations</TableHead>
                      <TableHead>Would deny</TableHead>
                      <TableHead>Last evaluated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.observation_summary ?? []).length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">No observations recorded yet.</TableCell></TableRow>
                    ) : (data?.observation_summary ?? []).map((o) => (
                      <TableRow key={`${o.decision_type}-${o.evaluated_mode}`}>
                        <TableCell className="font-mono text-xs">{o.decision_type}</TableCell>
                        <TableCell><Badge variant="outline">{o.evaluated_mode ?? 'OFF'}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{o.evaluations}</TableCell>
                        <TableCell className="font-mono text-xs">{o.would_deny}</TableCell>
                        <TableCell className="font-mono text-xs">{o.last_evaluated_at?.slice(0, 19).replace('T', ' ') ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="retired">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Retired rules</CardTitle>
              <CardDescription>Retained for audit. Reactivation is validated against active rules.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {retired.length === 0 ? (
                <p className="text-sm text-muted-foreground">No retired rules.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Decision type</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Effective</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {retired.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.decision_type}</TableCell>
                        <TableCell className="text-xs">{scopeLabel(r)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.effective_from?.slice(0, 10)}{r.effective_to ? ` → ${r.effective_to.slice(0, 10)}` : ''}
                        </TableCell>
                        <TableCell className="text-right">
                          <GuardedButton module="role_management" action="manage_config" variant="ghost" size="sm" onClick={() => changeStatus(r, 'active')}>
                            Reactivate
                          </GuardedButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? 'Edit authority rule' : 'New authority rule'}</DialogTitle>
            <DialogDescription>
              Scope fields are optional — leave blank to apply to all regulators, functions, sectors and services.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="da-decision-type">Decision type</Label>
              <Input
                id="da-decision-type"
                value={draft.decision_type}
                placeholder="application.approve"
                onChange={(e) => set({ decision_type: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="da-module">Required module</Label>
              <Input id="da-module" value={draft.required_module_key ?? ''} placeholder="applications" onChange={(e) => set({ required_module_key: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="da-permission">Required action</Label>
              <Input id="da-permission" value={draft.required_permission_key ?? ''} placeholder="approve" onChange={(e) => set({ required_permission_key: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="da-mode">Enforcement mode</Label>
              <Select value={draft.enforcement_mode} onValueChange={(v) => set({ enforcement_mode: v as EnforcementMode })}>
                <SelectTrigger id="da-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODES.map((m) => <SelectItem key={m} value={m}>{m.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="da-quorum">Minimum committee quorum</Label>
              <Input
                id="da-quorum" type="number" min={0}
                value={draft.minimum_quorum ?? ''}
                onChange={(e) => set({ minimum_quorum: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="da-from">Effective from</Label>
              <Input id="da-from" type="date" value={draft.effective_from ?? ''} onChange={(e) => set({ effective_from: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="da-to">Effective to</Label>
              <Input id="da-to" type="date" value={draft.effective_to ?? ''} onChange={(e) => set({ effective_to: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="da-committee">Committee kind</Label>
              <Input id="da-committee" value={draft.committee_kind ?? ''} onChange={(e) => set({ committee_kind: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              {[
                { key: 'requires_maker_checker' as const, label: 'Requires maker-checker' },
                { key: 'requires_committee' as const, label: 'Requires committee decision' },
                { key: 'requires_conflict_clearance' as const, label: 'Requires conflict-of-interest clearance' },
                { key: 'allow_delegation' as const, label: 'Delegation permitted' },
              ].map((c) => (
                <div key={c.key} className="flex items-center gap-2">
                  <Checkbox
                    id={`da-${c.key}`}
                    checked={Boolean(draft[c.key])}
                    onCheckedChange={(v) => set({ [c.key]: Boolean(v) } as Partial<DecisionAuthorityRuleInput>)}
                  />
                  <Label htmlFor={`da-${c.key}`} className="font-normal">{c.label}</Label>
                </div>
              ))}
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="da-notes">Notes</Label>
              <Textarea id="da-notes" value={draft.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="da-reason">Reason for this change (audit log)</Label>
              <Input id="da-reason" value={draft.reason ?? ''} onChange={(e) => set({ reason: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <GuardedButton
              module="role_management" action="manage_config"
              disabled={!draft.decision_type.trim() || save.isPending}
              onClick={submit}
            >
              {save.isPending ? 'Saving…' : 'Save rule'}
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
