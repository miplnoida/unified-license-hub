import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { loadApprovedLicenseeOptions } from '@/lib/licenseeOptions';

const STORAGE_KEY = 'ppoc.activeLicenseeId';

export interface MappedLicensee {
  licensee_id: string;
  licensee_name: string;
  sector_id?: string | null;
  resolved_sector_id?: string | null;
  created_at?: string | null;
  application_id?: string | null;
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
  const [resolvedLicensees, setResolvedLicensees] = useState<MappedLicensee[]>([]);
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
      setResolvedLicensees([]);
      setActiveLicenseeIdState(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);

      const [mappingsRes, profileRes, approvedLicensees] = await Promise.all([
        supabase
          .from('ppoc_entity_mappings' as any)
          .select('id, licensee_id')
          .eq('ppoc_user_id', user.id)
          .eq('is_active', true),
        supabase
          .from('profiles' as any)
          .select('licensee_id')
          .eq('id', user.id)
          .maybeSingle(),
        loadApprovedLicenseeOptions({ onlyActive: false }),
      ]);

      if (cancelled) return;

      const approvedById = new Map(
        approvedLicensees.map((licensee: any) => [licensee.id, licensee])
      );

      const resolvedMap = new Map<string, MappedLicensee>();
      const addResolved = (licensee: any) => {
        if (!licensee?.id || resolvedMap.has(licensee.id)) return;
        resolvedMap.set(licensee.id, {
          licensee_id: licensee.id,
          licensee_name: licensee.display_name || licensee.name || '—',
          sector_id: licensee.sector_id ?? null,
          resolved_sector_id: licensee.resolved_sector_id ?? licensee.sector_id ?? null,
          created_at: licensee.created_at ?? null,
          application_id: licensee.application_id ?? null,
        });
      };

      const profileLicenseeId = (profileRes.data as any)?.licensee_id ?? user.licenseeId ?? null;
      if (profileLicenseeId && approvedById.has(profileLicenseeId)) {
        addResolved(approvedById.get(profileLicenseeId));
      }

