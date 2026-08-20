import { createContext, useContext } from 'react';

/**
 * True when a page renders inside the persistent authenticated shell
 * (`AppShell`). `DashboardLayout` uses this to skip its own Sidebar/Header
 * chrome so the shell stays mounted across navigations instead of remounting
 * per page.
 */
export const AppShellContext = createContext(false);

export function useInsideAppShell(): boolean {
  return useContext(AppShellContext);
}
