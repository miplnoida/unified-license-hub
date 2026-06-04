import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ArrowUpRight } from 'lucide-react';

export interface PriorityRow {
  id: string;
  primary: string;
  secondary?: string;
  badge?: { label: string; tone?: 'default' | 'destructive' | 'warning' | 'success' };
  to?: string;
}

const toneClasses: Record<string, string> = {
  default: 'bg-muted text-muted-foreground',
  destructive: 'bg-destructive/10 text-destructive border-destructive/30',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
};

export function PriorityListCard({
  title, rows, loading, emptyText = 'Nothing here right now.', viewAll,
}: {
  title: string;
  rows: PriorityRow[];
  loading?: boolean;
  emptyText?: string;
  viewAll?: { label: string; to: string };
}) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">{title}</CardTitle>
        {viewAll && (
          <Link to={viewAll.to} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            {viewAll.label} <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </CardHeader>
      <CardContent className="space-y-1">
        {loading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3">{emptyText}</p>
        ) : (
          rows.map((r) => {
            const content = (
              <div className="flex items-center justify-between gap-3 py-2 px-2 rounded-md hover:bg-muted/50 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.primary}</p>
                  {r.secondary && <p className="text-xs text-muted-foreground truncate">{r.secondary}</p>}
                </div>
                {r.badge && (
                  <Badge variant="outline" className={`text-[10px] ${toneClasses[r.badge.tone ?? 'default']}`}>
                    {r.badge.label}
                  </Badge>
                )}
              </div>
            );
            return r.to ? <Link key={r.id} to={r.to}>{content}</Link> : <div key={r.id}>{content}</div>;
          })
        )}
      </CardContent>
    </Card>
  );
}
