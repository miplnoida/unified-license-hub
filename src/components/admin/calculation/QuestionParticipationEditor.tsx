/**
 * Question participation and weight policy (AML-06).
 *
 * The regulator decides, per methodology question, whether the question is
 * scored at all, what weight it carries and whether it is critical. Nothing is
 * scored here: the browser only collects and saves the policy, and the server
 * refuses anything a draft policy may not contain.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save } from 'lucide-react';
import {
  PARTICIPATION_OPTIONS, calcPolicyErrorMessage,
  useCalculationPolicyLayers, useMethodologyQuestionCatalogue, useSetQuestionWeights,
  type QuestionWeightRow,
} from '@/hooks/useAmlCalculationPolicy';

interface Props {
  configId: string;
  methodologyId: string;
  canEdit: boolean;
}

export function QuestionParticipationEditor({ configId, methodologyId, canEdit }: Props) {
  const { data: questions, isLoading } = useMethodologyQuestionCatalogue(methodologyId);
  const { data: layers } = useCalculationPolicyLayers(configId);
  const save = useSetQuestionWeights();
  const [rows, setRows] = useState<QuestionWeightRow[]>([]);

  useEffect(() => {
    if (!layers || !questions) return;
    setRows(questions.map((q) => {
      const existing = layers.questionWeights.find((r) => r.question_code === q.question_code);
      return existing ?? {
        question_code: q.question_code,
        participation: '',
        weight: null,
        is_critical: false,
      };
    }));
  }, [layers, questions]);

  const patch = (code: string, next: Partial<QuestionWeightRow>) =>
    setRows((prev) => prev.map((r) => (r.question_code === code ? { ...r, ...next } : r)));

  const commit = async () => {
    try {
      // Undecided participation is not sent: the server keeps the question
      // undecided and refuses review while any question remains so.
      await save.mutateAsync({ configId, rows: rows.filter((r) => r.participation !== '') });
      toast.success('Question participation policy saved.');
    } catch (e) {
      toast.error(calcPolicyErrorMessage(e));
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading the question catalogue…</p>;
  if (!questions?.length) {
    return <p className="text-sm text-muted-foreground">This methodology publishes no active questions, so there is nothing to weight.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Decide for every question whether it is scored, what weight it carries within its dimension, and whether
        an adverse answer is critical. Weight is required only where the dimension aggregates by weighted mean.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Question</TableHead>
              <TableHead>Prompt</TableHead>
              <TableHead className="w-48">Participation</TableHead>
              <TableHead className="w-28">Weight</TableHead>
              <TableHead className="w-24">Critical</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const q = questions.find((x) => x.question_code === r.question_code);
              return (
                <TableRow key={r.question_code}>
                  <TableCell className="font-mono text-xs">{r.question_code}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-md truncate">{q?.prompt ?? '—'}</TableCell>
                  <TableCell>
                    <Select value={r.participation || 'none'} disabled={!canEdit}
                      onValueChange={(v) => patch(r.question_code, { participation: v === 'none' ? '' : v })}>
                      <SelectTrigger><SelectValue placeholder="Undecided" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Undecided</SelectItem>
                        {PARTICIPATION_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="0.01" disabled={!canEdit}
                      value={r.weight ?? ''} aria-label={`Weight for ${r.question_code}`}
                      onChange={(e) => patch(r.question_code, { weight: e.target.value === '' ? null : Number(e.target.value) })} />
                  </TableCell>
                  <TableCell>
                    <Checkbox checked={r.is_critical} disabled={!canEdit}
                      aria-label={`Critical question ${r.question_code}`}
                      onCheckedChange={(v) => patch(r.question_code, { is_critical: v === true })} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Button data-rbac="aml_supervision.manage_config" onClick={commit} disabled={!canEdit || save.isPending}>
        <Save className="h-4 w-4 mr-2" />Save question participation
      </Button>
    </div>
  );
}

export default QuestionParticipationEditor;
