/**
 * Enforcement obligations and compliance monitoring (Phase 4).
 * Obligations carry deadlines; overdue ones are surfaced so non-compliance is
 * visible rather than inferred.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export function EnforcementObligationsPanel({ caseId }: { caseId: string }) {
  const qc = useQueryClient();
  const [obligation, setObligation] = useState('');
  const [detail, setDetail] = useState('');
  const [deadline, setDeadline] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['enforcement_obligations', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enforcement_obligations')
        .select('*')
        .eq('case_id', caseId)
        .order('deadline', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      // Governed: permission, creator attribution and audit are server-side.
      await enforcementObligationAdd({
        caseId,
        obligation: obligation.trim(),
        detail: detail.trim() || null,
        deadline: deadline || null,
      });
    },
    onSuccess: () => {
      setObligation(''); setDetail(''); setDeadline('');
      qc.invalidateQueries({ queryKey: ['enforcement_obligations', caseId] });
      toast.success('Obligation added');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not add obligation'),
  });

  const setStatus = useMutation({
    mutationFn: async (args: { id: string; status: string; breachNote?: string }) => {
      // Governed: compliance outcome attribution and audit are server-side.
      await enforcementObligationSetStatus({
        obligationId: args.id,
        status: args.status,
        breachNote: args.breachNote ?? null,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['enforcement_obligations', caseId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Update failed'),
  });


  const overdue = (o: any) =>
    o.status !== 'complied' && o.deadline && new Date(o.deadline) < new Date();

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Obligations & compliance monitoring</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <Label htmlFor="eo-ob">Obligation</Label>
            <Input id="eo-ob" value={obligation} onChange={(e) => setObligation(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="eo-dl">Deadline</Label>
            <Input id="eo-dl" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <Label htmlFor="eo-dt">Detail</Label>
            <Textarea id="eo-dt" rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} />
          </div>
        </div>
        <Button size="sm" data-rbac="enforcement_management.edit"
          disabled={add.isPending} onClick={() => add.mutate()}>
          {add.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Add obligation
        </Button>

        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : !data?.length ? (
          <p className="text-sm text-muted-foreground">No obligations recorded.</p>
        ) : (
          <div className="space-y-2">
            {data.map((o: any) => (
              <div key={o.id} className="rounded border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{o.obligation}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">{o.status}</Badge>
                    {overdue(o) && <Badge variant="destructive">overdue</Badge>}
                    {o.deadline && <span className="text-xs text-muted-foreground">due {o.deadline}</span>}
                  </span>
                </div>
                {o.detail && <div className="mt-1 text-muted-foreground">{o.detail}</div>}
                {o.breach_note && <div className="mt-1 text-destructive text-xs">{o.breach_note}</div>}
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" data-rbac="enforcement_management.edit"
                    onClick={() => setStatus.mutate({ id: o.id, status: 'complied' })}>Mark complied</Button>
                  <Button size="sm" variant="outline" data-rbac="enforcement_management.edit"
                    onClick={() => setStatus.mutate({ id: o.id, status: 'breached', breachNote: 'Deadline missed' })}>
                    Mark breached
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
