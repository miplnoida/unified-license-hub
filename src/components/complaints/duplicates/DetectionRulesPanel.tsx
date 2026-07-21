import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Rule {
  id: string; code: string; name: string; description: string | null;
  enabled: boolean; weight: number; category: string;
}

const categoryTone: Record<string, string> = {
  identity: 'bg-primary/15 text-primary border-primary/30',
  content: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  context: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
};

export function DetectionRulesPanel() {
  const qc = useQueryClient();
  const { data: fetched = [], isLoading } = useQuery<Rule[]>({
    queryKey: ['complaint_duplicate_rules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('complaint_duplicate_rules' as any).select('*').order('weight', { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const [rules, setRules] = useState<Rule[]>([]);
  useEffect(() => { setRules(fetched); }, [fetched]);

  const save = useMutation({
    mutationFn: async () => {
      for (const r of rules) {
        const { error } = await supabase.from('complaint_duplicate_rules' as any)
          .update({ enabled: r.enabled, weight: r.weight }).eq('id', r.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Detection rules saved');
      qc.invalidateQueries({ queryKey: ['complaint_duplicate_rules'] });
      qc.invalidateQueries({ queryKey: ['complaint_duplicate_stats'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = (id: string) => setRules(r => r.map(x => x.id === id ? { ...x, enabled: !x.enabled } : x));
  const setWeight = (id: string, w: number) => setRules(r => r.map(x => x.id === id ? { ...x, weight: w } : x));

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading rules…</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Detection Rules</CardTitle>
          <CardDescription>Signals used to identify duplicates. Weights guide the similarity score.</CardDescription>
        </div>
        <Button data-rbac="complaint_management.edit" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Save changes</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {rules.map(rule => (
          <div key={rule.id} className="rounded-md border p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{rule.name}</p>
                  <Badge variant="outline" className={`capitalize ${categoryTone[rule.category] ?? ''}`}>{rule.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{rule.description}</p>
              </div>
              <Switch checked={rule.enabled} onCheckedChange={() => toggle(rule.id)} />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Label className="text-xs w-16 shrink-0 text-muted-foreground">Weight</Label>
              <Slider value={[rule.weight]} min={0} max={100} step={5} disabled={!rule.enabled}
                onValueChange={(v) => setWeight(rule.id, v[0])} className="flex-1" />
              <span className="font-mono text-xs w-10 text-right">{rule.weight}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
