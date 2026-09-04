/**
 * URL-persisted listing state (q, filters, sort, dir, page, pageSize).
 *
 * The query string carries presentation state only — never business truth — so
 * Back from a record restores the register exactly as the officer left it.
 * Changing search, a filter, the sort or the page size resets to page 1.
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, type ListingSort, type SortDirection } from './types';

export interface ListingStateOptions {
  /** Namespace so two registers on one route do not collide. */
  prefix?: string;
  defaultSort?: ListingSort | null;
  defaultPageSize?: number;
  /** Filter keys persisted in the URL, each defaulting to 'all'. */
  filterKeys?: string[];
  defaultFilters?: Record<string, string>;
}

export interface ListingState {
  search: string;
  setSearch: (value: string) => void;
  sort: ListingSort | null;
  toggleSort: (key: string) => void;
  setSort: (sort: ListingSort | null) => void;
  filters: Record<string, string>;
  setFilter: (key: string, value: string) => void;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  resetPage: () => void;
}

export function useListingState(options: ListingStateOptions = {}): ListingState {
  const {
    prefix = '',
    defaultSort = null,
    defaultPageSize = DEFAULT_PAGE_SIZE,
    filterKeys = [],
    defaultFilters = {},
  } = options;
  const [params, setParams] = useSearchParams();
  const k = useCallback((name: string) => (prefix ? `${prefix}_${name}` : name), [prefix]);

  const search = params.get(k('q')) ?? '';
  const sortKey = params.get(k('sort'));
  const dir = (params.get(k('dir')) as SortDirection | null) ?? 'asc';
  const sort: ListingSort | null = sortKey
    ? { key: sortKey, direction: dir === 'desc' ? 'desc' : 'asc' }
    : defaultSort;
  const rawPage = Number(params.get(k('page')) ?? '1');
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const rawSize = Number(params.get(k('pageSize')) ?? String(defaultPageSize));
  const pageSize = PAGE_SIZE_OPTIONS.includes(rawSize) ? rawSize : defaultPageSize;

  const filters = useMemo(() => {
    const out: Record<string, string> = {};
    filterKeys.forEach((key) => {
      out[key] = params.get(k(key)) ?? defaultFilters[key] ?? 'all';
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, filterKeys.join('|'), k]);

  const patch = useCallback(
    (updates: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(updates).forEach(([name, value]) => {
            if (value === null || value === '') next.delete(k(name));
            else next.set(k(name), value);
          });
          return next;
        },
        { replace: true },
      );
    },
    [setParams, k],
  );

  const setSearch = useCallback((value: string) => patch({ q: value || null, page: null }), [patch]);
  const setFilter = useCallback(
    (key: string, value: string) => patch({ [key]: value === 'all' ? null : value, page: null }),
    [patch],
  );
  const setSort = useCallback(
    (next: ListingSort | null) =>
      patch({ sort: next?.key ?? null, dir: next?.direction ?? null, page: null }),
    [patch],
  );
  const toggleSort = useCallback(
    (key: string) => {
      const current = sort;
      if (!current || current.key !== key) setSort({ key, direction: 'asc' });
      else if (current.direction === 'asc') setSort({ key, direction: 'desc' });
      else setSort(defaultSort && defaultSort.key !== key ? defaultSort : null);
    },
    [sort, setSort, defaultSort],
  );
  const setPage = useCallback((next: number) => patch({ page: next <= 1 ? null : String(next) }), [patch]);
  const setPageSize = useCallback(
    (size: number) => patch({ pageSize: size === defaultPageSize ? null : String(size), page: null }),
    [patch, defaultPageSize],
  );
  const resetPage = useCallback(() => patch({ page: null }), [patch]);

  return {
    search,
    setSearch,
    sort,
    toggleSort,
    setSort,
    filters,
    setFilter,
    page,
    setPage,
    pageSize,
    setPageSize,
    resetPage,
  };
}
