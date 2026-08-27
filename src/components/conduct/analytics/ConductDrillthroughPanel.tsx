import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { buildMatrix, type ComplaintRow, type Matrix } from '@/lib/conduct/analytics';

interface Props {
  complaints: ComplaintRow[];
  labels: {
    product: (id?: string | null) => string;
    channel: (id?: string | null) => string;
    category: (id?: string | null) => string;
  };
  /** Applies the clicked dimension pair to the page filters. */
  onApplyFilters: (patch: { product_id?: string; channel_id?: string; category_id?: string }) => void;
}

interface Selection {
  matrix: 'product_channel' | 'category_product';
  rowKey: string;
  colKey: string;
}

function tone(cell: { count: number; critical: number; breached: number }): string {
  const risk = (cell.critical + cell.breached) / Math.max(cell.count, 1);
  if (risk >= 0.4) return 'bg-destructive/20 text-destructive-foreground';
  if (risk >= 0.15) return 'bg-amber-500/20';
  return 'bg-primary/10';
}

export function ConductDrillthroughPanel({ complaints, labels, onApplyFilters }: Props) {
  const [sel, setSel] = useState<Selection | null>(null);

  const productChannel = useMemo(
    () => buildMatrix(complaints, (c) => c.product_id, (c) => c.channel_id,
      (k) => (k === 'none' ? '—' : labels.product(k)), (k) => (k === 'none' ? '—' : labels.channel(k))),
    [complaints, labels],
  );
  const categoryProduct = useMemo(
    () => buildMatrix(complaints, (c) => c.conduct_risk_category_id, (c) => c.product_id,
      (k) => (k === 'none' ? '—' : labels.category(k)), (k) => (k === 'none' ? '—' : labels.product(k))),
    [complaints, labels],
  );

  const rows = useMemo(() => {
    if (!sel) return [];
    return complaints.filter((c) => {
      if (sel.matrix === 'product_channel') {
        return (c.product_id || 'none') === sel.rowKey && (c.channel_id || 'none') === sel.colKey;
      }
      return (c.conduct_risk_category_id || 'none') === sel.rowKey && (c.product_id || 'none') === sel.colKey;
    });
  }, [sel, complaints]);

  const apply = () => {
    if (!sel) return;
    if (sel.matrix === 'product_channel') {
      onApplyFilters({
        product_id: sel.rowKey === 'none' ? 'all' : sel.rowKey,
        channel_id: sel.colKey === 'none' ? 'all' : sel.colKey,
      });
    } else {
      onApplyFilters({
        category_id: sel.rowKey === 'none' ? 'all' : sel.rowKey,
        product_id: sel.colKey === 'none' ? 'all' : sel.colKey,
      });
    }
  };

  return (
    <div className="space-y-4">
      <MatrixCard
        title="Product × Channel"
        subtitle="Cell shading reflects the share of critical or SLA-breached complaints. Click a cell to inspect the rows."
        matrix={productChannel}
        selected={sel?.matrix === 'product_channel' ? sel : null}
        onSelect={(rowKey, colKey) => setSel({ matrix: 'product_channel', rowKey, colKey })}
      />
      <MatrixCard
        title="Risk category × Product"
        subtitle="Same drill-through across conduct risk categories."
        matrix={categoryProduct}
        selected={sel?.matrix === 'category_product' ? sel : null}
        onSelect={(rowKey, colKey) => setSel({ matrix: 'category_product', rowKey, colKey })}
      />

      {sel && (
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Underlying complaints ({rows.length})</CardTitle>
              <p className="text-xs text-muted-foreground">
                {sel.matrix === 'product_channel'
                  ? `${labels.product(sel.rowKey === 'none' ? null : sel.rowKey)} · ${labels.channel(sel.colKey === 'none' ? null : sel.colKey)}`
                  : `${labels.category(sel.rowKey === 'none' ? null : sel.rowKey)} · ${labels.product(sel.colKey === 'none' ? null : sel.colKey)}`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button data-rbac="market_conduct.manage_complaints" size="sm" variant="outline" onClick={apply}>Apply to filters</Button>
              <Button size="sm" variant="ghost" asChild><Link to="/complaints">View in complaints list</Link></Button>
              <Button size="sm" variant="ghost" onClick={() => setSel(null)}>Clear</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>#</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No complaints in this cell.</TableCell></TableRow>
                  ) : rows.slice(0, 50).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">
                        <Link className="text-primary hover:underline" to={`/complaints/${c.id}`}>{(c as any).complaint_number || c.id.slice(0, 8)}</Link>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{c.severity || '—'}</Badge></TableCell>
                      <TableCell><Badge variant="secondary" className="capitalize">{c.status?.replace('_', ' ') || '—'}</Badge></TableCell>
                      <TableCell className="text-xs">{new Date(c.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MatrixCard({ title, subtitle, matrix, selected, onSelect }: {
  title: string;
  subtitle: string;
  matrix: Matrix;
  selected: Selection | null;
  onSelect: (rowKey: string, colKey: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="p-0">
        {matrix.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6 text-center">No complaints in scope.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium sticky left-0 bg-card">&nbsp;</th>
                  {matrix.cols.map((c) => <th key={c.key} className="p-2 font-medium text-xs whitespace-nowrap">{c.label}</th>)}
                  <th className="p-2 font-medium text-xs">Total</th>
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((r) => (
                  <tr key={r.key} className="border-b last:border-0">
                    <td className="p-2 font-medium text-xs whitespace-nowrap sticky left-0 bg-card">{r.label}</td>
                    {matrix.cols.map((c) => {
                      const cell = matrix.cells.get(`${r.key}|${c.key}`);
                      const isSel = selected?.rowKey === r.key && selected?.colKey === c.key;
                      return (
                        <td key={c.key} className="p-1 text-center">
                          {cell ? (
                            <button
                              type="button"
                              onClick={() => onSelect(r.key, c.key)}
                              className={`w-full rounded px-2 py-1 text-xs font-medium transition ${tone(cell)} ${isSel ? 'ring-2 ring-primary' : 'hover:opacity-80'}`}
                              title={`${cell.count} complaints · ${cell.critical} critical · ${cell.breached} SLA breached`}
                            >
                              {cell.count}
                            </button>
                          ) : <span className="text-muted-foreground text-xs">·</span>}
                        </td>
                      );
                    })}
                    <td className="p-2 text-center text-xs font-semibold">{matrix.rowTotals.get(r.key) || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
