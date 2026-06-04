import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowUpRight, Info, ShieldAlert, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Insight, InsightSeverity } from '@/lib/dashboardInsights';

const severityMeta: Record<InsightSeverity, { icon: typeof Info; badge: string; border: string }> = {
  critical: { icon: ShieldAlert, badge: 'bg-destructive text-destructive-foreground', border: 'border-l-destructive' },
  high:     { icon: AlertTriangle, badge: 'bg-amber-500 text-white', border: 'border-l-amber-500' },
  medium:   { icon: Sparkles, badge: 'bg-primary text-primary-foreground', border: 'border-l-primary' },
  low:      { icon: Info, badge: 'bg-muted text-muted-foreground', border: 'border-l-muted-foreground/40' },
};

export function InsightCard({ insight }: { insight: Insight }) {
  const meta = severityMeta[insight.severity];
  const Icon = meta.icon;
  return (
    <Card className={cn('border-l-4', meta.border)}>
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={cn('text-[10px] uppercase tracking-wide', meta.badge)}>{insight.severity}</Badge>
              <Badge variant="outline" className="text-[10px] capitalize">{insight.module}</Badge>
            </div>
            <h4 className="font-semibold text-sm mt-2">{insight.title}</h4>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{insight.explanation}</p>
            {insight.action && (
              <Button asChild variant="ghost" size="sm" className="mt-2 -ml-2 h-7 text-xs">
                <Link to={insight.action.to}>
                  {insight.action.label}
                  <ArrowUpRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
