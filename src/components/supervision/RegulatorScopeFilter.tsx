/**
 * Regulator context / selector for supervisory configuration screens.
 *
 * Behaviour follows the canonical effective-regulator contract:
 *   0 selectable  → an explicit "no active regulator" message, never a widened scope.
 *   1 selectable  → contextual information only ("Regulator: <name>"), no dropdown.
 *   2+ selectable → a real selector; "All regulators" only when the server says
 *                   cross-regulator viewing is allowed for this actor.
 *
 * "All regulators" is an enterprise-oversight concept, not a normal regulator
 * configuration value, and platform/MIPL reference content is never labelled
 * with it.
 */
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { readEmbeddedScope, type EmbeddedRegulatorScope } from '@/hooks/useRegulatorScope';

export function RegulatorScopeFilter({
  options,
  value,
  onChange,
  id,
}: {
  options?: EmbeddedRegulatorScope | null;
  value: string;
  onChange: (value: string) => void;
  id?: string;
}) {
  const scope = readEmbeddedScope(options);

  if (scope.count === 0) {
    return (
      <span className="text-xs text-muted-foreground" data-testid="regulator-scope-empty">
        {scope.reason ?? 'No active regulator is available in your authorised scope.'}
      </span>
    );
  }

  if (scope.count === 1) {
    const only = scope.activeRegulator!;
    return (
      <Badge variant="secondary" className="h-9 gap-1 px-3 font-normal" data-testid="regulator-scope-context">
        Regulator: {only.name}
      </Badge>
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="h-9 w-[13rem]" aria-label="Regulator"><SelectValue /></SelectTrigger>
      <SelectContent>
        {scope.crossRegulatorAllowed ? <SelectItem value="all">All regulators</SelectItem> : null}
        {scope.regulators.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
