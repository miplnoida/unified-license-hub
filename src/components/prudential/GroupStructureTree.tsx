import { useState } from 'react';
import { ChevronDown, ChevronRight, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  buildMemberTree, bandTone, ROLE_LABEL, TREATMENT_LABEL,
  type GroupMember, type GroupMemberNode,
} from '@/lib/groupConsolidation';

interface Props {
  members: GroupMember[];
  onSelectMember?: (member: GroupMember) => void;
  onEditMember?: (member: GroupMember) => void;
  canEdit?: boolean;
}

function TreeRow({ node, onSelect, onEdit, canEdit }: {
  node: GroupMemberNode;
  onSelect?: (m: GroupMember) => void;
  onEdit?: (m: GroupMember) => void;
  canEdit?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-2 hover:bg-accent/40"
        style={{ marginLeft: node.depth * 20 }}
      >
        {hasChildren ? (
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-muted-foreground" aria-label={open ? 'Collapse' : 'Expand'}>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="inline-block w-4" />
        )}
        <Building2 className="h-4 w-4 text-primary shrink-0" />
        <button
          type="button"
          className="truncate text-sm font-medium text-left hover:underline"
          onClick={() => onSelect?.(node)}
        >
          {node.name}
        </button>
        <Badge variant="outline" className="text-[11px]">{ROLE_LABEL[node.member_role] ?? node.member_role}</Badge>
        {node.ownership_percentage != null && (
          <span className="font-mono text-xs text-muted-foreground">{Number(node.ownership_percentage).toFixed(2)}%</span>
        )}
        <Badge variant="outline" className="text-[11px]">{TREATMENT_LABEL[node.consolidation_treatment] ?? node.consolidation_treatment}</Badge>
        {node.sector_name && <span className="hidden md:inline text-xs text-muted-foreground">{node.sector_name}</span>}
        <div className="ml-auto flex items-center gap-2">
          {node.risk_band && (
            <Badge variant="outline" className={cn('text-[11px]', bandTone(node.risk_band))}>
              {node.risk_band}{node.risk_score != null ? ` · ${node.risk_score}` : ''}
            </Badge>
          )}
          {node.end_date && <Badge variant="outline" className="text-[11px]">Exited {node.end_date}</Badge>}
          {canEdit && (
            <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" onClick={() => onEdit?.(node)}>Edit</Button>
          )}
        </div>
      </div>
      {open && hasChildren && (
        <div className="mt-1 space-y-1 border-l border-dashed border-border/70" style={{ marginLeft: node.depth * 20 + 10 }}>
          {node.children.map((c) => (
            <TreeRow key={c.member_id} node={c} onSelect={onSelect} onEdit={onEdit} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Parent/subsidiary org tree for a financial group. */
export function GroupStructureTree({ members, onSelectMember, onEditMember, canEdit }: Props) {
  const roots = buildMemberTree(members);
  if (!members.length) {
    return <p className="text-sm text-muted-foreground">No members recorded for this group yet.</p>;
  }
  return (
    <div className="space-y-1">
      {roots.map((r) => (
        <TreeRow key={r.member_id} node={r} onSelect={onSelectMember} onEdit={onEditMember} canEdit={canEdit} />
      ))}
    </div>
  );
}
