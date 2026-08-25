/**
 * Guided "New Return" selector for regulated-entity filers.
 *
 * This is a CONTROLLED UI over the regulator-configured returns engine: every
 * dropdown comes from `returns_new_return_options` (server-side licence
 * entitlement + configured obligations/periods), and starting a return calls
 * the existing canonical `returns_open_filing(_period_id)` RPC — which
 * re-validates membership, capability, entitlement, obligation and period, and
 * is idempotent per reporting period, so no duplicate filing can be created.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowRight, Info } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateOnly } from '@/lib/datetime';
import {
  useNewReturnOptions, useEntityReturnsMutations, type NewReturnOption, type ApprovedMembership,
} from '@/hooks/useEntityReturns';
import { isCorrectionStatus, isSubmittedStatus, quarterOfPeriod } from '@/lib/returns/filingStatusLabels';
import { useLicenseEntitlements } from '@/hooks/useLicenseEntitlements';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string | null;
  onEntityChange: (entityId: string) => void;
  memberships: ApprovedMembership[];
  canPrepare: boolean;
}

const isQuarterly = (frequency: string) => frequency?.toUpperCase() === 'QUARTERLY';

export function NewReturnDialog({
  open, onOpenChange, entityId, onEntityChange, memberships, canPrepare,
}: Props) {
  const navigate = useNavigate();
  const { data: options = [], isLoading } = useNewReturnOptions(open ? entityId : null);
  const entitlements = useLicenseEntitlements(open ? entityId : null);
  const { openFiling } = useEntityReturnsMutations();

  const [sectorId, setSectorId] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [definitionId, setDefinitionId] = useState<string | null>(null);
  const [periodId, setPeriodId] = useState<string | null>(null);

  /* --- cascading option sets ------------------------------------------- */

  const sectors = useMemo(() => {
    const map = new Map<string, string>();
    options.forEach((o) => map.set(o.sector_id, o.sector_name ?? 'Licensed sector'));
    return [...map].map(([id, name]) => ({ id, name }));
  }, [options]);

  const years = useMemo(() => {
    const set = new Set<number>();
    options.filter((o) => o.sector_id === sectorId).forEach((o) => set.add(o.reporting_year));
    return [...set].sort((a, b) => b - a);
  }, [options, sectorId]);

  const definitions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; frequency: string }>();
    options
      .filter((o) => o.sector_id === sectorId && String(o.reporting_year) === year)
      .forEach((o) => map.set(o.definition_id, { id: o.definition_id, name: o.definition_name, frequency: o.frequency }));
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [options, sectorId, year]);

  const periods = useMemo<NewReturnOption[]>(() => {
    return options
      .filter((o) => o.sector_id === sectorId && String(o.reporting_year) === year && o.definition_id === definitionId)
      .sort((a, b) => a.period_start.localeCompare(b.period_start));
  }, [options, sectorId, year, definitionId]);

  const selectedDefinition = definitions.find((d) => d.id === definitionId);
  const needsQuarter = !!selectedDefinition && isQuarterly(selectedDefinition.frequency) && periods.length > 1;
  const resolved = periods.find((p) => p.period_id === periodId) ?? null;

  /* --- cascade resets + auto-selection --------------------------------- */

  useEffect(() => {
    // Entity changed (or dialog reopened): drop every downstream selection so
    // one entity's choices can never leak into another's.
    setSectorId(null); setYear(null); setDefinitionId(null); setPeriodId(null);
  }, [entityId, open]);

  useEffect(() => {
    if (sectorId && !sectors.some((s) => s.id === sectorId)) { setSectorId(null); return; }
    if (!sectorId && sectors.length === 1) setSectorId(sectors[0].id);
  }, [sectors, sectorId]);

  useEffect(() => {
    if (year && !years.some((y) => String(y) === year)) { setYear(null); return; }
    if (!year && years.length === 1) setYear(String(years[0]));
  }, [years, year]);

  useEffect(() => {
    if (definitionId && !definitions.some((d) => d.id === definitionId)) { setDefinitionId(null); return; }
    if (!definitionId && definitions.length === 1) setDefinitionId(definitions[0].id);
  }, [definitions, definitionId]);

  useEffect(() => {
    if (periodId && !periods.some((p) => p.period_id === periodId)) { setPeriodId(null); return; }
    if (!periodId && periods.length === 1) setPeriodId(periods[0].period_id);
  }, [periods, periodId]);

  const resetFrom = (level: 'sector' | 'year' | 'definition') => {
    if (level === 'sector') { setYear(null); setDefinitionId(null); setPeriodId(null); }
    if (level === 'year') { setDefinitionId(null); setPeriodId(null); }
    if (level === 'definition') { setPeriodId(null); }
  };

  /* --- action ---------------------------------------------------------- */

  const submitted = isSubmittedStatus(resolved?.filing_status);
  const correction = isCorrectionStatus(resolved?.filing_status);
  const hasDraft = !!resolved?.filing_id && !submitted && !correction;

  const actionLabel = submitted ? 'View Return'
    : correction ? 'Respond to Correction'
    : hasDraft ? 'Continue Return'
    : 'Start Return';

  const handleAction = async () => {
    if (!resolved) return;
    try {
      let filingId = resolved.filing_id;
      if (!filingId) {
        if (!canPrepare) return;
        const res = await openFiling.mutateAsync(resolved.period_id);
        filingId = res.filing_id;
      }
      onOpenChange(false);
      navigate(`/entity/returns/filings/${filingId}`);
    } catch (e: any) {
      toast.error(e?.message || 'Could not start this return');
    }
  };

  const actionDisabled = !resolved || openFiling.isPending || (!resolved.filing_id && !canPrepare);
  const noMembership = memberships.length === 0;
  const noEntity = !entityId;
  const noEligibleLicense = !noMembership && !!entityId && !entitlements.loading && !entitlements.hasEligibleLicense;
  const noConfiguredOptions = !noMembership && !!entityId && entitlements.hasEligibleLicense && options.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Return</DialogTitle>
          <DialogDescription>Start an eligible regulatory return for your organisation.</DialogDescription>
        </DialogHeader>

        {isLoading || (!!entityId && entitlements.loading) ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {/* Step 1 — Entity (only when the filer acts for more than one) */}
            {memberships.length > 1 && (
              <Field label="Entity">
                <Select value={entityId ?? undefined} onValueChange={(v) => onEntityChange(v)}>
                  <SelectTrigger><SelectValue placeholder="Select entity" /></SelectTrigger>
                  <SelectContent>
                    {memberships.map((m) => (
                      <SelectItem key={m.entity_id} value={m.entity_id}>{m.entity_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            {noMembership ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  You have no approved entity membership yet. Request membership to an entity before returns can be prepared.
                </AlertDescription>
              </Alert>
            ) : noEntity ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>Select an entity before starting a return.</AlertDescription>
              </Alert>
            ) : noEligibleLicense ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  {entitlements.unavailableReason
                    || 'Regulatory Returns will become available once your licence has been approved and issued.'}
                </AlertDescription>
              </Alert>
            ) : noConfiguredOptions ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  There are currently no regulatory returns configured for your licensed sector.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {/* Step 2 — Sector (eligible licensed sectors only) */}
                <Field label="Sector">
                  <Select
                    value={sectorId ?? undefined}
                    onValueChange={(v) => { setSectorId(v); resetFrom('sector'); }}
                    disabled={sectors.length === 1}
                  >
                    <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
                    <SelectContent>
                      {sectors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>

                {/* Step 3 — Reporting year */}
                {sectorId && (
                  <Field label="Reporting year">
                    <Select value={year ?? undefined} onValueChange={(v) => { setYear(v); resetFrom('year'); }}>
                      <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                      <SelectContent>
                        {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}

                {/* Step 4 — Return type */}
                {sectorId && year && (
                  <Field label="Return type">
                    <Select value={definitionId ?? undefined} onValueChange={(v) => { setDefinitionId(v); resetFrom('definition'); }}>
                      <SelectTrigger><SelectValue placeholder="Select return type" /></SelectTrigger>
                      <SelectContent>
                        {definitions.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}

                {/* Step 5 — Quarter (configured quarterly periods only) */}
                {needsQuarter && (
                  <Field label="Quarter">
                    <Select value={periodId ?? undefined} onValueChange={setPeriodId}>
                      <SelectTrigger><SelectValue placeholder="Select quarter" /></SelectTrigger>
                      <SelectContent>
                        {periods.map((p) => (
                          <SelectItem key={p.period_id} value={p.period_id}>
                            Q{quarterOfPeriod(p.period_start)} — {p.period_label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}

                {resolved && (
                  <div className="rounded-md border bg-muted/40 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{resolved.period_label}</span>
                      <Badge variant="outline">{resolved.filing_status ?? 'Not started'}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Due {formatDateOnly(resolved.due_date)}
                      {resolved.is_overdue && <span className="ml-2 font-medium text-destructive">Overdue</span>}
                    </p>
                    {submitted && (
                      <p className="mt-2 text-xs">This return has already been submitted.</p>
                    )}
                    {!resolved.filing_id && !canPrepare && (
                      <p className="mt-2 text-xs">
                        You can view Returns but do not have permission to prepare a new filing.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleAction} disabled={actionDisabled}>
            {openFiling.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {actionLabel}<ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export default NewReturnDialog;
