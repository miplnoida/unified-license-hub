import { useMemo } from 'react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import type { RoleScopeConfig } from '@/hooks/useRoles';

const SCOPE_OPTIONS: { value: NonNullable<RoleScopeConfig[string]['scope']>; label: string; help: string }[] = [
  { value: 'all', label: 'All records', help: 'See every record in this module (default)' },
  { value: 'assigned', label: 'Assigned only', help: 'Only records assigned to the user or their team' },
  { value: 'sector', label: 'Selected sectors', help: 'Only records belonging to specific sectors' },
  { value: 'department', label: 'Own department', help: 'Only records owned by the user\'s department' },
  { value: 'own', label: 'Own records only', help: 'Only records the user created' },
];

interface Props {
  /** Module keys that appear in this role's permission set. */
  moduleKeys: string[];
  /** Human labels keyed by module key. */
  moduleLabels: Record<string, string>;
  value: RoleScopeConfig;
  onChange: (next: RoleScopeConfig) => void;
  disabled?: boolean;
}

/**
 * Record Scope panel — lets an administrator narrow the *set* of records a
 * role can see per module. The backend does not automatically enforce these
 * — they are business-facing hints stored in `roles.scope_config` and read
 * by module-specific RLS helpers (e.g. `can_view_entity_returns`) that
 * already exist. New helpers should consult this JSON to widen or narrow
 * their gates rather than adding new permission actions.
 */
export function RecordScopePanel({ moduleKeys, moduleLabels, value, onChange, disabled }: Props) {
  const sortedModules = useMemo(
    () => [...moduleKeys].sort((a, b) => (moduleLabels[a] || a).localeCompare(moduleLabels[b] || b)),
    [moduleKeys, moduleLabels],
  );

  if (sortedModules.length === 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Assign some capabilities first — record scope only applies to modules where this role has access.
        </AlertDescription>
      </Alert>
    );
  }

  const setModule = (mod: string, patch: Partial<RoleScopeConfig[string]>) => {
    const next: RoleScopeConfig = { ...value };
    next[mod] = { ...(next[mod] ?? {}), ...patch };
    // Prune empty entries so the JSON stays tidy.
    if (!next[mod].scope || next[mod].scope === 'all') {
      if (!next[mod].notes) delete next[mod];
    }
    onChange(next);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Record Scope</CardTitle>
        <CardDescription>
          Narrow which records a role can see in each area. Leaving a module at <span className="font-medium">All records</span> keeps the default visibility.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedModules.map((mod) => {
          const cfg = value[mod] ?? {};
          const current = cfg.scope ?? 'all';
          return (
            <div key={mod} className="grid gap-3 border rounded-md p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{moduleLabels[mod] || mod}</span>
                  {current !== 'all' && <Badge variant="outline" className="text-[10px]">Restricted</Badge>}
                </div>
                <Label className="text-xs text-muted-foreground">Scope</Label>
                <Select
                  value={current}
                  onValueChange={(v) => setModule(mod, { scope: v as NonNullable<RoleScopeConfig[string]['scope']> })}
                  disabled={disabled}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCOPE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex flex-col">
                          <span>{opt.label}</span>
                          <span className="text-[11px] text-muted-foreground">{opt.help}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
                <Textarea
                  className="mt-1 min-h-[60px] text-xs"
                  placeholder="E.g. Insurance & Pensions sectors only."
                  value={cfg.notes ?? ''}
                  onChange={(e) => setModule(mod, { notes: e.target.value })}
                  disabled={disabled}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
