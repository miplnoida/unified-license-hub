/**
 * Investigation case file (Phase 4): scope, legal basis and investigation plan.
 * Locked once the investigation is concluded so the case file cannot be
 * rewritten after closure.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export function InvestigationCaseFilePanel({
  investigation,
  locked,
  onSaved,
}: {
  investigation: { id: string; scope?: string | null; legal_basis?: string | null; investigation_plan?: string | null };
  locked: boolean;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const [scope, setScope] = useState(investigation.scope ?? '');
  const [legalBasis, setLegalBasis] = useState(investigation.legal_basis ?? '');
  const [plan, setPlan] = useState(investigation.investigation_plan ?? '');

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('conduct_investigations')
        .update({
          scope: scope.trim() || null,
          legal_basis: legalBasis.trim() || null,
          investigation_plan: plan.trim() || null,
        })
        .eq('id', investigation.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conduct_investigation', investigation.id] });
      toast.success('Case file saved');
      onSaved?.();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Case file</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label htmlFor="inv-scope">Scope</Label>
          <Textarea id="inv-scope" rows={3} value={scope} disabled={locked}
            onChange={(e) => setScope(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="inv-legal">Legal basis / powers relied on</Label>
          <Textarea id="inv-legal" rows={2} value={legalBasis} disabled={locked}
            onChange={(e) => setLegalBasis(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="inv-plan">Investigation plan</Label>
          <Textarea id="inv-plan" rows={4} value={plan} disabled={locked}
            onChange={(e) => setPlan(e.target.value)} />
        </div>
        {locked ? (
          <p className="text-xs text-muted-foreground">
            This investigation is concluded — the case file is read-only.
          </p>
        ) : (
          <Button size="sm" data-rbac="market_conduct.edit" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save case file
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
