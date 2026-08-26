/**
 * MC-07.3 — Generic fact item table.
 *
 * Every row drills into the record using the href the server supplied. Rows
 * without an href stay plain text rather than becoming a dead link.
 */
import { Link } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { FactItem } from '@/hooks/useConduct360';

export interface FactColumn {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render?: (item: FactItem) => React.ReactNode;
  className?: string;
}

interface Props {
  items?: FactItem[];
  columns: FactColumn[];
  emptyMessage?: string;
  linkColumnKey?: string;
  maxRows?: number;
}

export function FactItemTable({ items, columns, emptyMessage = 'Nothing recorded for this window.', linkColumnKey, maxRows = 50 }: Props) {
  const rows = Array.isArray(items) ? items : [];
  const shown = rows.slice(0, maxRows);

  if (!shown.length) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={c.align === 'right' ? 'text-right' : undefined}>{c.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((item, i) => {
              const href = typeof item.href === 'string' ? item.href : null;
              return (
                <TableRow key={`${String(item.reference ?? item.title ?? i)}-${i}`}>
                  {columns.map((c) => {
                    const content = c.render ? c.render(item) : (item[c.key] === null || item[c.key] === undefined || item[c.key] === '' ? '—' : String(item[c.key]));
                    const isLinkCell = linkColumnKey ? c.key === linkColumnKey : c.key === columns[0].key;
                    return (
                      <TableCell key={c.key} className={[c.className, c.align === 'right' ? 'text-right' : ''].filter(Boolean).join(' ')}>
                        {isLinkCell && href ? (
                          <Link to={href} className="font-medium text-primary hover:underline">{content}</Link>
                        ) : (
                          content
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {rows.length > shown.length && (
        <p className="text-xs text-muted-foreground">
          Showing the {shown.length} most recent of {rows.length} records for this window.
        </p>
      )}
    </div>
  );
}
