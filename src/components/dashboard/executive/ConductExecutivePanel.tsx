/**
 * Phase 5 — cross-module executive conduct view.
 * Numbers come from `executive_conduct_summary`, which runs under the caller's
 * privileges, so drill-through links can only reach rows the user may read.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface Summary {
  complaints_total: number;
  complaints_severe: number;
  complaints_open: number;
  sla_breaches: number;
  investigations_open: number;
  pattern_alerts_open: number;
  enforcement_open: number;
}

const TILES: Array<{ key: keyof Summary; label: string; href: string; alarming?: boolean }> = [
  { key: 'complaints_total', label: 'Complaints', href: '/complaints' },
  { key: 'complaints_open', label: 'Open complaints', href: '/complaints' },
  { key: 'complaints_severe', label: 'High / critical', href: '/complaints', alarming: true },
  { key: 'sla_breaches', label: 'SLA breaches', href: '/complaints', alarming: true },
  { key: 'investigations_open', label: 'Open investigations', href: '/conduct/investigations' },
  { key: 'pattern_alerts_open', label: 'Open conduct alerts', href: '/conduct/alerts' },
  { key: 'enforcement_open', label: 'Open enforcement', href: '/enforcement' },
];

export function ConductExecutivePanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['executive_conduct_summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('executive_conduct_summary', {});
      if (error) throw error;
      return data as unknown as Summary;
    },
    refetchInterval: 60_000,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Market conduct — executive view</CardTitle>
        <Badge variant="outline">drill-through respects your access</Badge>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {TILES.map((t) => (
              <Link key={t.key} to={t.href}
                className="rounded-md border p-3 hover:bg-muted/50 transition-colors">
                <div className={`text-2xl font-semibold font-mono ${t.alarming && Number(data[t.key]) > 0 ? 'text-destructive' : ''}`}>
                  {Number(data[t.key] ?? 0).toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">{t.label}</div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