      if (!profileLicenseeId) {
        const [directLicenseeRes, holderLicenseRowsRes, applicantRowsRes, registrationRes] = await Promise.all([
          supabase
            .from('licensees' as any)
            .select('id, license_id, sector_id, created_at, name, status')
            .eq('name', user.entityName || '__no_entity__')
            .order('created_at', { ascending: true }),
          supabase
            .from('licenses' as any)
            .select('id')
            .eq('holder_id', user.id),
          supabase
            .from('applications' as any)
            .select('id, created_at')
            .eq('applicant_id', user.id)
            .order('created_at', { ascending: true }),
          supabase
            .from('registrations' as any)
            .select('sector_id, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })
            .limit(1),
        ]);

        ((directLicenseeRes.data || []) as any[]).forEach(addResolved);

        const licenseIds = new Set<string>();
        ((holderLicenseRowsRes.data || []) as any[]).forEach((row: any) => {
          if (row?.id) licenseIds.add(row.id);
        });

        if (licenseIds.size > 0) {
          const linkedLicensees = approvedLicensees.filter((licensee: any) => licensee.raw?.license_id && licenseIds.has(licensee.raw.license_id));
          linkedLicensees.forEach(addResolved);
        }

        const applicationIds = new Set<string>(((applicantRowsRes.data || []) as any[]).map((row: any) => row.id).filter(Boolean));
        const applicationLinkedLicensees = approvedLicensees.filter((licensee: any) => licensee.application_id && applicationIds.has(licensee.application_id));
        applicationLinkedLicensees.forEach(addResolved);

        const registrationSectorId = ((registrationRes.data || []) as any[])[0]?.sector_id ?? null;
        if (registrationSectorId) {
          approvedLicensees
            .filter((licensee: any) => (licensee.resolved_sector_id || licensee.sector_id) === registrationSectorId)
            .forEach(addResolved);
        }

        if (resolvedMap.size === 0 && approvedLicensees.length === 1) {
          addResolved(approvedLicensees[0]);
        }
      }

      const resolvedList = Array.from(resolvedMap.values()).sort((a, b) => {
        const at = new Date(a.created_at || 0).getTime();
        const bt = new Date(b.created_at || 0).getTime();
        return at - bt || a.licensee_name.localeCompare(b.licensee_name);
      });

      const mappings = (mappingsRes.data || []) as any[];
      if (!mappingsRes.error && mappings.length > 0) {
        const mappingIds = mappings.map((m) => m.id);
        const ids = mappings.map((m) => m.licensee_id);
        const { data: mapSectors } = await supabase
          .from('ppoc_mapping_sectors' as any)
          .select('mapping_id, sector_id')
          .in('mapping_id', mappingIds);

        if (cancelled) return;

        const sectorsByMapping: Record<string, Set<string>> = {};
        ((mapSectors || []) as any[]).forEach((row) => {
          if (!sectorsByMapping[row.mapping_id]) sectorsByMapping[row.mapping_id] = new Set();
          sectorsByMapping[row.mapping_id].add(row.sector_id);
        });

        const allowedLicenseeIds = new Set<string>();
        mappings.forEach((mapping) => {
          const lic = approvedById.get(mapping.licensee_id);
          if (!lic || !ids.includes(mapping.licensee_id)) return;
          const restriction = sectorsByMapping[mapping.id];
          const licSector = lic.resolved_sector_id || lic.sector_id;
          if (!restriction || restriction.size === 0) {
            allowedLicenseeIds.add(mapping.licensee_id);
          } else if (licSector && restriction.has(licSector)) {
            allowedLicenseeIds.add(mapping.licensee_id);
          }
        });

        const list: MappedLicensee[] = Array.from(allowedLicenseeIds)
          .map((licenseeId): MappedLicensee | null => {
            const licensee: any = approvedById.get(licenseeId);
            if (!licensee) return null;
            return {
              licensee_id: licensee.id,
              licensee_name: licensee.display_name || licensee.name || '—',
              sector_id: licensee.sector_id ?? null,
              resolved_sector_id: licensee.resolved_sector_id ?? licensee.sector_id ?? null,
              created_at: licensee.created_at ?? null,
              application_id: licensee.application_id ?? null,
            };
          })
          .filter((x): x is MappedLicensee => x !== null)
          .sort((a, b) => {
            const at = new Date(a.created_at || 0).getTime();
            const bt = new Date(b.created_at || 0).getTime();
            return at - bt || a.licensee_name.localeCompare(b.licensee_name);
          });
        setMappedLicensees(list);

        let initial: string | null = null;
        try {
          initial = sessionStorage.getItem(STORAGE_KEY);
        } catch {
          initial = null;
        }
        if (!initial || !list.some((licensee) => licensee.licensee_id === initial)) {
          initial = list[0]?.licensee_id || null;
        }
        setActiveLicenseeIdState(initial);
        try {
          if (initial) sessionStorage.setItem(STORAGE_KEY, initial);
          else sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      } else {
        setMappedLicensees([]);
        setActiveLicenseeIdState(null);
      }

      setResolvedLicensees(resolvedList);
      if (import.meta.env.DEV) {
        console.log('licensee context', {
          userId: user.id,
          role: user.role,
          profileLicenseeId,
          resolvedLicenseeId: profileLicenseeId || resolvedList[0]?.licensee_id || null,
        });
      }
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isFullyAuthenticated, user?.id, user?.licenseeId, user?.entityName]);

  const isPpoc = mappedLicensees.length > 0;
  const activeLicensee = mappedLicensees.find(l => l.licensee_id === activeLicenseeId) || null;
  const resolvedLicenseeId = useMemo(() => {
    if (isPpoc) return activeLicenseeId;
    if (user?.licenseeId) return user.licenseeId;
    return resolvedLicensees.length === 1 ? resolvedLicensees[0].licensee_id : resolvedLicensees[0]?.licensee_id || null;
  }, [isPpoc, activeLicenseeId, user?.licenseeId, resolvedLicensees]);

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
