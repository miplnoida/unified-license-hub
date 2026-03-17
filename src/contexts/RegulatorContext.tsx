import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
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

export function RegulatorProvider({ children }: { children: ReactNode }) {
  const [activeRegulatorId, setActiveRegulatorId] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  });

  const { data: regulators = [], isLoading } = useQuery({
    queryKey: ['regulators'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('regulators' as any).select('*').eq('status', 'active').order('name') as any);
      if (error) throw error;
      return (data || []) as Regulator[];
    },
  });

  // Auto-select first regulator if none selected
  useEffect(() => {
    if (!activeRegulatorId && regulators.length > 0) {
      setActiveRegulatorId(regulators[0].id);
      localStorage.setItem(STORAGE_KEY, regulators[0].id);
    }
  }, [regulators, activeRegulatorId]);

  const activeRegulator = regulators.find(r => r.id === activeRegulatorId) || null;

  const setActiveRegulator = useCallback((id: string) => {
    setActiveRegulatorId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const clearActiveRegulator = useCallback(() => {
    setActiveRegulatorId(null);
    localStorage.removeItem(STORAGE_KEY);
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
