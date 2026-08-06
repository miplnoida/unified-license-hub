/**
 * PRU-GRP-001 — pure helpers for the Financial Group consolidated risk profile.
 * All figures come from the backend `prudential_group_consolidated` payload;
 * nothing here invents values. Missing inputs stay missing.
 */

export interface GroupMember {
  member_id: string;
  licensee_id: string;
  name: string;
  parent_member_id: string | null;
  member_role: 'ultimate_holding' | 'subsidiary' | 'associate' | 'joint_venture' | 'branch';
  ownership_percentage: number | null;
  consolidation_treatment: 'full' | 'proportional' | 'equity' | 'excluded';
  effective_date: string | null;
  end_date: string | null;
  licensee_status: string | null;
  sector_name: string | null;
  systemic_importance: string | null;
  risk_score: number | null;
  risk_band: string | null;
}

export interface GroupMemberNode extends GroupMember {
  children: GroupMemberNode[];
  depth: number;
}

export interface ConsolidatedRatio {
  ratio_key: string;
  label: string;
  display_format: string | null;
  method: string;
  contributors: number;
  gross_value: number | null;
  eliminated: number;
  value: number | null;
}

export interface MatrixCell {
  from_entity_id: string;
  to_entity_id: string;
  amount: number;
  types: Record<string, number>;
  is_large: boolean;
}

export const ROLE_LABEL: Record<string, string> = {
  ultimate_holding: 'Ultimate holding company',
  subsidiary: 'Subsidiary',
  associate: 'Associate',
  joint_venture: 'Joint venture',
  branch: 'Branch',
};

export const TREATMENT_LABEL: Record<string, string> = {
  full: 'Full consolidation',
  proportional: 'Proportional',
  equity: 'Equity method',
  excluded: 'Excluded',
};

const RED = 'bg-destructive/10 text-destructive border-destructive/30';
const AMBER_STRONG = 'bg-amber-500/20 text-amber-800 border-amber-300';
const AMBER = 'bg-amber-500/10 text-amber-700 border-amber-200';
const EMERALD = 'bg-emerald-500/10 text-emerald-700 border-emerald-200';
const NEUTRAL = 'bg-muted text-muted-foreground border-border';

/** Badge tone for a risk band or CAMELS rating word. */
export function bandTone(band?: string | null): string {
  const s = String(band ?? '').toLowerCase();
  if (!s) return NEUTRAL;
  if (s.includes('critical') || s === 'red' || s === '5') return RED;
  if (s.includes('high') || s === '4') return AMBER_STRONG;
  if (s.includes('medium') || s.includes('moderate') || s === 'amber' || s === '3') return AMBER;
  if (s.includes('low') || s === 'green' || s === '1' || s === '2') return EMERALD;
  return NEUTRAL;
}

/** Build the group org tree. Members whose parent is missing are attached at root. */
export function buildMemberTree(members: GroupMember[]): GroupMemberNode[] {
  const byId = new Map<string, GroupMemberNode>();
  members.forEach((m) => byId.set(m.member_id, { ...m, children: [], depth: 0 }));

  const roots: GroupMemberNode[] = [];
  byId.forEach((node) => {
    const parent = node.parent_member_id ? byId.get(node.parent_member_id) : undefined;
    if (parent && parent.member_id !== node.member_id) parent.children.push(node);
    else roots.push(node);
  });

  const setDepth = (nodes: GroupMemberNode[], depth: number, seen: Set<string>) => {
    nodes.forEach((n) => {
      if (seen.has(n.member_id)) { n.children = []; return; }
      seen.add(n.member_id);
      n.depth = depth;
      n.children.sort((a, b) => a.name.localeCompare(b.name));
      setDepth(n.children, depth + 1, seen);
    });
  };

  roots.sort((a, b) => {
    if (a.member_role === 'ultimate_holding' && b.member_role !== 'ultimate_holding') return -1;
    if (b.member_role === 'ultimate_holding' && a.member_role !== 'ultimate_holding') return 1;
    return a.name.localeCompare(b.name);
  });
  setDepth(roots, 0, new Set());
  return roots;
}

export function flattenTree(nodes: GroupMemberNode[]): GroupMemberNode[] {
  const out: GroupMemberNode[] = [];
  const walk = (list: GroupMemberNode[]) => list.forEach((n) => { out.push(n); walk(n.children); });
  walk(nodes);
  return out;
}

export function formatRatioValue(value: number | null | undefined, fmt?: string | null): string {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return '—';
  switch (String(fmt ?? '').toLowerCase()) {
    case 'percent':
    case 'percentage':
      return `${n.toFixed(2)}%`;
    case 'ratio':
    case 'multiple':
      return `${n.toFixed(2)}x`;
    case 'currency':
      return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    default:
      return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
}

export function formatAmount(value: number | null | undefined): string {
  const n = Number(value);
  if (value == null || !Number.isFinite(n) || n === 0) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/** CAMELS component keys present across the heatmap rows, in a stable order. */
const CAMELS_ORDER = ['capital', 'asset_quality', 'management', 'earnings', 'liquidity', 'sensitivity'];

export function camelsColumns(rows: Array<{ ratings?: Record<string, unknown> | null }>): string[] {
  const keys = new Set<string>();
  rows.forEach((r) => Object.keys(r.ratings ?? {}).forEach((k) => keys.add(k)));
  const known = CAMELS_ORDER.filter((k) => keys.has(k));
  const extra = Array.from(keys).filter((k) => !CAMELS_ORDER.includes(k)).sort();
  return [...known, ...extra];
}

export function humanizeKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface ContagionChannel {
  from_name: string;
  to_name: string;
  amount: number;
  channels: string[];
  share_of_total: number;
  is_large: boolean;
}

/**
 * Deterministic contagion transmission summary: the largest intra-group
 * exposures ranked by share of total intra-group exposure.
 */
export function deriveContagionChannels(
  cells: MatrixCell[],
  nameById: Map<string, string>,
  total: number,
  limit = 5,
): ContagionChannel[] {
  return [...cells]
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, limit)
    .map((c) => ({
      from_name: nameById.get(c.from_entity_id) ?? 'Unknown entity',
      to_name: nameById.get(c.to_entity_id) ?? 'Unknown entity',
      amount: Number(c.amount) || 0,
      channels: Object.keys(c.types ?? {}),
      share_of_total: total > 0 ? Math.round(((Number(c.amount) || 0) / total) * 10000) / 100 : 0,
      is_large: !!c.is_large,
    }));
}
