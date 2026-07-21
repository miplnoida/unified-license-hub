import { useMemo, useEffect, useState } from 'react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  getScopeCapability,
  requiredSelectorFor,
  type ScopeKind,
} from '@/lib/rbac/scopeCapabilities';
import type { RoleScopeConfig } from '@/hooks/useRoles';

interface Props {
  moduleKeys: string[];
  moduleLabels: Record<string, string>;
  value: RoleScopeConfig;
  onChange: (next: RoleScopeConfig) => void;
  disabled?: boolean;
}

interface SelectorOptions {
  sectors: { id: string; name: string }[];
  licensees: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  teams: { id: string; name: string }[];
}

const EMPTY_OPTS: SelectorOptions = { sectors: [], licensees: [], departments: [], teams: [] };

/**
 * Record Scope — driven strictly by the capability registry. Modules with
 * `scopeless: true` are hidden; unsupported scope options never appear;
 * free-text notes are gone — every restriction resolves to concrete IDs
 * the backend can enforce.
 */
export function RecordScopePanel({ moduleKeys, moduleLabels, value, onChange, disabled }: Props) {
  const [opts, setOpts] = useState<SelectorOptions>(EMPTY_OPTS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [sectorsRes, licenseesRes] = await Promise.all([
        supabase.from('sectors').select('id, name').order('name'),
        supabase.from('licensees').select('id, name').order('name').limit(500),
      ]);
      if (cancelled) return;
      setOpts({
        sectors: (sectorsRes.data || []) as { id: string; name: string }[],
        licensees: (licenseesRes.data || []) as { id: string; name: string }[],
        departments: [], // no department table yet — capability registry disables this scope everywhere it isn't backed
        teams: [],
      });
    })();
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    return moduleKeys
      .map(mod => ({ mod, cap: getScopeCapability(mod) }))
      .filter(row => row.cap && !row.cap.scopeless && row.cap.options.length > 1)
      .sort((a, b) => (moduleLabels[a.mod] || a.mod).localeCompare(moduleLabels[b.mod] || b.mod));
  }, [moduleKeys, moduleLabels]);

  if (rows.length === 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          None of this role's modules support record-level scoping. All granted permissions apply across every record.
        </AlertDescription>
      </Alert>
    );
  }

  const setModule = (mod: string, patch: Partial<RoleScopeConfig[string]>) => {
    const next: RoleScopeConfig = { ...value };
    const merged = { ...(next[mod] ?? {}), ...patch };
    if (!merged.scope || merged.scope === 'all') {
      delete next[mod];
    } else {
      next[mod] = merged;
    }
    onChange(next);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Record Scope</CardTitle>
        <CardDescription>
          Narrow which records a role can see per module. Only options the backend actually enforces are shown.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map(({ mod, cap }) => {
          const cfg = value[mod] ?? {};
          const current = (cfg.scope ?? 'all') as ScopeKind;
          const selectorKind = requiredSelectorFor(mod, current);
          const optionList = cap!.options;
          const selectedIds =
            selectorKind === 'sectors' ? cfg.sectors ?? [] :
            selectorKind === 'licensees' ? cfg.licensees ?? [] :
            selectorKind === 'departments' ? cfg.departments ?? [] :
            selectorKind === 'teams' ? cfg.teams ?? [] : [];
          const selectorPool =
            selectorKind === 'sectors' ? opts.sectors :
            selectorKind === 'licensees' ? opts.licensees :
            selectorKind === 'departments' ? opts.departments :
            selectorKind === 'teams' ? opts.teams : [];
          return (
            <div key={mod} className="grid gap-3 border rounded-md p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{moduleLabels[mod] || cap!.label}</span>
                  {current !== 'all' && <Badge variant="outline" className="text-[10px]">Restricted</Badge>}
                </div>
                <Label className="text-xs text-muted-foreground">Scope</Label>
                <Select
                  value={current}
                  onValueChange={(v) =>
                    setModule(mod, {
                      scope: v as ScopeKind,
                      sectors: undefined, licensees: undefined, departments: undefined, teams: undefined,
                    })
                  }
                  disabled={disabled}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {optionList.map(opt => (
                      <SelectItem key={opt.kind} value={opt.kind}>
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
                {selectorKind ? (
                  <>
                    <Label className="text-xs text-muted-foreground">
                      Choose {selectorKind}
                    </Label>
                    <div className="mt-1 max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                      {selectorPool.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">No {selectorKind} available.</p>
                      ) : selectorPool.map(item => {
                        const checked = selectedIds.includes(item.id);
                        return (
                          <label key={item.id} className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => {
                                const nextIds = checked
                                  ? selectedIds.filter(id => id !== item.id)
                                  : [...selectedIds, item.id];
                                setModule(mod, { [selectorKind]: nextIds } as Partial<RoleScopeConfig[string]>);
                              }}
                            />
                            <span className="truncate">{item.name}</span>
                          </label>
                        );
                      })}
                    </div>
                    {selectedIds.length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {selectedIds.length} selected
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground pt-6">
                    No additional selection needed for this scope.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
