import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useListingState } from '@/components/shared/listing/useListingState';
import { useServerPageGuard } from '@/components/shared/listing/useServerPageGuard';

const wrapper =
  (initial = '/register') =>
  ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>;

function setup(initial = '/register') {
  return renderHook(
    () => {
      const listing = useListingState({
        defaultSort: { key: 'risk', direction: 'desc' },
        filterKeys: ['rating'],
      });
      return { listing, search: useLocation().search };
    },
    { wrapper: wrapper(initial) },
  );
}

describe('listing state: implicit default vs explicit sort', () => {
  it('reports the default as the effective sort but not as an explicit sort', () => {
    const { result } = setup();
    expect(result.current.listing.sort).toEqual({ key: 'risk', direction: 'desc' });
    expect(result.current.listing.isExplicitSort).toBe(false);
    expect(result.current.listing.explicitSort).toBeNull();
    expect(result.current.search).toBe('');
  });

  it('cycles the default-sorted column default -> ASC -> DESC -> default', () => {
    const { result } = setup();
    act(() => result.current.listing.toggleSort('risk'));
    expect(result.current.search).toBe('?sort=risk&dir=asc');
    expect(result.current.listing.isExplicitSort).toBe(true);

    act(() => result.current.listing.toggleSort('risk'));
    expect(result.current.search).toBe('?sort=risk&dir=desc');

    act(() => result.current.listing.toggleSort('risk'));
    expect(result.current.search).toBe('');
    expect(result.current.listing.isExplicitSort).toBe(false);
    expect(result.current.listing.sort).toEqual({ key: 'risk', direction: 'desc' });
  });

  it('starts a different column at explicit ascending', () => {
    const { result } = setup();
    act(() => result.current.listing.toggleSort('sector'));
    expect(result.current.search).toBe('?sort=sector&dir=asc');
    act(() => result.current.listing.toggleSort('sector'));
    expect(result.current.search).toBe('?sort=sector&dir=desc');
  });

  it('restores an explicit sort, page and page size from the URL', () => {
    const { result } = setup('/register?q=bank&rating=HIGH&sort=sector&dir=desc&page=3&pageSize=50');
    expect(result.current.listing.explicitSort).toEqual({ key: 'sector', direction: 'desc' });
    expect(result.current.listing.search).toBe('bank');
    expect(result.current.listing.filters.rating).toBe('HIGH');
    expect(result.current.listing.page).toBe(3);
    expect(result.current.listing.pageSize).toBe(50);
  });

  it('resets the page when search, a filter, the sort or the page size changes', () => {
    const { result } = setup('/register?page=4');
    act(() => result.current.listing.setSearch('meridian'));
    expect(result.current.search).toBe('?q=meridian');

    const withPage = setup('/register?page=4');
    act(() => withPage.result.current.listing.setFilter('rating', 'HIGH'));
    expect(withPage.result.current.search).toBe('?rating=HIGH');

    const withSort = setup('/register?page=4');
    act(() => withSort.result.current.listing.toggleSort('sector'));
    expect(withSort.result.current.search).toBe('?sort=sector&dir=asc');

    const withSize = setup('/register?page=4');
    act(() => withSize.result.current.listing.setPageSize(50));
    expect(withSize.result.current.search).toBe('?pageSize=50');
  });
});

describe('owner-level server page guard', () => {
  const guard = (page: number, totalCount: number, pageSize = 25, ready = true) => {
    const setPage = vi.fn();
    const { result } = renderHook(() =>
      useServerPageGuard({ page, pageSize, totalCount, setPage, ready }),
    );
    return { result, setPage };
  };

  it('repairs an out-of-range page through the owning state', () => {
    const { result, setPage } = guard(99, 27);
    expect(result.current.validPage).toBe(2);
    expect(result.current.repairing).toBe(true);
    expect(setPage).toHaveBeenCalledWith(2);
  });

  it('repairs to page 1 when a filter narrows the population', () => {
    const { result, setPage } = guard(5, 9);
    expect(result.current.validPage).toBe(1);
    expect(setPage).toHaveBeenCalledWith(1);
  });

  it('treats page 1 as canonical when nothing matches at all', () => {
    const { result, setPage } = guard(1, 0);
    expect(result.current.validPage).toBe(1);
    expect(result.current.repairing).toBe(false);
    expect(setPage).not.toHaveBeenCalled();
  });

  it('repairs to page 1 when the total is zero but a later page was requested', () => {
    const { result, setPage } = guard(7, 0);
    expect(result.current.validPage).toBe(1);
    expect(setPage).toHaveBeenCalledWith(1);
  });

  it('leaves a valid page alone and reports no repair', () => {
    const { result, setPage } = guard(2, 101);
    expect(result.current.validPage).toBe(2);
    expect(result.current.repairing).toBe(false);
    expect(setPage).not.toHaveBeenCalled();
  });

  it('stays inert until the count is authoritative', () => {
    const { result, setPage } = guard(99, 0, 25, false);
    expect(result.current.validPage).toBe(99);
    expect(result.current.repairing).toBe(false);
    expect(setPage).not.toHaveBeenCalled();
  });

  it('repairs even though no register is mounted (rows empty, real total)', () => {
    // The screen renders its empty state instead of the register, so recovery
    // must not depend on the table component mounting.
    const rows: unknown[] = [];
    const { result, setPage } = guard(99, 88);
    expect(rows.length).toBe(0);
    expect(result.current.repairing).toBe(true);
    expect(setPage).toHaveBeenCalledWith(4);
  });
});
