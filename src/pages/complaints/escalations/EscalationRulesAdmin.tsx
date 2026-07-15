import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { RuleCard } from './RuleCard';
import { MOCK_RULES } from './mockData';
import type { EscalationRule } from './types';

export function EscalationRulesAdmin() {
  const [rules, setRules] = useState<EscalationRule[]>(MOCK_RULES);

  const updateOne = (i: number, r: EscalationRule) => {
    setRules((prev) => prev.map((x, idx) => (idx === i ? r : x)));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Escalation Rules</h3>
          <p className="text-xs text-slate-600">Configure the automatic criteria that route complaints to the right tier.</p>
        </div>
        <Button size="sm" onClick={() => toast.success('Rule configuration saved (demo)')}>Save changes</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {rules.map((r, i) => <RuleCard key={r.key} rule={r} onChange={(nr) => updateOne(i, nr)} />)}
      </div>
    </div>
  );
}
