/**
 * Ownership tree (presentation only).
 *
 * Renders the governed `entity_ownership_network` payload as an expandable
 * upward ownership tree: the regulated entity at the root, each recorded direct
 * owner as a branch, and the terminal parties at the leaves — natural persons
 * at the end of a chain are the ultimate beneficial owners implied by the
 * recorded structure.
 *
 * No ownership figure is invented here: effective look-through percentages,
 * controller flags, declared-UBO flags, incompleteness and traversal boundaries
 * all come from the RPC. Repeated parties on other branches are shown once and
 * cross-referenced rather than duplicated.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Building2, ChevronDown, ChevronRight, Loader2, Network,
  ShieldCheck, User, Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useEntityOwnershipNetwork, type OwnershipNetwork, type OwnershipNetworkEdge, type OwnershipNetworkNode } from '@/hooks/useWaveB';

const pct = (v: unknown) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : `${Number(v).toFixed(2)}%`;

interface TreeNode {
  key: string;
  node?: OwnershipNetworkNode;
  edge?: OwnershipNetworkEdge;
  partyId: string;
  label: string;
  children: TreeNode[];
  repeated: boolean;
  boundary?: string;
}

function buildTree(network?: OwnershipNetwork | null): TreeNode | null {
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

function NodeIcon({ node, root }: { node?: OwnershipNetworkNode; root?: boolean }) {
  if (root) return <Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />;
  if (node?.is_natural_person) return <User className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />;
  return <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
}

function TreeBranch({
  item, depth, rootLabel, defaultOpen,
}: { item: TreeNode; depth: number; rootLabel?: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const node = item.node;
  const edge = item.edge;
  const isRoot = depth === 0;
  const hasChildren = item.children.length > 0;
  const isUbo = !isRoot && !hasChildren && !item.repeated && node?.is_natural_person;

  return (
    <li className={cn(depth > 0 && 'relative pl-5 before:absolute before:left-0 before:top-0 before:h-full before:border-l before:border-border')}>
      <div
        className={cn(
          'relative flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2 py-1.5',
          depth > 0 && 'before:absolute before:-left-5 before:top-[1.1rem] before:w-5 before:border-t before:border-border',
          isRoot ? 'bg-primary/5' : isUbo ? 'bg-emerald-500/5' : 'hover:bg-muted/60',
        )}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? `Collapse ${item.label}` : `Expand ${item.label}`}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="inline-block w-5" aria-hidden />
        )}

        <NodeIcon node={node} root={isRoot} />

        <span className={cn('text-sm', isRoot ? 'font-semibold' : 'font-medium')}>
          {isRoot ? rootLabel || item.label : item.label}
        </span>

        {edge && (
          <span className="font-mono text-xs text-muted-foreground">
            direct {pct(edge.economic_interest_percentage)} econ · {pct(edge.voting_rights_percentage)} vote
          </span>
        )}
        {node && !isRoot && (
          <span className="font-mono text-xs text-foreground">
            effective {pct(node.economic_percentage)}
            {node.economic_incomplete ? '*' : ''}
          </span>
        )}

        {isRoot && <Badge variant="secondary" className="text-xs">regulated entity</Badge>}
        {node?.is_regulated && !isRoot && (
          <Badge variant="outline" className="text-xs">
            {node.licensee_id
              ? <Link to={`/entities/${node.licensee_id}`} className="underline-offset-2 hover:underline">regulated</Link>
              : 'regulated'}
          </Badge>
        )}
        {edge?.is_controller && <Badge variant="outline" className="text-xs">controller</Badge>}
        {node?.recorded_ubo_declared && <Badge variant="outline" className="text-xs">declared UBO</Badge>}
        {node?.is_legal_arrangement && <Badge variant="outline" className="text-xs">legal arrangement</Badge>}
        {isUbo && (
          <Badge className="gap-1 bg-emerald-600 text-xs text-primary-foreground hover:bg-emerald-600">
            <ShieldCheck className="h-3 w-3" /> ultimate beneficiary
          </Badge>
        )}
        {!isRoot && !hasChildren && !item.repeated && !node?.is_natural_person && !item.boundary && (
          <Badge variant="outline" className="text-xs">no further ownership recorded</Badge>
        )}
        {item.repeated && <Badge variant="outline" className="text-xs">shown on another branch</Badge>}
        {item.boundary && (
          <Badge variant="destructive" className="gap-1 text-xs">
            <AlertTriangle className="h-3 w-3" /> {item.boundary.replaceAll('_', ' ').toLowerCase()}
          </Badge>
        )}
        {node && (node.path_count ?? 1) > 1 && (
          <span className="text-xs text-muted-foreground">{node.path_count} paths</span>
        )}
      </div>

      {hasChildren && open && (
        <ul className="mt-0.5">
          {item.children.map((c) => (
            <TreeBranch key={c.key} item={c} depth={depth + 1} defaultOpen={defaultOpen} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function OwnershipTreePanel({
  entityId, entityName, asOf,
}: { entityId?: string | null; entityName?: string | null; asOf?: string | null }) {
  const asOfDate = asOf ? asOf.slice(0, 10) : undefined;
  const { data, isLoading, error } = useEntityOwnershipNetwork(entityId, asOfDate);
  const [expandAll, setExpandAll] = useState(true);

  const tree = useMemo(() => buildTree(data), [data]);

  const beneficiaries = useMemo(
    () => (data?.nodes ?? [])
      .filter((n) => n.terminal && n.is_natural_person)
      .sort((a, b) => Number(b.economic_percentage ?? 0) - Number(a.economic_percentage ?? 0)),
    [data],
  );

  const incomplete = (data?.nodes ?? []).some((n) => n.economic_incomplete);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-4 w-4" /> Ownership structure tree
            </CardTitle>
            <CardDescription>
              Recorded, approved direct interests expanded upward through each holding layer.
              Natural persons at the end of a chain are the ultimate beneficiaries implied by the
              recorded structure; effective percentages are look-through products of the chain.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setExpandAll((v) => !v)}>
            {expandAll ? 'Collapse all' : 'Expand all'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="py-10 text-center"><Loader2 className="inline h-5 w-5 animate-spin" aria-label="Loading ownership tree" /></div>
        )}

        {!!error && (
          <p className="py-6 text-center text-sm text-destructive">
            {(error as Error).message === 'PERMISSION_DENIED'
              ? 'You do not have permission to view the ownership structure.'
              : (error as Error).message}
          </p>
        )}

        {!isLoading && !error && tree && tree.children.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No approved direct ownership interests are recorded for this entity as at{' '}
            {data?.as_of ?? 'today'}, so no structure can be derived.
          </p>
        )}

        {!isLoading && !error && tree && tree.children.length > 0 && (
          <>
            <ul key={String(expandAll)} className="text-sm">
              <TreeBranch item={tree} depth={0} rootLabel={entityName ?? undefined} defaultOpen={expandAll} />
            </ul>

            <div className="rounded-md border bg-muted/30 p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> Ultimate beneficiaries at the end of the tree
              </p>
              {beneficiaries.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No chain terminates in a natural person on the recorded structure. Beneficial ownership
                  cannot be concluded from this data alone.
                </p>
              ) : (
                <ul className="space-y-1">
                  {beneficiaries.map((b) => (
                    <li key={b.party_id} className="flex flex-wrap items-center gap-2 text-sm">
                      <User className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                      <span className="font-medium">{b.display_name}</span>
                      <span className="font-mono text-xs">
                        {pct(b.economic_percentage)}{b.economic_incomplete ? '*' : ''} effective economic
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {pct(b.voting_percentage)}{b.voting_incomplete ? '*' : ''} effective voting
                      </span>
                      {b.controller_on_path && <Badge variant="outline" className="text-xs">control chain</Badge>}
                      {b.recorded_ubo_declared && <Badge variant="outline" className="text-xs">declared UBO</Badge>}
                      <span className="text-xs text-muted-foreground">layer {b.min_depth}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Derived from the recorded structure only — this is not a substitute for the entity's
                formal UBO determination.
              </p>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>As at {data?.as_of}</span>
              <span>{data?.node_count ?? 0} parties · {(data?.edges ?? []).length} interests</span>
              {incomplete && <span>* percentage incomplete — a link on the chain has no recorded percentage</span>}
              {data?.cycle_detected && <span>Circular ownership detected and stopped</span>}
              {data?.truncated && (
                <span className="text-destructive">
                  Structure truncated: {(data.truncation_reasons ?? []).join(', ').replaceAll('_', ' ').toLowerCase()}
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default OwnershipTreePanel;
