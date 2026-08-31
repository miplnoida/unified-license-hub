/**
 * Ownership tree graph (presentation only).
 *
 * Draws the same governed ownership tree as a runtime-computed SVG diagram:
 * the regulated entity at the top, each recorded holding layer below it, and
 * the terminal natural persons at the bottom of each chain — the ultimate
 * beneficiaries implied by the recorded structure.
 *
 * Layout is computed from the data on every render (tidy bottom-up centering);
 * nothing is hard-coded and no percentage is invented here.
 */
import { useMemo, useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isUltimateBeneficiary, pct, type TreeNode } from './ownershipTreeModel';

const NODE_W = 196;
const NODE_H = 62;
const GAP_X = 26;
const LEVEL_H = 118;
const PAD = 20;

interface Laid {
  item: TreeNode;
  depth: number;
  x: number;
  y: number;
  children: Laid[];
}

function layout(root: TreeNode) {
  let cursor = 0;
  const place = (item: TreeNode, depth: number): Laid => {
    const children = item.children.map((c) => place(c, depth + 1));
    let x: number;
    if (children.length === 0) {
      x = cursor;
      cursor += NODE_W + GAP_X;
    } else {
      x = (children[0].x + children[children.length - 1].x) / 2;
    }
    return { item, depth, x, y: depth * LEVEL_H, children };
  };
  const laid = place(root, 0);

  const flat: Laid[] = [];
  const walk = (n: Laid) => { flat.push(n); n.children.forEach(walk); };
  walk(laid);

  const minX = Math.min(...flat.map((n) => n.x));
  if (minX !== 0) flat.forEach((n) => { n.x -= minX; });

  const width = Math.max(...flat.map((n) => n.x)) + NODE_W + PAD * 2;
  const height = Math.max(...flat.map((n) => n.y)) + NODE_H + PAD * 2;
  return { laid, flat, width, height };
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function nodeTone(n: Laid) {
  if (n.depth === 0) return { fill: 'hsl(var(--primary) / 0.10)', stroke: 'hsl(var(--primary))' };
  if (isUltimateBeneficiary(n.item, n.depth)) {
    return { fill: 'hsl(142 71% 45% / 0.12)', stroke: 'hsl(142 71% 40%)' };
  }
  if (n.item.boundary) return { fill: 'hsl(var(--destructive) / 0.08)', stroke: 'hsl(var(--destructive))' };
  return { fill: 'hsl(var(--card))', stroke: 'hsl(var(--border))' };
}

export function OwnershipTreeGraph({ root, rootLabel }: { root: TreeNode; rootLabel?: string }) {
  const [zoom, setZoom] = useState(1);
  const { laid, flat, width, height } = useMemo(() => layout(root), [root]);

  const links = useMemo(() => {
    const out: { key: string; d: string }[] = [];
    const walk = (n: Laid) => {
      for (const c of n.children) {
        const x1 = n.x + NODE_W / 2;
        const y1 = n.y + NODE_H;
        const x2 = c.x + NODE_W / 2;
        const y2 = c.y;
        const mid = (y1 + y2) / 2;
        out.push({ key: c.item.key, d: `M ${x1} ${y1} V ${mid} H ${x2} V ${y2}` });
        walk(c);
      }
    };
    walk(laid);
    return out;
  }, [laid]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-primary bg-primary/10" />
            regulated entity
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-border bg-card" />
            holding layer
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-emerald-600 bg-emerald-500/15" />
            ultimate beneficiary
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}>
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-10 text-center font-mono text-xs text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(1.6, Number((z + 0.1).toFixed(2))))}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Reset zoom"
            onClick={() => setZoom(1)}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="overflow-auto rounded-md border bg-muted/20 p-2">
        <svg
          role="img"
          aria-label="Ownership structure diagram"
          width={width * zoom}
          height={height * zoom}
          viewBox={`0 0 ${width} ${height}`}
          className="min-w-full"
        >
          <g transform={`translate(${PAD}, ${PAD})`}>
            {links.map((l) => (
              <path key={l.key} d={l.d} fill="none" stroke="hsl(var(--border))" strokeWidth={1.5} />
            ))}
            {flat.map((n) => {
              const tone = nodeTone(n);
              const node = n.item.node;
              const edge = n.item.edge;
              const label = n.depth === 0 ? (rootLabel || n.item.label) : n.item.label;
              return (
                <g key={n.item.key}>
                  <rect
                    x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx={8}
                    fill={tone.fill} stroke={tone.stroke} strokeWidth={1.5}
                  />
                  <text x={n.x + 10} y={n.y + 20} className="fill-foreground text-[12px] font-semibold">
                    {truncate(label, 26)}
                  </text>
                  <text x={n.x + 10} y={n.y + 36} className="fill-muted-foreground text-[10px] font-mono">
                    {edge
                      ? `direct ${pct(edge.economic_interest_percentage)} econ`
                      : 'root of structure'}
                  </text>
                  <text x={n.x + 10} y={n.y + 50} className="fill-muted-foreground text-[10px] font-mono">
                    {truncate([
                      node && n.depth > 0
                        ? `eff ${pct(node.economic_percentage)}${node.economic_incomplete ? '*' : ''}`
                        : null,
                      edge?.is_controller ? 'controller' : null,
                      node?.is_natural_person ? 'person' : null,
                      n.item.repeated ? 'shown elsewhere' : null,
                      isUltimateBeneficiary(n.item, n.depth) ? 'UBO' : null,
                    ].filter(Boolean).join(' · '), 30)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <p className="text-xs text-muted-foreground">
        Diagram drawn at runtime from the recorded ownership interests only. Chains ending in a natural
        person are the implied ultimate beneficiaries, not a formal UBO determination.
      </p>
    </div>
  );
}

export default OwnershipTreeGraph;
