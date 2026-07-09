import { useMemo } from 'react';
import { useValidationRules, useRatios, useThresholds, useReturnComputedRatios, useReturnBreaches } from '@/hooks/usePrudentialConfig';
import { evaluateRules, type ReturnFormData } from '@/lib/returnsValidation';
import { computeAllRatios, detectBreaches } from '@/lib/returnsRatios';
import { ValidationResultPanel } from '@/components/returns/ValidationResultPanel';
import { RatioSummaryCard } from '@/components/returns/RatioSummaryCard';

interface Props {
  returnId: string;
  returnConfigId?: string | null;
  formData: ReturnFormData;
  onNavigateField?: (formId: string | undefined, fieldKey: string) => void;
  hideValidation?: boolean;
}

/**
 * Shared panel used inside ReturnDetail and (optionally) FillReturnPage.
 * Runs the same rules/ratios evaluator the server uses at submit time,
 * plus overlays persisted breaches recorded on prior server-side runs.
 */
export function ReturnValidationAndRatiosPanel({ returnId, returnConfigId, formData, onNavigateField, hideValidation = false }: Props) {
  const { data: rules = [] } = useValidationRules(returnConfigId ?? undefined);
  const { data: ratios = [] } = useRatios(returnConfigId ?? undefined);
  const { data: thresholds = [] } = useThresholds(returnConfigId ?? undefined);
  const { data: persistedBreaches = [] } = useReturnBreaches(returnId);
  const { data: persistedRatios = [] } = useReturnComputedRatios(returnId);

  const summary = useMemo(() => evaluateRules(rules, formData), [rules, formData]);
  const liveRatios = useMemo(() => computeAllRatios(ratios, formData), [ratios, formData]);
  const liveBreaches = useMemo(() => detectBreaches(liveRatios, thresholds), [liveRatios, thresholds]);

  const ratiosToShow = liveRatios.length > 0
    ? liveRatios
    : persistedRatios.map((p: any) => ({
        ratio_key: p.ratio_key,
        label: p.label ?? p.ratio_key,
        value: p.value == null ? null : Number(p.value),
        display_format: (p.display_format ?? 'decimal') as any,
        metric_key: null,
      }));

  const breachesToShow = liveBreaches.length > 0 ? liveBreaches : persistedBreaches as any;

  return (
    <div className="space-y-3">
      <ValidationResultPanel summary={summary} onNavigateField={onNavigateField} />
      <RatioSummaryCard ratios={ratiosToShow} breaches={breachesToShow} />
    </div>
  );
}
