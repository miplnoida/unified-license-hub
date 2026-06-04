import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Building2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePpoc } from '@/contexts/PpocContext';
import { supabase } from '@/integrations/supabase/client';

/**
 * Header banner shown when the current user has PPOC mappings and/or owns a
 * licensee as Primary User. When both apply, the user can switch between
 * their own entity (Primary User context) and their PPOC-mapped entities.
 * The selection is persisted in session and used as the licensee context for
 * all downstream operations (returns, filings, etc.).
 */
export function LicenseeSwitcher() {
  const {
    isPpoc,
    mappedLicensees,
    activeLicenseeId,
    setActiveLicenseeId,
    ownLicenseeId,
    actingAs,
  } = usePpoc();

  const [ownName, setOwnName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!ownLicenseeId) { setOwnName(null); return; }
    // Avoid an extra fetch when own == one of the mapped entries.
    const mapped = mappedLicensees.find(l => l.licensee_id === ownLicenseeId);
    if (mapped) { setOwnName(mapped.licensee_name); return; }
    (async () => {
      const { data } = await supabase.from('licensees').select('name').eq('id', ownLicenseeId).maybeSingle();
      if (!cancelled) setOwnName((data as any)?.name || 'My entity');
    })();
    return () => { cancelled = true; };
  }, [ownLicenseeId, mappedLicensees]);

  // Build the full option list: own entity (if any) + mapped, deduped by id.
  const options = useMemo(() => {
    const list: { id: string; name: string; mode: 'primary' | 'ppoc' }[] = [];
    const seen = new Set<string>();
    if (ownLicenseeId) {
      list.push({ id: ownLicenseeId, name: ownName || 'My entity', mode: 'primary' });
      seen.add(ownLicenseeId);
    }
    mappedLicensees.forEach(l => {
      if (seen.has(l.licensee_id)) return;
      list.push({ id: l.licensee_id, name: l.licensee_name, mode: 'ppoc' });
      seen.add(l.licensee_id);
    });
    return list;
  }, [ownLicenseeId, ownName, mappedLicensees]);

  // Nothing to show: user has no PPOC mappings and no need to switch context.
  if (!isPpoc) return null;

  // PPOC-only user with a single mapping: static badge.
  if (!ownLicenseeId && mappedLicensees.length === 1) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2 border-b bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
        <Building2 className="h-4 w-4 text-amber-700 dark:text-amber-300" />
        <span className="text-xs sm:text-sm text-amber-900 dark:text-amber-200 font-medium">
          Acting as PPOC for:
        </span>
        <Badge variant="outline" className="bg-background border-amber-400 text-amber-900 dark:text-amber-200 text-xs">
          {mappedLicensees[0].licensee_name}
        </Badge>
        <Badge variant="secondary" className="text-xs hidden sm:inline-flex ml-auto">PPOC</Badge>
      </div>
    );
  }

  const label = actingAs === 'ppoc' ? 'Acting as PPOC for:' : 'Acting as Primary User of:';

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2 border-b bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
      <Building2 className="h-4 w-4 text-amber-700 dark:text-amber-300" />
      <span className="text-xs sm:text-sm text-amber-900 dark:text-amber-200 font-medium">{label}</span>
      <Select value={activeLicenseeId || ''} onValueChange={(v) => setActiveLicenseeId(v)}>
        <SelectTrigger className="h-8 w-[260px] bg-background border-amber-400 text-amber-900 dark:text-amber-200 text-xs">
          <SelectValue placeholder="Select licensee" />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => (
            <SelectItem key={o.id} value={o.id}>
              <span className="flex items-center gap-2">
                <span>{o.name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {o.mode === 'primary' ? 'Primary User' : 'PPOC'}
                </Badge>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Badge variant="secondary" className="text-xs hidden sm:inline-flex ml-auto">
        {actingAs === 'ppoc' ? 'PPOC' : 'Primary User'}
      </Badge>
    </div>
  );
}
