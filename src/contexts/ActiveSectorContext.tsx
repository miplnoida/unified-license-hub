import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

interface ActiveSectorContextType {
  activeSectorId: string | null;
  activeSectorName: string | null;
  setActiveSector: (id: string, name: string) => void;
  clearActiveSector: () => void;
}

const ActiveSectorContext = createContext<ActiveSectorContextType | undefined>(undefined);

const STORAGE_KEY = 'active-sector';

export function ActiveSectorProvider({ children }: { children: ReactNode }) {
  const [activeSectorId, setActiveSectorId] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored).id : null;
    } catch { return null; }
  });
  const [activeSectorName, setActiveSectorName] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored).name : null;
    } catch { return null; }
  });

  const setActiveSector = useCallback((id: string, name: string) => {
    setActiveSectorId(id);
    setActiveSectorName(name);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, name }));
  }, []);

  const clearActiveSector = useCallback(() => {
    setActiveSectorId(null);
    setActiveSectorName(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <ActiveSectorContext.Provider value={{ activeSectorId, activeSectorName, setActiveSector, clearActiveSector }}>
      {children}
    </ActiveSectorContext.Provider>
  );
}

export function useActiveSector() {
  const context = useContext(ActiveSectorContext);
  if (!context) throw new Error('useActiveSector must be used within ActiveSectorProvider');
  return context;
}
