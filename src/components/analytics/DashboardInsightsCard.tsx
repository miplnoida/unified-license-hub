import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, RefreshCw, Loader2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { toast } from 'sonner';

type Insight = { text: string; severity: 'info' | 'warning' | 'critical'; module?: string };
type Action = { text: string; href: string; module?: string };
type InsightsPayload = {
  insights: Insight[];
  actions: Action[];
  generated_at: string;
  source: 'ai' | 'fallback';
  cached?: boolean;
};

const SEVERITY_BADGE: Record<Insight['severity'], string> = {
  info: 'bg-primary/10 text-primary border-primary/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  critical: 'bg-destructive/15 text-destructive border-destructive/30',
};

/**
 * AI-generated narrative layer for the Executive Dashboard.
 * Reads pre-aggregated cross-module metrics inside the edge function and
 * returns 3-5 bullet insights + top 3 recommended actions. Cached for 15
 * minutes per regulator scope.
 */
export function DashboardInsightsCard() {
  const [force, setForce] = useState(0);
  const [feedback, setFeedback] = useState<Record<number, 'up' | 'down'>>({});

  const { data, isLoading, isFetching, refetch } = useQuery<InsightsPayload>({
    queryKey: ['dashboard-insights', force],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-dashboard-insights', {
        body: { force: force > 0 },
      });
      if (error) throw error;
      if ((data as { ok?: boolean; error?: string })?.ok === false) {
        throw new Error((data as { error?: string })?.error ?? 'Failed');
      }
      return data as InsightsPayload;
    },
    staleTime: 10 * 60_000,
  });

  const handleRefresh = () => {
    setForce((n) => n + 1);
    refetch();
  };

  const rate = (idx: number, kind: 'up' | 'down') => {
    setFeedback((prev) => ({ ...prev, [idx]: kind }));
    toast.success(kind === 'up' ? 'Thanks — marked helpful' : 'Thanks — marked not useful');
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">AI Insights</CardTitle>
          {data && (
            <Badge variant="outline" className="text-[10px]">
              {data.source === 'ai' ? 'AI' : 'baseline'} · {new Date(data.generated_at).toLocaleTimeString()}
            </Badge>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={handleRefresh} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Generating cross-module insights…
          </div>
        )}
        {data && (
          <>
            <ul className="space-y-2">
              {data.insights.map((ins, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <Badge variant="outline" className={`${SEVERITY_BADGE[ins.severity]} mt-0.5 shrink-0`}>
                    {ins.severity}
                  </Badge>
                  <span className="flex-1">{ins.text}</span>
                  <div className="flex items-center gap-1 opacity-60 hover:opacity-100">
                    <button
                      onClick={() => rate(idx, 'up')}
                      className={`p-1 rounded hover:bg-muted ${feedback[idx] === 'up' ? 'text-success' : ''}`}
                      aria-label="helpful"
                    >
                      <ThumbsUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => rate(idx, 'down')}
                      className={`p-1 rounded hover:bg-muted ${feedback[idx] === 'down' ? 'text-destructive' : ''}`}
                      aria-label="not useful"
                    >
                      <ThumbsDown className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {data.actions.length > 0 && (
              <div>
                <div className="text-xs font-medium uppercase text-muted-foreground mb-2">
                  Recommended actions
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.actions.map((a, i) => (
                    <Button key={i} asChild size="sm" variant="outline">
                      <Link to={a.href}>{a.text}</Link>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default DashboardInsightsCard;
