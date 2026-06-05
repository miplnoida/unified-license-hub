import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export interface StatusBreakdownItem {
  label: string;
  value: number;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
  /** Optional drill-down link. When set, the item becomes clickable. */
  to?: string;
}

const toneBar: Record<NonNullable<StatusBreakdownItem['tone']>, string> = {
  default: 'bg-muted-foreground/40',
  primary: 'bg-primary',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  destructive: 'bg-destructive',
};

export function StatusBreakdownCard({
  title, items, loading, total,
}: {
  title: string;
  items: StatusBreakdownItem[];
  loading?: boolean;
  total?: number;
}) {
  const max = Math.max(1, ...(items.map(i => i.value)));
  const sum = total ?? items.reduce((a, i) => a + i.value, 0);
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{title}</span>
          <span className="text-xs font-normal text-muted-foreground tabular-nums">{loading ? '' : sum.toLocaleString()}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No data.</p>
        ) : (
          items.map((it) => {
            const body = (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground capitalize">{it.label}</span>
                  <span className="tabular-nums font-medium">{it.value.toLocaleString()}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={toneBar[it.tone ?? 'primary']}
                    style={{ width: `${(it.value / max) * 100}%`, height: '100%' }}
                  />
                </div>
              </>
            );
            return it.to ? (
              <Link
                key={it.label}
                to={it.to}
                className="block space-y-1 rounded-sm -mx-1 px-1 py-0.5 hover:bg-muted/60 focus:bg-muted/60 focus:outline-none"
              >
                {body}
              </Link>
            ) : (
              <div key={it.label} className="space-y-1">{body}</div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
