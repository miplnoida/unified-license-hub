/**
 * MC-07.3 — Conduct 360 fact read model.
 *
 * A single governed server call (`conduct_360_snapshot`) returns every fact
 * section for one entity and its supervision window. The browser performs no
 * follow-up queries and recalculates no authoritative measure; it formats and
 * presents exactly what the server returned. There are no writes on this path.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type Measures = Record<string, unknown>;
export type FactItem = Record<string, unknown> & { href?: string | null };

export interface FactSection {
  measures?: Measures;
  items?: FactItem[];
  source?: string;
  [key: string]: unknown;
}

export interface Conduct360Window {
  start: string;
  end: string;
  days: number;
  comparison_start: string;
  comparison_end: string;
}

export interface Conduct360Entity {
  name?: string | null;
  licence_status?: string | null;
  sector?: string | null;
  sub_sector?: string | null;
  regulator?: string | null;
  systemic_importance?: string | null;
  supervisor?: string | null;
  portfolio_officer?: string | null;
  licences?: Array<Record<string, unknown>>;
  source?: string;
}

export interface Conduct360Snapshot {
  generated_at?: string;
  window?: Conduct360Window;
  entity?: Conduct360Entity;
  posture?: FactSection;
  complaints?: FactSection;
  redress?: FactSection;
  signals?: FactSection;
  patterns?: FactSection;
  alerts?: FactSection;
  product_channel?: FactSection;
  risk_indicators?: FactSection;
  trends?: FactSection;
  open_items?: FactSection;
  recent_activity?: FactSection;
}

export type Conduct360WindowChoice = 'last_90_days' | 'last_12_months' | 'last_24_months';

export const CONDUCT_360_WINDOW_OPTIONS: Array<{ value: Conduct360WindowChoice; label: string }> = [
  { value: 'last_90_days', label: 'Last 90 days' },
  { value: 'last_12_months', label: 'Last 12 months' },
  { value: 'last_24_months', label: 'Last 24 months' },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Resolves a chosen window into the plain start/end dates sent to the server. */
export function resolveWindow(choice: Conduct360WindowChoice, today = new Date()): { start: string; end: string } {
  const end = new Date(today);
  const start = new Date(today);
  if (choice === 'last_90_days') start.setDate(start.getDate() - 89);
  if (choice === 'last_12_months') start.setMonth(start.getMonth() - 12);
  if (choice === 'last_24_months') start.setMonth(start.getMonth() - 24);
  return { start: iso(start), end: iso(end) };
}

export interface Conduct360Result {
  snapshot: Conduct360Snapshot | null;
  isLoading: boolean;
  isDenied: boolean;
  error: Error | null;
  refetch: () => void;
}

const DENIED = /(not_authorized|insufficient|permission denied|out of scope|42501)/i;

export function useConduct360(entityId: string | undefined, choice: Conduct360WindowChoice): Conduct360Result {
  const { start, end } = resolveWindow(choice);

  const query = useQuery({
    queryKey: ['conduct-360', entityId, start, end],
    enabled: Boolean(entityId),
    queryFn: async (): Promise<Conduct360Snapshot> => {
      const { data, error } = await sb.rpc('conduct_360_snapshot', {
        _entity_id: entityId,
        _window_start: start,
        _window_end: end,
      });
      if (error) throw new Error(error.message);
      return (data ?? {}) as Conduct360Snapshot;
    },
    retry: false,
    staleTime: 60_000,
  });

  const error = (query.error as Error | null) ?? null;
  return {
    snapshot: (query.data as Conduct360Snapshot | undefined) ?? null,
    isLoading: query.isLoading,
    isDenied: Boolean(error && DENIED.test(error.message)),
    error,
    refetch: () => { void query.refetch(); },
  };
}
