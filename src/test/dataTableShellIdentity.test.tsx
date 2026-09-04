import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTableShell } from '@/components/shared/DataTableShell';

const columns = [{ key: 'label', label: 'Label' }];

describe('DataTableShell row identity', () => {
  it('renders rows keyed by their canonical id', () => {
    render(<DataTableShell columns={columns} data={[{ id: 'a-1', label: 'Alpha' }]} />);
    expect(screen.getByText('Alpha')).toBeTruthy();
  });

  it('uses an explicit getRowId when the canonical key is not `id`', () => {
    const getRowId = vi.fn((r: any) => r.work_key);
    render(
      <DataTableShell
        columns={columns}
        data={[{ work_key: 'RFI:1', label: 'Beta' }]}
        getRowId={getRowId}
      />,
    );
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(getRowId).toHaveBeenCalled();
  });

  it('refuses to fall back to the array index when no identity exists', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(<DataTableShell columns={columns} data={[{ label: 'Gamma' }]} />),
    ).toThrow(/canonical identity/);
    spy.mockRestore();
  });
});
