import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Regulator {
  id: string;
  name: string;
  code: string;
  description: string | null;
  logo_url: string | null;
  status: string;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface RegulatorContextType {
  activeRegulatorId: string | null;
  activeRegulator: Regulator | null;
  regulators: Regulator[];
  isLoading: boolean;
  setActiveRegulator: (id: string) => void;
  clearActiveRegulator: () => void;
}

const RegulatorContext = createContext<RegulatorContextType | undefined>(undefined);

const STORAGE_KEY = 'active-regulator-id';

function getStoredRegulatorId(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function persistRegulatorId(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* storage unavailable */ }
}

function pickDefaultRegulator(regulators: Regulator[]): Regulator | null {
  if (regulators.length === 0) return null;

  return (
    regulators.find(r => r.settings?.default === true || r.settings?.is_default === true) ||
    regulators.find(r => String(r.code).toUpperCase() === 'R001') ||
    regulators.find(r => /\bolras\b/i.test(`${r.name} ${r.code}`)) ||
    regulators[0]
  );
}

export function RegulatorProvider({ children }: { children: ReactNode }) {
  const [activeRegulatorId, setActiveRegulatorId] = useState<string | null>(() => getStoredRegulatorId());

  const { data: regulators = [], isLoading } = useQuery({
    queryKey: ['regulators'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('regulators' as any).select('*').eq('status', 'active').order('name') as any);
      if (error) throw error;
      return (data || []) as Regulator[];
    },
  });

  // Auto-select a valid regulator. Custom domains can have their own localStorage,
  // so stale or alphabetically selected contexts must be corrected before scoped
  // admin pages query empty data sets.
  useEffect(() => {
    if (isLoading || regulators.length === 0) return;

    const selected = activeRegulatorId
      ? regulators.find(r => r.id === activeRegulatorId)
      : null;

    if (selected) return;

    const fallback = pickDefaultRegulator(regulators);
    if (fallback) {
      setActiveRegulatorId(fallback.id);
      persistRegulatorId(fallback.id);
    }
  }, [regulators, activeRegulatorId, isLoading]);

  const activeRegulator = useMemo(
    () => regulators.find(r => r.id === activeRegulatorId) || null,
    [regulators, activeRegulatorId],
  );

  // localStorage remembers a preference only; it is never authority. Every
  // server read and write re-derives the actor's regulator authority, so a
  // tampered stored id cannot widen scope. A stored id that is not an active
  // regulator is discarded here as well.
  const setActiveRegulator = useCallback((id: string) => {
    if (!regulators.some(r => r.id === id)) return;
    setActiveRegulatorId(id);
    persistRegulatorId(id);
  }, [regulators]);

  const clearActiveRegulator = useCallback(() => {
    setActiveRegulatorId(null);
    persistRegulatorId(null);
  }, []);

  return (
    <RegulatorContext.Provider value={{ activeRegulatorId, activeRegulator, regulators, isLoading, setActiveRegulator, clearActiveRegulator }}>
      {children}
    </RegulatorContext.Provider>
  );
}

export function useRegulator() {
  const context = useContext(RegulatorContext);
  if (!context) throw new Error('useRegulator must be used within RegulatorProvider');
  return context;
}
