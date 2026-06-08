import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePpoc } from '@/contexts/PpocContext';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';
import { loadVisibleApplications } from '@/lib/visibleApplications';

export interface SectorOption {
  id: string;
  name: string;
}

interface ActiveSectorContextType {
  activeSectorId: string | null;
  activeSectorName: string | null;
  availableSectors: SectorOption[];
  loading: boolean;
  setActiveSector: (id: string, name: string) => void;
  clearActiveSector: () => void;
}

const ActiveSectorContext = createContext<ActiveSectorContextType | undefined>(undefined);

const STORAGE_KEY = 'active-sector';

function readStored(): { id: string | null; name: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { id: p.id || null, name: p.name || null };
    }
  } catch { /* ignore */ }
  return { id: null, name: null };
}

function writeStored(id: string | null, name: string | null) {
  try {
    if (id && name) localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, name }));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

export function ActiveSectorProvider({ children }: { children: ReactNode }) {
  const { user, isFullyAuthenticated } = useAuth();
  const { isPpoc, activeLicenseeId, resolvedLicenseeId } = usePpoc();
  const portalContext = useEffectivePortalContext();

  const initial = readStored();
  const [activeSectorId, setActiveSectorId] = useState<string | null>(initial.id);
  const [activeSectorName, setActiveSectorName] = useState<string | null>(initial.name);
  const [availableSectors, setAvailableSectors] = useState<SectorOption[]>([]);
  const [loading, setLoading] = useState(false);

  const setActiveSector = useCallback((id: string, name: string) => {
    setActiveSectorId(id);
    setActiveSectorName(name);
    writeStored(id, name);
  }, []);

  const clearActiveSector = useCallback(() => {
    setActiveSectorId(null);
    setActiveSectorName(null);
    writeStored(null, null);
  }, []);

  useEffect(() => {
    if (!isFullyAuthenticated || !user) return;
    if (portalContext.loading) return;
    const isLicenseeUser = portalContext.isLicensee || isPpoc;
    if (!isLicenseeUser) {
      setAvailableSectors([]);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);

      // Collect sector ids in registration/creation order to compute the default.
      const ordered: string[] = [];
      const seen = new Set<string>();
      const add = (id: string | null | undefined) => {
        if (!id || seen.has(id)) return;
        seen.add(id);
        ordered.push(id);
      };

      try {
        if (resolvedLicenseeId) {
          // Resolve sectors strictly from the active/resolved licensee entity chain.
          const { data: lic } = await supabase
            .from('licensees' as any)
            .select('sector_id, license_id, created_at')
            .eq('id', resolvedLicenseeId)
            .maybeSingle();
          add((lic as any)?.sector_id);
          const licenseId = (lic as any)?.license_id;
          if (licenseId) {
            const { data: license } = await supabase
              .from('licenses' as any)
              .select('application_id, sector_id, created_at')
              .eq('id', licenseId)
              .maybeSingle();
            add((license as any)?.sector_id);
            const appId = (license as any)?.application_id;
            if (appId) {
              const { data: app } = await supabase
                .from('applications' as any)
                .select('applicant_id, data, created_at')
                .eq('id', appId)
                .maybeSingle();
              const applicantId = (app as any)?.applicant_id;
              if (applicantId) {
                const { data: regs } = await supabase
                  .from('registrations' as any)
                  .select('sector_id, created_at')
                  .eq('user_id', applicantId)
                  .order('created_at', { ascending: true });
                ((regs || []) as any[]).forEach(r => add(r.sector_id));
              }
              add((app as any)?.data?.sector_id);
            }
          }

          const visibleApps = await loadVisibleApplications({ licenseeId: resolvedLicenseeId });
          visibleApps.forEach((app) => add(app.resolved_sector_id || app.sector_id || app.data?.sector_id));
        } else {
          // Fallback for users not yet linked to a licensee entity.
          const userId = user.id;
          const [regsRes, appsRes, profRes] = await Promise.all([
            supabase
              .from('registrations' as any)
              .select('sector_id, created_at')
              .eq('user_id', userId)
              .order('created_at', { ascending: true }),
            supabase
              .from('applications' as any)
              .select('data, created_at')
              .eq('applicant_id', userId)
              .order('created_at', { ascending: true }),
            supabase
              .from('profiles' as any)
              .select('licensee_id')
              .eq('id', userId)
              .maybeSingle(),
          ]);
          ((regsRes.data || []) as any[]).forEach(r => add(r.sector_id));
          ((appsRes.data || []) as any[]).forEach(a => add(a?.data?.sector_id));
          const licId = (profRes.data as any)?.licensee_id;
          if (licId) {
            const { data: lic } = await supabase
              .from('licensees' as any)
              .select('sector_id')
              .eq('id', licId)
              .maybeSingle();
            add((lic as any)?.sector_id);
          }
        }
      } catch {
        /* ignore - degrade gracefully */
      }

      if (cancelled) return;

      let options: SectorOption[] = [];
      let defaultId: string | null = null;
      if (ordered.length) {
        const { data: secs } = await supabase
          .from('sectors' as any)
          .select('id, name')
          .in('id', ordered);
        const byId: Record<string, string> = {};
        ((secs || []) as any[]).forEach(s => { byId[s.id] = s.name; });
        // Preserve registration order for default; sort options alphabetically for display.
        const valid = ordered.filter(id => byId[id]);
        defaultId = valid[0] || null;
        options = valid
          .map(id => ({ id, name: byId[id] }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }

      if (cancelled) return;
      setAvailableSectors(options);

      const stored = readStored();
      const storedValid = stored.id && options.some(o => o.id === stored.id);
      if (storedValid) {
        const match = options.find(o => o.id === stored.id)!;
        setActiveSectorId(match.id);
        setActiveSectorName(match.name);
        writeStored(match.id, match.name);
      } else if (defaultId) {
        const def = options.find(o => o.id === defaultId)!;
        setActiveSectorId(def.id);
        setActiveSectorName(def.name);
        writeStored(def.id, def.name);
      } else {
        setActiveSectorId(null);
        setActiveSectorName(null);
        writeStored(null, null);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [activeLicenseeId, isFullyAuthenticated, isPpoc, portalContext.isLicensee, portalContext.loading, resolvedLicenseeId, user?.id]);

  return (
    <ActiveSectorContext.Provider
      value={{ activeSectorId, activeSectorName, availableSectors, loading, setActiveSector, clearActiveSector }}
    >
      {children}
    </ActiveSectorContext.Provider>
  );
}

export function useActiveSector() {
  const context = useContext(ActiveSectorContext);
  if (!context) throw new Error('useActiveSector must be used within ActiveSectorProvider');
  return context;
}
