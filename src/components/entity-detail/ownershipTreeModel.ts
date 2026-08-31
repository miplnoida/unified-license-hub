/**
 * Ownership tree model (presentation only).
 *
 * Shared shaping of the governed `entity_ownership_network` payload into an
 * upward ownership tree. No ownership figure is invented here — every
 * percentage, flag and boundary comes from the RPC.
 */
import type {
  OwnershipNetwork, OwnershipNetworkEdge, OwnershipNetworkNode,
} from '@/hooks/useWaveB';

export interface TreeNode {
  key: string;
  node?: OwnershipNetworkNode;
  edge?: OwnershipNetworkEdge;
  partyId: string;
  label: string;
  children: TreeNode[];
  repeated: boolean;
  boundary?: string;
}

export const pct = (v: unknown) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : `${Number(v).toFixed(2)}%`;

export function buildTree(network?: OwnershipNetwork | null): TreeNode | null {
  if (!network?.seed?.party_id) return null;

  const nodes = new Map((network.nodes ?? []).map((n) => [n.party_id, n]));
  const edgesByOwned = new Map<string, OwnershipNetworkEdge[]>();
  for (const e of network.edges ?? []) {
    const list = edgesByOwned.get(e.owned_party_id) ?? [];
    list.push(e);
    edgesByOwned.set(e.owned_party_id, list);
  }
  const boundary = new Map<string, string>();
  for (const f of network.frontier ?? []) {
    if (f?.party_id) boundary.set(f.party_id, f.reason);
  }

  const expand = (partyId: string, path: string[], keyPrefix: string): TreeNode[] =>
    (edgesByOwned.get(partyId) ?? [])
      .slice()
      .sort((a, b) =>
        Number(b.economic_interest_percentage ?? 0) - Number(a.economic_interest_percentage ?? 0))
      .map((edge) => {
        const owner = nodes.get(edge.owner_party_id);
        const repeated = path.includes(edge.owner_party_id);
        const key = `${keyPrefix}/${edge.id}`;
        return {
          key,
          node: owner,
          edge,
          partyId: edge.owner_party_id,
          label: owner?.display_name || edge.owner_party_id.slice(0, 8),
          repeated,
          boundary: boundary.get(edge.owner_party_id),
          children: repeated ? [] : expand(edge.owner_party_id, [...path, edge.owner_party_id], key),
        } satisfies TreeNode;
      });

  const seedParty = network.seed.party_id;
  return {
    key: 'root',
    partyId: seedParty,
    label: network.seed.display_name || 'Regulated entity',
    repeated: false,
    children: expand(seedParty, [seedParty], 'root'),
  };
}

export function isUltimateBeneficiary(item: TreeNode, depth: number) {
  return depth > 0 && item.children.length === 0 && !item.repeated
    && Boolean(item.node?.is_natural_person);
}
