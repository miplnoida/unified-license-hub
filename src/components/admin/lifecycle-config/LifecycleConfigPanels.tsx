/**
 * P04 configuration closure — configuration workspace panels.
 *
 * These panels are read-only views over server-resolved configuration. They
 * deliberately distinguish three different things an administrator must never
 * confuse:
 *
 *   AVAILABLE FEE TYPE   (catalogue)        — the code exists
 *   ACTIVE FEE SCHEDULE  (amount)           — a monetary amount is configured
 *   WORKFLOW FEE BINDING (trigger + gate)   — the fee is actually charged
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Calculator, PlayCircle } from 'lucide-react';
import {
  useFeeSimulator,
  useLifecycleConfigurationOverview,
  useProcessPreview,
  type FeeBindingRow,
} from '@/hooks/useLifecycleConfiguration';

function PurposeBadge({ purpose }: { purpose: string }) {
  if (purpose === 'CERTIFICATION') return <Badge variant="outline">Certification — test/demo only</Badge>;
  if (purpose === 'TEMPLATE') return <Badge variant="secondary">Configuration template</Badge>;
  return <Badge>Production</Badge>;
}

function YesNo({ value }: { value: boolean | null | undefined }) {
  return (
    <Badge variant={value ? 'default' : 'secondary'}>{value ? 'Yes' : 'No'}</Badge>
  );
}

/* -------------------------- fee catalogue ---------------------------- */

