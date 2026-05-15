import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { loadApprovedLicenseeOptions } from '@/lib/licenseeOptions';

const STORAGE_KEY = 'ppoc.activeLicenseeId';

export interface MappedLicensee {
  licensee_id: string;
  licensee_name: string;
}

interface PpocContextValue {
  /** True when the current user is mapped as PPOC for one or more licensees */
  isPpoc: boolean;
  /** All licensees the current user is mapped to (active mappings only) */
  mappedLicensees: MappedLicensee[];
  /** The licensee the PPOC is currently acting on behalf of (null if none selected or non-PPOC) */
  activeLicenseeId: string | null;
  activeLicensee: MappedLicensee | null;
  setActiveLicenseeId: (id: string | null) => void;
  loading: boolean;
  /** Resolve the licensee context for any user: PPOC selection, or own profile.licensee_id */
  resolvedLicenseeId: string | null;
}

const PpocContext = createContext<PpocContextValue | undefined>(undefined);

export function PpocProvider({ children }: { children: ReactNode }) {
  const { user, isFullyAuthenticated } = useAuth();
  const [mappedLicensees, setMappedLicensees] = useState<MappedLicensee[]>([]);
  const [activeLicenseeId, setActiveLicenseeIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const setActiveLicenseeId = useCallback((id: string | null) => {
    setActiveLicenseeIdState(id);
    try {
      if (id) sessionStorage.setItem(STORAGE_KEY, id);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore sessionStorage failures (private mode etc.)
    }
  }, []);

  useEffect(() => {
    if (!isFullyAuthenticated || !user) {
      setMappedLicensees([]);
      setActiveLicenseeIdState(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data: mappings, error } = await supabase
        .from('ppoc_entity_mappings' as any)
        .select('id, licensee_id')
        .eq('ppoc_user_id', user.id)
        .eq('is_active', true);

      if (cancelled) return;
      if (error || !mappings || mappings.length === 0) {
        setMappedLicensees([]);
        setActiveLicenseeIdState(null);
        setLoading(false);
        return;
      }

      const mappingRows = mappings as any[];
      const mappingIds = mappingRows.map(m => m.id);
      const ids = mappingRows.map(m => m.licensee_id);

      // Use the same enriched/resolved licensee pipeline as the admin mapping
      // page so that mappings whose sector was resolved from registration or
      // application data still appear here.
      const [enrichedLics, { data: mapSectors }] = await Promise.all([
        loadApprovedLicenseeOptions({ onlyActive: false }),
        supabase.from('ppoc_mapping_sectors' as any).select('mapping_id, sector_id').in('mapping_id', mappingIds),
      ]);

      // Build per-mapping sector restriction sets. Empty => all sectors.
      const sectorsByMapping: Record<string, Set<string>> = {};
      ((mapSectors || []) as any[]).forEach(r => {
        if (!sectorsByMapping[r.mapping_id]) sectorsByMapping[r.mapping_id] = new Set();
        sectorsByMapping[r.mapping_id].add(r.sector_id);
      });

      const licMap = Object.fromEntries(enrichedLics.filter(l => ids.includes(l.id)).map(l => [l.id, l]));
      const allowedLicenseeIds = new Set<string>();
      mappingRows.forEach(m => {
        const lic = licMap[m.licensee_id];
        if (!lic) return;
        const restriction = sectorsByMapping[m.id];
        const licSector = lic.resolved_sector_id || lic.sector_id;
        if (!restriction || restriction.size === 0) {
          allowedLicenseeIds.add(m.licensee_id);
        } else if (licSector && restriction.has(licSector)) {
          allowedLicenseeIds.add(m.licensee_id);
        }
      });

      const filteredLics = enrichedLics.filter((l: any) => allowedLicenseeIds.has(l.id));

      if (cancelled) return;
      const list: MappedLicensee[] = filteredLics.map((l: any) => ({
        licensee_id: l.id,
        licensee_name: l.display_name || l.name,
      }));
      setMappedLicensees(list);

      // Restore previous selection from sessionStorage if still valid, else default to first
      let initial: string | null = null;
      try {
        initial = sessionStorage.getItem(STORAGE_KEY);
      } catch {
        initial = null;
      }
      if (!initial || !list.some(l => l.licensee_id === initial)) {
        initial = list[0]?.licensee_id || null;
      }
      setActiveLicenseeIdState(initial);
      try {
        if (initial) sessionStorage.setItem(STORAGE_KEY, initial);
      } catch { /* ignore */ }
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [isFullyAuthenticated, user]);

  const isPpoc = mappedLicensees.length > 0;
  const activeLicensee = mappedLicensees.find(l => l.licensee_id === activeLicenseeId) || null;
  // Resolved licensee: PPOC's selected licensee, or the user's own licensee from profile
  const resolvedLicenseeId = isPpoc ? activeLicenseeId : (user?.licenseeId || null);

  return (
    <PpocContext.Provider
      value={{
        isPpoc,
        mappedLicensees,
        activeLicenseeId,
        activeLicensee,
        setActiveLicenseeId,
        loading,
        resolvedLicenseeId,
      }}
    >
      {children}
    </PpocContext.Provider>
  );
}

export function usePpoc() {
  const ctx = useContext(PpocContext);
  if (!ctx) {
    // Safe stub if used outside provider (HMR/desync)
    return {
      isPpoc: false,
      mappedLicensees: [],
      activeLicenseeId: null,
      activeLicensee: null,
      setActiveLicenseeId: () => {},
      loading: false,
      resolvedLicenseeId: null,
    } as PpocContextValue;
  }
  return ctx;
}
