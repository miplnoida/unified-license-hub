import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { isModuleEnabledFor } from '@/lib/subscriptionPackages';
import { ReportLibrary } from '@/pages/reports/components/ReportLibrary';

const state = vi.hoisted(() => ({
  packageTier: 'PACKAGE_A' as 'PACKAGE_A' | 'PACKAGE_B' | 'PACKAGE_C',
  overrides: {} as Record<string, boolean>, packageLoading: false,
  permsLoading: false, deniedModule: '',
}));
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useSubscriptionPackage', () => ({ useSubscriptionPackage: () => ({
  isLoading: state.packageLoading,
  isModuleEnabled: (module: string) => isModuleEnabledFor(module, state.packageTier, state.overrides),
}) }));
vi.mock('@/hooks/usePermissions', () => ({ useUserDynamicPermissions: () => ({
  isLoading: state.permsLoading, hasModuleAccess: (module: string) => module !== state.deniedModule,
}) }));
vi.mock('@/pages/reports/services/reportService', () => ({
  listFavorites: async () => [], toggleFavorite: vi.fn(), generateReport: vi.fn(),
}));
vi.mock('@/pages/reports/hooks/useReportMetadata', () => ({ useReportDefinitions: () => ({
  isLoading: false, data: [
    { id: 'core', name: 'Core report', description: '', category: 'Reports', module: 'report_management', exportFormats: ['csv'] },
    { id: 'exam', name: 'Examination report', description: '', category: 'Reports', module: 'inspection_management', exportFormats: ['csv'] },
    { id: 'unmapped', name: 'Unmapped report', description: '', category: 'Reports', module: 'unregistered_module', exportFormats: ['csv'] },
  ],
}) }));

describe('report-library package and permission boundary', () => {
  beforeEach(() => {
    state.packageTier = 'PACKAGE_A'; state.overrides = {};
    state.packageLoading = false; state.permsLoading = false; state.deniedModule = '';
  });
  const open = () => render(<ReportLibrary onPreview={vi.fn()} onSchedule={vi.fn()} />);
  const generateCount = async () => {
    await waitFor(() => expect(screen.queryAllByRole('button', { name: 'Generate' }).length).toBeGreaterThan(0));
    return screen.queryAllByRole('button', { name: 'Generate' }).length;
  };
  it('offers only Package A reports despite full role permissions', async () => {
    open(); expect(await generateCount()).toBe(1);
  });
  it('adds examinations in Package B without revealing unmapped modules', async () => {
    state.packageTier = 'PACKAGE_B'; open(); expect(await generateCount()).toBe(2);
  });
  it('honors a disabled prudential feature in Package C', async () => {
    state.packageTier = 'PACKAGE_C'; state.overrides = { prudential: false };
    open(); expect(await generateCount()).toBe(1);
  });
  it('still excludes a report refused by role permissions', async () => {
    state.packageTier = 'PACKAGE_C'; state.deniedModule = 'inspection_management';
    open(); expect(await generateCount()).toBe(1);
  });
  it('offers no reports before package authority loads', () => {
    state.packageLoading = true; open();
    expect(screen.queryAllByRole('button', { name: 'Generate' })).toHaveLength(0);
  });
});