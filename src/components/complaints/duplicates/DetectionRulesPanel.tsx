import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { seedRules } from '@/pages/complaints/duplicates/seed';
import type { DetectionRule, DetectionSettings } from '@/pages/complaints/duplicates/types';

const categoryTone: Record<string, string> = {
  identity: 'bg-primary/15 text-primary border-primary/30',
  content: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  context: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
};

export function DetectionRulesPanel() {
  const [rules, setRules] = useState<DetectionRule[]>(seedRules);
  const [settings, setSettings] = useState<DetectionSettings>({
    minSimilarity: 70, timeWindowDays: 30, autoLink: false, notifyReviewer: true,
  });

  const toggle = (id: string) => setRules(r => r.map(x => x.id === id ? { ...x, enabled: !x.enabled } : x));
  const setWeight = (id: string, w: number) => setRules(r => r.map(x => x.id === id ? { ...x, weight: w } : x));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Detection Rules</CardTitle>
          <CardDescription>Signals used to identify duplicates. Weights are combined into the similarity score.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rules.map(rule => (
            <div key={rule.id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{rule.name}</p>
                    <Badge variant="outline" className={`capitalize ${categoryTone[rule.category]}`}>{rule.category}</Badge>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Global Settings</CardTitle>
          <CardDescription>Thresholds and reviewer behavior.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Minimum similarity</Label>
              <span className="font-mono text-xs">{settings.minSimilarity}%</span>
            </div>
            <Slider value={[settings.minSimilarity]} min={40} max={100} step={5}
              onValueChange={(v) => setSettings(s => ({ ...s, minSimilarity: v[0] }))} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Time window</Label>
              <span className="font-mono text-xs">{settings.timeWindowDays} days</span>
            </div>
            <Slider value={[settings.timeWindowDays]} min={1} max={180} step={1}
              onValueChange={(v) => setSettings(s => ({ ...s, timeWindowDays: v[0] }))} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Auto-link high-confidence pairs</Label>
              <p className="text-xs text-muted-foreground">Score ≥ 90% and identity match</p>
            </div>
            <Switch checked={settings.autoLink} onCheckedChange={(v) => setSettings(s => ({ ...s, autoLink: v }))} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Notify assigned reviewer</Label>
              <p className="text-xs text-muted-foreground">Email + in-app alert</p>
            </div>
            <Switch checked={settings.notifyReviewer} onCheckedChange={(v) => setSettings(s => ({ ...s, notifyReviewer: v }))} />
          </div>
          <Button className="w-full" onClick={() => toast.success('Rules saved (demo — not persisted)')}>
            Save Configuration
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
