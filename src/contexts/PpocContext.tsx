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
  /**
   * True when the current user has at least one active PPOC mapping. This is
   * a CAPABILITY flag — it does NOT mean every action runs in PPOC context.
   * Use `actingAs === 'ppoc'` to check the currently selected operating mode.
   */
  isPpoc: boolean;
  /** All licensees the current user is mapped to as PPOC (active mappings only). */
  mappedLicensees: MappedLicensee[];
  /** Currently selected licensee id (own or mapped). */
  activeLicenseeId: string | null;
  activeLicensee: MappedLicensee | null;
  setActiveLicenseeId: (id: string | null) => void;
  loading: boolean;
  /** The user's own Primary User licensee, from profiles.licensee_id. */
  ownLicenseeId: string | null;
  /**
   * 'primary' when the active selection is the user's own licensee (or no
   * PPOC mapping exists), 'ppoc' when acting on behalf of a mapped licensee.
   */
  actingAs: 'primary' | 'ppoc';
  /** Resolved licensee context: active selection, else own. */
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

      const [mappingsRes, profileRes, approvedLicensees, mappedEntitiesRes] = await Promise.all([
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
        (supabase as any).rpc('get_my_ppoc_mapped_entities'),
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

      const mappedEntities = (mappedEntitiesRes.data || []) as any[];
      const mappings = (mappingsRes.data || []) as any[];
      if (!mappedEntitiesRes.error && mappedEntities.length > 0) {
        const nameCounts = new Map<string, number>();
        mappedEntities.forEach((row: any) => {
          const baseName = row?.entity_name || '—';
          nameCounts.set(baseName, (nameCounts.get(baseName) || 0) + 1);
        });

        const list: MappedLicensee[] = mappedEntities
          .map((row: any) => {
            const baseName = row?.entity_name || '—';
            const suffix = (nameCounts.get(baseName) || 0) > 1
              ? ` · ${row?.license_number || `#${String(row?.licensee_id || '').slice(0, 8)}`}`
              : '';

            return {
              licensee_id: row.licensee_id,
              licensee_name: `${baseName}${suffix}`,
              sector_id: row.sector_id ?? null,
              resolved_sector_id: row.resolved_sector_id ?? row.sector_id ?? null,
              created_at: row.created_at ?? null,
              application_id: row.application_id ?? null,
            };
          })
          .filter((x: MappedLicensee) => Boolean(x.licensee_id))
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
      } else if (!mappingsRes.error && mappings.length > 0) {
        const mappingIds = mappings.map((m) => m.id);
        const mappingLicenseeIds = Array.from(new Set(mappings.map((m) => m.licensee_id).filter(Boolean)));

        // Fetch real licensee rows for the mapped IDs directly — do NOT rely
        // solely on approvedLicensees, which dedupes licensees sharing the
        // same display_name + sector and would hide additional PPOC mappings.
        const [{ data: mapSectors }, { data: rawLicensees }] = await Promise.all([
          supabase
            .from('ppoc_mapping_sectors' as any)
            .select('mapping_id, sector_id')
            .in('mapping_id', mappingIds),
          supabase
            .from('licensees' as any)
            .select('id, name, sector_id, status, created_at, license_id')
            .in('id', mappingLicenseeIds),
        ]);

        if (cancelled) return;

        const rawLicMap = new Map<string, any>(
          ((rawLicensees || []) as any[]).map((row: any) => [row.id, row])
        );

        // Disambiguate licensees that share the same display name by appending
        // the license number (or a short id fallback).
        const licenseIdsForNumbers = Array.from(
          new Set(((rawLicensees || []) as any[]).map((r: any) => r.license_id).filter(Boolean))
        );
        const licenseNumberMap = new Map<string, string>();
        if (licenseIdsForNumbers.length > 0) {
          const { data: licRows } = await supabase
            .from('licenses' as any)
            .select('id, license_number')
            .in('id', licenseIdsForNumbers);
          ((licRows || []) as any[]).forEach((row: any) => {
            if (row?.id && row?.license_number) licenseNumberMap.set(row.id, row.license_number);
          });
        }

        const sectorsByMapping: Record<string, Set<string>> = {};
        ((mapSectors || []) as any[]).forEach((row) => {
          if (!sectorsByMapping[row.mapping_id]) sectorsByMapping[row.mapping_id] = new Set();
          sectorsByMapping[row.mapping_id].add(row.sector_id);
        });

        const allowedLicenseeIds = new Set<string>();
        mappings.forEach((mapping) => {
          const enriched: any = approvedById.get(mapping.licensee_id);
          const raw = rawLicMap.get(mapping.licensee_id);
          if (!enriched && !raw) return;
          const licSector = enriched?.resolved_sector_id || enriched?.sector_id || raw?.sector_id;
          const restriction = sectorsByMapping[mapping.id];
          if (!restriction || restriction.size === 0) {
            allowedLicenseeIds.add(mapping.licensee_id);
          } else if (licSector && restriction.has(licSector)) {
            allowedLicenseeIds.add(mapping.licensee_id);
          }
        });

        const baseNameById = new Map<string, string>();
        Array.from(allowedLicenseeIds).forEach((licenseeId) => {
          const enriched: any = approvedById.get(licenseeId);
          const raw = rawLicMap.get(licenseeId);
          baseNameById.set(
            licenseeId,
            enriched?.display_name || enriched?.name || raw?.name || '—'
          );
        });
        const nameCounts = new Map<string, number>();
        baseNameById.forEach((n) => nameCounts.set(n, (nameCounts.get(n) || 0) + 1));

        const list: MappedLicensee[] = Array.from(allowedLicenseeIds)
          .map((licenseeId): MappedLicensee | null => {
            const enriched: any = approvedById.get(licenseeId);
            const raw = rawLicMap.get(licenseeId);
            if (!enriched && !raw) return null;
            const baseName = baseNameById.get(licenseeId) || '—';
            const licenseNumber = raw?.license_id
              ? licenseNumberMap.get(raw.license_id)
              : enriched?.license_number;
            const suffix = (nameCounts.get(baseName) || 0) > 1
              ? ` · ${licenseNumber || `#${licenseeId.slice(0, 8)}`}`
              : '';
            return {
              licensee_id: licenseeId,
              licensee_name: `${baseName}${suffix}`,
              sector_id: enriched?.sector_id ?? raw?.sector_id ?? null,
              resolved_sector_id: enriched?.resolved_sector_id ?? raw?.sector_id ?? null,
              created_at: enriched?.created_at ?? raw?.created_at ?? null,
              application_id: enriched?.application_id ?? null,
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

  // PPOC status is granted ONLY through an active row in ppoc_entity_mappings
  // (loaded above into `mappedLicensees`). A Primary User without a mapping is
  // NOT a PPOC, even if their profile.user_type is 'primary' or they hold the
  // `licensee_primary` role — those grant Primary User access to their own
  // entity via profiles.licensee_id, not PPOC rights.
  const isPpoc = mappedLicensees.length > 0;
  const ownLicenseeId = user?.licenseeId
    || (resolvedLicensees.length === 1 ? resolvedLicensees[0].licensee_id : resolvedLicensees[0]?.licensee_id)
    || null;

  // Acting mode: 'primary' when the selection points at the user's own entity
  // (or no PPOC mappings exist), 'ppoc' when the selection points at a mapped
  // licensee that the user does NOT own as Primary User.
  const actingAs: 'primary' | 'ppoc' = (() => {
    if (!isPpoc) return 'primary';
    if (activeLicenseeId && ownLicenseeId && activeLicenseeId === ownLicenseeId) return 'primary';
    if (activeLicenseeId && mappedLicensees.some(l => l.licensee_id === activeLicenseeId)) return 'ppoc';
    return 'ppoc';
  })();

  const activeLicensee = mappedLicensees.find(l => l.licensee_id === activeLicenseeId) || null;
  const resolvedLicenseeId = useMemo(() => {
    if (activeLicenseeId) return activeLicenseeId;
    return ownLicenseeId;
  }, [activeLicenseeId, ownLicenseeId]);

  return (
    <PpocContext.Provider
      value={{
        isPpoc,
        mappedLicensees,
        activeLicenseeId,
        activeLicensee,
        setActiveLicenseeId,
        loading,
        ownLicenseeId,
        actingAs,
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
      ownLicenseeId: null,
      actingAs: 'primary',
      resolvedLicenseeId: null,
    } as PpocContextValue;
  }
  return ctx;
}
