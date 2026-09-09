/**
 * Materiality parameters — definition register with governed DEFINITION authoring.
 *
 * A parameter definition existing is NOT the same as its policy value being
 * approved. There is deliberately no value control anywhere on this screen:
 * setting a materiality value is a regulator policy decision taken in the
 * calculation-policy layer, and the server refuses any value sent from here.
 */
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useSupervisoryMethodologyParameters,
  useSupervisoryMethodologyStudioCapabilities,
  type MethodologyParameterRow,
} from '@/hooks/useSupervisoryMethodologyAdmin';
import { CountTile, EmptyPanel, ErrorPanel, humanize } from '../labels';
import { ParameterEditorDialog } from '../studio/ParameterEditorDialog';
import { AuthoringHeader } from '../studio/StudioKit';

export function ParametersTab({ methodologyId }: { methodologyId: string }) {
  const { data, isLoading, error } = useSupervisoryMethodologyParameters(methodologyId);
  const caps = useSupervisoryMethodologyStudioCapabilities(methodologyId);
  const canAuthor = caps.data?.can_author_parameters?.allowed === true;
  const [editing, setEditing] = useState<{ open: boolean; row: MethodologyParameterRow | null }>({ open: false, row: null });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) return <ErrorPanel error={error} />;

  const header = (
    <AuthoringHeader
      capability={caps.data?.can_author_parameters}
      label="Add parameter definition"
      onAdd={() => setEditing({ open: true, row: null })}
      note="Definitions may be authored here. An approved value is set in the calculation and materiality policy layer."
    />
  );
  const dialog = (
    <ParameterEditorDialog
      methodologyId={methodologyId}
      open={editing.open}
      existing={editing.row}
      onClose={() => setEditing({ open: false, row: null })}
    />
  );

  if (!data || data.total_count === 0) {
    return (
      <div className="space-y-3">
        {header}
        <EmptyPanel title="No materiality parameter is defined for this version." />
        {dialog}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <CountTile label="Parameters defined" value={data.total_count} />
        <CountTile label="Policy value not approved" value={data.unapproved_count} />
        <CountTile label="Values recorded" value={data.valued_count} />
      </div>
      <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
        {caps.data?.can_set_parameter_values?.reason
          ?? 'Parameter definition exists; policy value is not approved.'}
      </p>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Referenced by</TableHead>
              {canAuthor ? <TableHead className="text-right">Definition</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.parameter_code}</TableCell>
                <TableCell className="text-sm">{p.label ?? '—'}</TableCell>
                <TableCell className="text-xs">{humanize(p.parameter_kind)} · {humanize(p.data_type)}</TableCell>
                <TableCell className="text-xs">{p.unit ?? '—'}</TableCell>
                <TableCell><Badge variant="outline">{humanize(p.approval_status)}</Badge></TableCell>
                <TableCell className="font-mono text-xs">
                  {p.has_value ? (p.value_numeric ?? p.value_text) : <span className="text-muted-foreground">Not set</span>}
                </TableCell>
                <TableCell className="text-xs">
                  {p.referenced_by_count === 0 ? <span className="text-muted-foreground">Not referenced</span>
                    : <span className="font-mono">{p.referenced_by.join(', ')}</span>}
                </TableCell>
                {canAuthor ? (
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ open: true, row: p })}
                            data-rbac="aml_supervision.manage_config">Edit definition</Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {dialog}
    </div>
  );
}
