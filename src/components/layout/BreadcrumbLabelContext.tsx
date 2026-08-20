import { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface BreadcrumbLabelStore {
  /** Label override for the current (last) crumb, or null when unset. */
  currentLabel: string | null;
  setCurrentLabel: (label: string | null) => void;
}

const BreadcrumbLabelContext = createContext<BreadcrumbLabelStore>({
  currentLabel: null,
  setCurrentLabel: () => {},
});

/**
 * Lets a page refine the label of its own (last) breadcrumb without owning the
 * trail. Ancestry always stays derived from the navigation tree + registry.
 */
export function BreadcrumbLabelProvider({ children }: { children: React.ReactNode }) {
  const [currentLabel, setLabel] = useState<string | null>(null);
  const setCurrentLabel = useCallback((label: string | null) => {
    setLabel((prev) => (prev === label ? prev : label));
  }, []);
  const value = useMemo(() => ({ currentLabel, setCurrentLabel }), [currentLabel, setCurrentLabel]);
  return <BreadcrumbLabelContext.Provider value={value}>{children}</BreadcrumbLabelContext.Provider>;
}

export function useBreadcrumbLabelStore(): BreadcrumbLabelStore {
  return useContext(BreadcrumbLabelContext);
}
