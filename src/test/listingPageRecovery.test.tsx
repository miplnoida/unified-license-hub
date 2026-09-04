import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { clampPage } from '@/components/shared/listing/sorting';
import { useInvalidPageRecovery } from '@/components/shared/listing/useInvalidPageRecovery';

describe('clampPage', () => {
  it('moves an out-of-range page to the last valid page', () => {
    expect(clampPage(8, 40, 25)).toBe(2);
    expect(clampPage(3, 10, 25)).toBe(1);
  });

  it('leaves a valid page untouched', () => {
    expect(clampPage(2, 101, 25)).toBe(2);
    expect(clampPage(5, 101, 25)).toBe(5);
  });

  it('never returns a page below 1, even with no records', () => {
    expect(clampPage(0, 0, 25)).toBe(1);
    expect(clampPage(-4, 0, 25)).toBe(1);
    expect(clampPage(Number.NaN, 500, 25)).toBe(1);
  });
});

describe('useInvalidPageRecovery', () => {
  it('repairs the owning page state and renders the valid page', () => {
    const onPageChange = vi.fn();
    const { result } = renderHook(() =>
      useInvalidPageRecovery({ page: 8, totalCount: 40, pageSize: 25, onPageChange }),
    );
    expect(result.current).toBe(2);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('does not touch state while the page is valid', () => {
    const onPageChange = vi.fn();
    const { result } = renderHook(() =>
      useInvalidPageRecovery({ page: 2, totalCount: 101, pageSize: 25, onPageChange }),
    );
    expect(result.current).toBe(2);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('recovers when a filter collapses the population to a single page', () => {
    const onPageChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ totalCount }) => useInvalidPageRecovery({ page: 3, totalCount, pageSize: 25, onPageChange }),
      { initialProps: { totalCount: 90 } },
    );
    expect(result.current).toBe(3);
    expect(onPageChange).not.toHaveBeenCalled();
    rerender({ totalCount: 4 });
    expect(result.current).toBe(1);
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('recovers when the page size grows', () => {
    const onPageChange = vi.fn();
    const { result } = renderHook(() =>
      useInvalidPageRecovery({ page: 4, totalCount: 60, pageSize: 100, onPageChange }),
    );
    expect(result.current).toBe(1);
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('stays inert while disabled (count not yet authoritative)', () => {
    const onPageChange = vi.fn();
    const { result } = renderHook(() =>
      useInvalidPageRecovery({ page: 7, totalCount: 0, pageSize: 25, onPageChange, enabled: false }),
    );
    expect(result.current).toBe(7);
    expect(onPageChange).not.toHaveBeenCalled();
  });
});