export function FeeCataloguePanel() {
  const { data, isLoading } = useLifecycleConfigurationOverview();
  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>A fee type in the catalogue does not charge anything</AlertTitle>
        <AlertDescription>
          A fee is only assessed when a fee schedule provides an amount <strong>and</strong> an
          enabled workflow fee binding attaches it to a step or event.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Fee type catalogue</CardTitle>
          <CardDescription>
            Stable regulatory fee codes. {data?.fee_types.length ?? 0} entries.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Catalogue state</TableHead>
                <TableHead>Active schedule</TableHead>
                <TableHead>Enabled workflow binding</TableHead>
                <TableHead>Effective charge</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.fee_types ?? []).map((ft) => {
                const code = (ft.code ?? '').toUpperCase();
                const schedule = (data?.schedules ?? []).find(
                  (s) => (s.fee_type ?? '').toUpperCase() === code && s.is_active,
                );
                const binding = (data?.bindings ?? []).find(
                  (b) => (b.fee_type_code ?? '') === code && b.is_active && b.purpose !== 'TEMPLATE',
                );
                return (
                  <TableRow key={`${ft.code}-${ft.name}`}>
                    <TableCell className="font-mono text-xs">{ft.code ?? '—'}</TableCell>
                    <TableCell>{ft.name}</TableCell>
                    <TableCell>
                      <Badge variant={ft.status === 'active' ? 'default' : 'secondary'}>
                        {ft.status === 'active' ? 'Available' : String(ft.status ?? 'unknown')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {schedule ? (
                        <span className="font-mono text-xs">
                          {schedule.currency} {Number(schedule.amount ?? 0).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">Not configured</span>
                      )}
                    </TableCell>
                    <TableCell><YesNo value={!!binding} /></TableCell>
                    <TableCell>
                      {binding && schedule ? (
                        <Badge>Charged at trigger</Badge>
                      ) : (
                        <Badge variant="secondary">No charge</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------- fee bindings ----------------------------- */

export function FeeBindingsPanel() {
  const { data, isLoading } = useLifecycleConfigurationOverview();
  const [purpose, setPurpose] = useState<string>('all');
  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const bindings: FeeBindingRow[] = (data?.bindings ?? []).filter(
    (b) => purpose === 'all' || b.purpose === purpose,
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Process fee switches</CardTitle>
          <CardDescription>
            When a process is switched off, no configured fee for that process assesses or blocks.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Process</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Fees enabled</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.process_settings ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="capitalize">{s.matter_kind.replace(/_/g, ' ')}</TableCell>
                  <TableCell>{s.regulator_id ? 'Regulator-specific' : 'Global default'}</TableCell>
                  <TableCell><YesNo value={s.fees_enabled} /></TableCell>
                  <TableCell className="text-muted-foreground text-xs">{s.notes ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Workflow fee bindings</CardTitle>
            <CardDescription>Trigger, timing and gate policy per fee head.</CardDescription>
          </div>
          <Select value={purpose} onValueChange={setPurpose}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All purposes</SelectItem>
              <SelectItem value="PRODUCTION">Production</SelectItem>
              <SelectItem value="CERTIFICATION">Certification only</SelectItem>
              <SelectItem value="TEMPLATE">Configuration templates</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fee head</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Process</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Timing</TableHead>
                <TableHead>Gate policy</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>Enabled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bindings.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <div className="font-mono text-xs">{b.fee_type_code}</div>
                    <div className="text-muted-foreground text-xs">{b.description}</div>
                  </TableCell>
                  <TableCell><PurposeBadge purpose={b.purpose} /></TableCell>
                  <TableCell className="capitalize">{b.matter_kind?.replace(/_/g, ' ')}</TableCell>
                  <TableCell>{b.trigger_event ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{b.trigger_timing}</TableCell>
                  <TableCell className="font-mono text-xs">{b.gate_policy}</TableCell>
                  <TableCell className="text-xs">{b.license_type ?? 'Any licence type'}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {b.effective_from}{b.effective_to ? ` → ${b.effective_to}` : ''}
                  </TableCell>
                  <TableCell><YesNo value={b.is_active} /></TableCell>
                </TableRow>
              ))}
              {bindings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-muted-foreground py-8 text-center">
                    No bindings for this purpose.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/* --------------------- verification templates ------------------------ */

export function VerificationTemplatesPanel() {
  const { data, isLoading } = useLifecycleConfigurationOverview();
  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verification template catalogue</CardTitle>
        <CardDescription>
          Templates are versioned. A verification case pins the template key, version, items,
          required flags and blocking semantics at creation, so later edits never change an open case.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Process</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Mandatory</TableHead>
              <TableHead>Effective</TableHead>
              <TableHead>Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.verification_templates ?? []).map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-muted-foreground font-mono text-xs">{t.template_key}</div>
                </TableCell>
                <TableCell className="font-mono text-xs">v{t.version}</TableCell>
                <TableCell className="capitalize">{t.matter_kind}</TableCell>
                <TableCell><PurposeBadge purpose={t.purpose} /></TableCell>
                <TableCell className="font-mono text-xs">{t.total_items}</TableCell>
                <TableCell className="font-mono text-xs">{t.mandatory_items}</TableCell>
                <TableCell className="font-mono text-xs">
                  {t.effective_from}{t.effective_to ? ` → ${t.effective_to}` : ''}
                </TableCell>
                <TableCell><YesNo value={t.is_active} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ----------------------- scope selector shared ----------------------- */

function useScopeOptions() {
  const regulators = useQuery({
    queryKey: ['config-regulators'],
    queryFn: async () => {
      const { data, error } = await supabase.from('regulators').select('id, name').order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const sectors = useQuery({
    queryKey: ['config-sectors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sectors').select('id, name').order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const licenseTypes = useQuery({
    queryKey: ['config-license-types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('licenses').select('license_type').limit(1000);
      if (error) throw new Error(error.message);
      return Array.from(new Set((data ?? []).map((r) => r.license_type).filter(Boolean))) as string[];
    },
  });
  return { regulators, sectors, licenseTypes };
}

interface ScopeState {
  regulator_id: string;
  sector_id: string;
  license_type: string;
  purpose: string;
}

function ScopeSelectors({
  scope,
  setScope,
  showPurpose = true,
}: {
  scope: ScopeState;
  setScope: (s: ScopeState) => void;
  showPurpose?: boolean;
}) {
  const { regulators, sectors, licenseTypes } = useScopeOptions();
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1.5">
        <Label>Regulator</Label>
        <Select value={scope.regulator_id} onValueChange={(v) => setScope({ ...scope, regulator_id: v })}>
          <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any regulator</SelectItem>
            {(regulators.data ?? []).map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Sector</Label>
        <Select value={scope.sector_id} onValueChange={(v) => setScope({ ...scope, sector_id: v })}>
          <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any sector</SelectItem>
            {(sectors.data ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Licence type</Label>
        <Select value={scope.license_type} onValueChange={(v) => setScope({ ...scope, license_type: v })}>
          <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any licence type</SelectItem>
            {(licenseTypes.data ?? []).map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showPurpose && (
        <div className="space-y-1.5">
          <Label>Configuration purpose</Label>
          <Select value={scope.purpose} onValueChange={(v) => setScope({ ...scope, purpose: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PRODUCTION">Production</SelectItem>
              <SelectItem value="CERTIFICATION">Certification</SelectItem>
              <SelectItem value="TEMPLATE">Configuration template</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function scopePayload(scope: ScopeState, extra: Record<string, unknown> = {}) {
  return {
    regulator_id: scope.regulator_id === 'any' ? null : scope.regulator_id,
    sector_id: scope.sector_id === 'any' ? null : scope.sector_id,
    license_type: scope.license_type === 'any' ? null : scope.license_type,
    purpose: scope.purpose,
    ...extra,
  };
}

const DEFAULT_SCOPE: ScopeState = {
  regulator_id: 'any',
  sector_id: 'any',
  license_type: 'any',
  purpose: 'PRODUCTION',
};

/* --------------------------- fee simulator --------------------------- */

export function FeeSimulatorPanel() {
  const [scope, setScope] = useState<ScopeState>(DEFAULT_SCOPE);
  const [matterKind, setMatterKind] = useState('renewal');
  const [quantity, setQuantity] = useState('1');
  const simulate = useFeeSimulator();
  const result = simulate.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Fee configuration simulator</CardTitle>
          <CardDescription>
            Resolves configuration only. Simulation never creates a fee obligation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScopeSelectors scope={scope} setScope={setScope} />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Process / event</Label>
              <Select value={matterKind} onValueChange={setMatterKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['renewal', 'variation', 'reinstatement', 'surrender', 'condition_review', 'application', 'registration'].map((k) => (
                    <SelectItem key={k} value={k} className="capitalize">{k.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity driver</Label>
              <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() =>
                  simulate.mutate(
                    scopePayload(scope, { matter_kind: matterKind, quantity: Number(quantity) || 1 }),
                  )
                }
                disabled={simulate.isPending}
              >
                <Calculator className="mr-2 h-4 w-4" />
                {simulate.isPending ? 'Simulating…' : 'Simulate'}
              </Button>
            </div>
          </div>
          {simulate.error && (
            <Alert variant="destructive">
              <AlertDescription>{(simulate.error as Error).message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Resolution</CardTitle>
            <CardDescription>
              Process fees {result.process_fees_enabled ? 'enabled' : 'disabled'}
              {result.process_fees_setting_present ? ' by explicit configuration' : ' (no explicit switch)'} ·
              {' '}{result.candidates.length} candidate configuration(s) · creates obligation: no
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fee head</TableHead>
                  <TableHead>Catalogue</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Binding</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Basis / qty</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Gate</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.candidates.map((c) => (
                  <TableRow key={c.binding_id}>
                    <TableCell>
                      <div className="font-mono text-xs">{c.fee_type_code}</div>
                      <div className="text-muted-foreground text-xs">{c.description}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.catalogue_state === 'AVAILABLE' ? 'default' : 'destructive'}>
                        {c.catalogue_state === 'AVAILABLE' ? 'Available' : 'Not in catalogue'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.schedule_name ?? 'Inline amount'}{' '}
                      {c.schedule_active === false && <Badge variant="secondary">Schedule off</Badge>}
                    </TableCell>
                    <TableCell><YesNo value={c.binding_enabled} /></TableCell>
                    <TableCell className="font-mono text-xs">
                      {c.currency} {Number(c.total).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.charge_basis} × {c.quantity}</TableCell>
                    <TableCell className="text-xs">
                      {c.trigger_event ?? '—'}
                      <div className="text-muted-foreground font-mono">{c.trigger_timing}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.gate_policy}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {c.effective_from}{c.effective_to ? ` → ${c.effective_to}` : ''}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.would_assess ? 'default' : 'secondary'}>
                        {c.would_assess ? 'Would assess' : 'No assessment'}
                      </Badge>
                      <div className="text-muted-foreground mt-1 text-xs">{c.reason}</div>
                    </TableCell>
                  </TableRow>
                ))}
                {result.candidates.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-muted-foreground py-8 text-center">
                      No fee configuration matches this selection — nothing would be charged.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ------------------- process designer / preview ---------------------- */

export function ProcessPreviewPanel() {
  const { data } = useLifecycleConfigurationOverview();
  const [scope, setScope] = useState<ScopeState>(DEFAULT_SCOPE);
  const [processCode, setProcessCode] = useState('LICENCE_RENEWAL');
  const preview = useProcessPreview();
  const result = preview.data;

  const processCodes = useMemo(
    () => Array.from(new Set((data?.process_templates ?? []).map((p) => p.process_code))),
    [data],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Process templates</CardTitle>
          <CardDescription>
            Reusable process definitions. Templates are inactive until a regulator adopts them.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Process</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Steps</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.process_templates ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.process_code}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="font-mono text-xs">v{p.version}</TableCell>
                  <TableCell className="font-mono text-xs">{p.step_count}</TableCell>
                  <TableCell><PurposeBadge purpose={p.purpose} /></TableCell>
                  <TableCell><YesNo value={p.is_active} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workflow preview</CardTitle>
          <CardDescription>
            The complete ordered process as the engine resolves it for one scope.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScopeSelectors scope={scope} setScope={setScope} />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Process</Label>
              <Select value={processCode} onValueChange={setProcessCode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(processCodes.length ? processCodes : ['LICENCE_RENEWAL']).map((c) => (
                    <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => preview.mutate(scopePayload(scope, { process_code: processCode }))}
                disabled={preview.isPending}
              >
                <PlayCircle className="mr-2 h-4 w-4" />
                {preview.isPending ? 'Resolving…' : 'Resolve process'}
              </Button>
            </div>
          </div>
          {preview.error && (
            <Alert variant="destructive">
              <AlertDescription>{(preview.error as Error).message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {result && !result.resolved && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Not resolved</AlertTitle>
          <AlertDescription>{result.reason}</AlertDescription>
        </Alert>
      )}

      {result?.resolved && (
        <Card>
          <CardHeader>
            <CardTitle>{result.template_name}</CardTitle>
            <CardDescription>
              {result.process_code} · version {result.template_version} ·{' '}
              {result.template_active ? 'active' : 'inactive template'} · purpose {result.purpose}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(result.steps ?? []).map((s) => (
              <div key={s.key} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{s.order}</span>
                  <span className="font-medium">{s.name}</span>
                  <Badge variant="secondary">{s.kind}</Badge>
                  {s.conditional && <Badge variant="outline">Conditional</Badge>}
                  {s.maker_checker && <Badge variant="outline">Maker / checker</Badge>}
                  {s.forms && <Badge variant="outline">Forms</Badge>}
                  {s.documents && <Badge variant="outline">Documents</Badge>}
                  {s.rfi && <Badge variant="outline">RFI</Badge>}
                  {s.verification && <Badge variant="outline">Verification</Badge>}
                  {s.fee_state === 'enabled' && <Badge>Fee enabled</Badge>}
                  {s.fee_state === 'disabled' && <Badge variant="secondary">Fee disabled</Badge>}
                  {s.fee_state === 'not_configured' && s.fee && (
                    <Badge variant="secondary">Fee not configured</Badge>
                  )}
                </div>
                <div className="text-muted-foreground mt-2 grid gap-1 text-xs md:grid-cols-2">
                  <div>Responsible: {s.role ?? '—'}</div>
                  <div>SLA: {s.sla_days ? `${s.sla_days} day(s)` : '—'}</div>
                  <div>Entry blockers: {s.entry_blockers?.length ? s.entry_blockers.join(', ') : 'none'}</div>
                  <div>Exit blockers: {s.exit_blockers?.length ? s.exit_blockers.join(', ') : 'none'}</div>
                  <div>Notifications: {s.notifications?.length ? s.notifications.join(', ') : 'none'}</div>
                  {s.resolved_fee && (
                    <div>
                      Fee: {s.resolved_fee.fee_type_code} · {s.resolved_fee.currency}{' '}
                      {Number(s.resolved_fee.total).toLocaleString()} · {s.resolved_fee.gate_policy}
                    </div>
                  )}
                  {s.resolved_verification && (
                    <div>
                      Checklist: {s.resolved_verification.mandatory_items} mandatory of{' '}
                      {s.resolved_verification.total_items} ({s.resolved_verification.template_key} v
                      {s.resolved_verification.version}
                      {s.resolved_verification.active ? '' : ', inactive'})
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
