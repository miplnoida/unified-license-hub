/**
 * Grid state helpers: URL persistence, column visibility persistence and the
 * client-side filter / sort / search / page pipeline.
 *
 * URL persistence exists so that opening a record and pressing Back returns
 * the regulator to the exact queue state they left.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DEFAULT_PAGE_SIZE, emptyGridState,
  type GridColumn, type GridFilterValue, type GridState,
} from './types';

/* ------------------------------------------------------------------ */
/* URL serialisation                                                   */
/* ------------------------------------------------------------------ */

function encodeFilters(filters: Record<string, GridFilterValue>): string {
  const parts: string[] = [];
  for (const [id, f] of Object.entries(filters)) {
    switch (f.kind) {
      case 'text': case 'enum': case 'date': parts.push(`${id}:${f.value}`); break;
      case 'multiEnum': if (f.values.length) parts.push(`${id}:${f.values.join('|')}`); break;
      case 'boolean': parts.push(`${id}:${f.value ? 'true' : 'false'}`); break;
      case 'number': parts.push(`${id}:${f.value}`); break;
      case 'dateRange': parts.push(`${id}:${f.from ?? ''}~${f.to ?? ''}`); break;
      case 'numberRange': parts.push(`${id}:${f.min ?? ''}~${f.max ?? ''}`); break;
    }
  }
  return parts.join(',');
}

function decodeFilters<T>(raw: string | null, columns: Array<GridColumn<T>>): Record<string, GridFilterValue> {
  if (!raw) return {};
  const byId = new Map(columns.map((c) => [c.id, c]));
  const out: Record<string, GridFilterValue> = {};
  for (const part of raw.split(',')) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    const id = part.slice(0, idx);
    const value = part.slice(idx + 1);
    const type = byId.get(id)?.filterType ?? 'text';
    if (!value) continue;
    switch (type) {
      case 'multiEnum': out[id] = { kind: 'multiEnum', values: value.split('|').filter(Boolean) }; break;
      case 'boolean': out[id] = { kind: 'boolean', value: value === 'true' }; break;
      case 'enum': out[id] = { kind: 'enum', value }; break;
      case 'date': out[id] = { kind: 'date', value }; break;
      case 'number': out[id] = { kind: 'number', value: Number(value) }; break;
      case 'dateRange': {
        const [from, to] = value.split('~');
        out[id] = { kind: 'dateRange', from: from || undefined, to: to || undefined };
        break;
      }
      case 'numberRange': {
        const [min, max] = value.split('~');
        out[id] = { kind: 'numberRange', min: min ? Number(min) : undefined, max: max ? Number(max) : undefined };
        break;
      }
      default: out[id] = { kind: 'text', value };
    }
  }
  return out;
}

/** Uncontrolled grid state, optionally mirrored into the URL query string. */
export function useGridState<T>(opts: {
  gridId: string;
  columns: Array<GridColumn<T>>;
  syncUrl?: boolean;
  pageSize?: number;
  controlled?: GridState;
  onControlledChange?: (s: GridState) => void;
}): [GridState, (next: GridState | ((prev: GridState) => GridState)) => void] {
  const { gridId, columns, syncUrl, pageSize = DEFAULT_PAGE_SIZE, controlled, onControlledChange } = opts;
  const [searchParams, setSearchParams] = useSearchParams();
  const prefix = `${gridId}.`;

  const fromUrl = useMemo<GridState>(() => {
    const base = emptyGridState(pageSize);
    if (!syncUrl) return base;
    const page = Number(searchParams.get(`${prefix}page`));
    const size = Number(searchParams.get(`${prefix}size`));
    const sortRaw = searchParams.get(`${prefix}sort`);
    return {
      pageIndex: Number.isFinite(page) && page > 0 ? page - 1 : 0,
      pageSize: Number.isFinite(size) && size > 0 ? size : pageSize,
      sort: sortRaw
        ? { id: sortRaw.replace(/^-/, ''), direction: sortRaw.startsWith('-') ? 'desc' : 'asc' }
        : null,
      search: searchParams.get(`${prefix}q`) ?? '',
      filters: decodeFilters(searchParams.get(`${prefix}f`), columns),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncUrl, searchParams, prefix, pageSize]);

  const [internal, setInternal] = useState<GridState>(fromUrl);
  const state = controlled ?? internal;

  // Keep the URL in step with the working state.
  const lastWritten = useRef<string>('');
  useEffect(() => {
    if (!syncUrl) return;
    const next = new URLSearchParams(searchParams);
    const set = (k: string, v: string | null) => {
      if (v === null || v === '') next.delete(prefix + k);
      else next.set(prefix + k, v);
    };
    set('page', state.pageIndex > 0 ? String(state.pageIndex + 1) : null);
    set('size', state.pageSize !== pageSize ? String(state.pageSize) : null);
    set('sort', state.sort ? `${state.sort.direction === 'desc' ? '-' : ''}${state.sort.id}` : null);
    set('q', state.search || null);
    set('f', encodeFilters(state.filters) || null);
    const serialised = next.toString();
    if (serialised !== searchParams.toString() && serialised !== lastWritten.current) {
      lastWritten.current = serialised;
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, syncUrl]);

  const update = useCallback((next: GridState | ((prev: GridState) => GridState)) => {
    const resolve = (prev: GridState) => (typeof next === 'function' ? (next as (p: GridState) => GridState)(prev) : next);
    if (controlled && onControlledChange) onControlledChange(resolve(controlled));
    else setInternal((prev) => resolve(prev));
  }, [controlled, onControlledChange]);

  return [state, update];
}

/* ------------------------------------------------------------------ */
/* Column visibility                                                   */
/* ------------------------------------------------------------------ */

export function useColumnVisibility<T>(gridId: string, columns: Array<GridColumn<T>>) {
  const storageKey = `grid:${gridId}:hidden-columns`;
  const [hidden, setHidden] = useState<string[]>(() => {
    if (typeof window === 'undefined') return columns.filter((c) => c.defaultVisible === false).map((c) => c.id);
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw) as string[];
    } catch { /* ignore unreadable preference */ }
    return columns.filter((c) => c.defaultVisible === false).map((c) => c.id);
  });

  const toggle = useCallback((id: string) => {
    setHidden((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* preference is best-effort */ }
      return next;
    });
  }, [storageKey]);

  const reset = useCallback(() => {
    setHidden([]);
    try { window.localStorage.removeItem(storageKey); } catch { /* noop */ }
  }, [storageKey]);

  return { hidden, toggle, reset };
}

/* ------------------------------------------------------------------ */
/* Client pipeline                                                     */
/* ------------------------------------------------------------------ */

const asText = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return '';           // never stringify objects into search
  return String(v);
};

export function matchesFilter(value: unknown, filter: GridFilterValue): boolean {
  switch (filter.kind) {
    case 'text': return asText(value).toLowerCase().includes(filter.value.toLowerCase());
    case 'enum': return asText(value) === filter.value;
    case 'multiEnum': return filter.values.length === 0 || filter.values.includes(asText(value));
    case 'boolean': return Boolean(value) === filter.value;
    case 'date': return asText(value).slice(0, 10) === filter.value;
    case 'number': return Number(value) === filter.value;
    case 'dateRange': {
      const d = asText(value).slice(0, 10);
      if (!d) return false;
      if (filter.from && d < filter.from) return false;
      if (filter.to && d > filter.to) return false;
      return true;
    }
    case 'numberRange': {
      const n = Number(value);
      if (!Number.isFinite(n)) return false;
      if (filter.min !== undefined && n < filter.min) return false;
      if (filter.max !== undefined && n > filter.max) return false;
      return true;
    }
    default: return true;
  }
}

export function applyClientPipeline<T>(
  rows: T[], columns: Array<GridColumn<T>>, state: GridState,
): { filtered: T[]; paged: T[] } {
  const byId = new Map(columns.map((c) => [c.id, c]));
  const searchable = columns.filter((c) => c.searchable !== false && !!c.accessor);

  let filtered = rows;

  const activeFilters = Object.entries(state.filters);
  if (activeFilters.length) {
    filtered = filtered.filter((row) => activeFilters.every(([id, f]) => {
      const col = byId.get(id);
      if (!col?.accessor) return true;
      return matchesFilter(col.accessor(row), f);
    }));
  }

  const q = state.search.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter((row) =>
      searchable.some((c) => asText(c.accessor!(row)).toLowerCase().includes(q)));
  }

  if (state.sort) {
    const col = byId.get(state.sort.id);
    if (col?.accessor) {
      const dir = state.sort.direction === 'asc' ? 1 : -1;
      filtered = [...filtered].sort((a, b) => {
        const av = col.accessor!(a); const bv = col.accessor!(b);
        if (av === bv) return 0;
        if (av === null || av === undefined || av === '') return 1;
        if (bv === null || bv === undefined || bv === '') return -1;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        if (typeof av === 'boolean' && typeof bv === 'boolean') return (Number(av) - Number(bv)) * dir;
        return asText(av).localeCompare(asText(bv), 'en', { numeric: true }) * dir;
      });
    }
  }

  const start = state.pageIndex * state.pageSize;
  return { filtered, paged: filtered.slice(start, start + state.pageSize) };
}

/** CSV export of the authorized, filtered, sorted rows. */
export function exportRowsToCsv<T>(
  rows: T[], columns: Array<GridColumn<T>>, fileName: string,
): void {
  const cols = columns.filter((c) => c.exportable !== false && !!c.accessor && c.id !== 'actions');
  const escape = (v: unknown) => {
    const s = v === null || v === undefined || typeof v === 'object' ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    cols.map((c) => escape(c.header)).join(','),
    ...rows.map((r) => cols.map((c) => escape(c.accessor!(r))).join(',')),
  ].join('\n');

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
