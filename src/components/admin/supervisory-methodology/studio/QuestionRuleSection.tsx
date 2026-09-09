/**
 * Question applicability & trigger rules (AML-04).
 *
 * Structured authoring only: the source list, the operators and the group kinds
 * come from `supervisory_question_rule_vocabulary`, the rule is persisted by
 * `supervisory_methodology_question_rule_save`, and the readiness, summary and
 * findings shown here are all produced by the server. Nothing on this screen
 * evaluates a rule, and no free-text expression can be entered.
 */
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  useMethodologyQuestionRules,
  useQuestionRuleVocabulary,
  useRemoveQuestionRule,
  useSaveQuestionRule,
  type RuleVocabulary,
  type RuleVocabularySource,
} from '@/hooks/useSupervisoryMethodologyAdmin';
import { ErrorPanel, humanize } from '../labels';
import { SectionTitle } from './StudioKit';

interface Condition {
  source: string;
  op: string;
  value: string;
}

const RULE_KINDS = [
  { code: 'APPLICABILITY', label: 'Applicability — whether the question is in scope at all' },
  { code: 'TRIGGER', label: 'Trigger — whether a conditional question is switched on' },
];

function valuesOf(src?: RuleVocabularySource): { label: string; value: string }[] {
  if (!src?.allowed_values?.length) return [];
  return src.allowed_values.map((v) =>
    typeof v === 'string' ? { label: v, value: v } : { label: v.label, value: v.value });
}

function buildDefinition(group: string, conditions: Condition[], vocab: RuleVocabulary) {
  const nodes = conditions.map((c) => {
    const op = vocab.operators.find((o) => o.code === c.op);
    const node: Record<string, unknown> = { op: c.op };
    if (c.op !== 'TRUE' && c.op !== 'FALSE') node.source = c.source;
    if (op?.arity === 'VALUE') node.value = c.value;
    if (op?.arity === 'VALUES') node.values = c.value.split(',').map((v) => v.trim()).filter(Boolean);
    return node;
  });
  if (group === 'NOT') return { op: 'NOT', rule: nodes[0] };
  if (nodes.length === 1 && group === 'ALL') return nodes[0];
  return { op: group, rules: nodes };
}

function RuleAuthorDialog({
  open, onClose, methodologyId, questionId, defaultKind,
}: {
  open: boolean;
  onClose: () => void;
  methodologyId: string;
  questionId: string;
  defaultKind: string;
}) {
  const { data: vocab, isLoading } = useQuestionRuleVocabulary();
  const save = useSaveQuestionRule();
  const [kind, setKind] = useState(defaultKind);
  const [group, setGroup] = useState('ALL');
  const [rationale, setRationale] = useState('');
  const [provenance, setProvenance] = useState('');
  const [conditions, setConditions] = useState<Condition[]>([{ source: '', op: 'EQ', value: '' }]);

  const sources = useMemo(() => vocab?.sources ?? [], [vocab]);

  const operatorsFor = (sourceCode: string) => {
    const src = sources.find((s) => s.code === sourceCode);
    return (vocab?.operators ?? []).filter(
      (o) => o.types.length === 0 || (src ? o.types.includes(src.data_type) : true));
  };

  const patch = (i: number, next: Partial<Condition>) =>
    setConditions((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...next } : c)));

  const usable = conditions.slice(0, group === 'NOT' ? 1 : conditions.length);
  const complete = usable.every((c) => {
    const op = vocab?.operators.find((o) => o.code === c.op);
    if (!op) return false;
    if (c.op !== 'TRUE' && c.op !== 'FALSE' && !c.source) return false;
    if (op.arity === 'NONE') return true;
    return c.value.trim().length > 0;
  });

  const submit = async () => {
    if (!vocab) return;
    try {
      await save.mutateAsync({
        methodologyId,
        questionId,
        ruleKind: kind,
        ruleDefinition: buildDefinition(group, usable, vocab) as Record<string, unknown>,
        rationale: rationale.trim(),
        provenance: provenance.trim() || null,
      });
      toast.success('Rule saved; the server recomputed its summary and readiness');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The rule could not be saved');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Author an applicability rule</DialogTitle>
          <DialogDescription>
            Rules are built from the fields the server can actually resolve for an assessment. Free-text expressions are
            not accepted, and the rule is stored, described and evaluated only by the server.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !vocab ? <Skeleton className="h-64 w-full" /> : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Rule kind</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger aria-label="Rule kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RULE_KINDS.map((k) => <SelectItem key={k.code} value={k.code}>{k.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>How the conditions combine</Label>
                <Select value={group} onValueChange={setGroup}>
                  <SelectTrigger aria-label="Condition grouping"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {vocab.groups.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g === 'ALL' ? 'All conditions must hold' : g === 'ANY' ? 'Any condition may hold' : 'The condition must not hold'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <SectionTitle>Conditions</SectionTitle>
              {usable.map((c, i) => {
                const src = sources.find((s) => s.code === c.source);
                const ops = operatorsFor(c.source);
                const op = vocab.operators.find((o) => o.code === c.op);
                const allowed = valuesOf(src);
                return (
                  <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Field</Label>
                      <Select value={c.source} onValueChange={(v) => patch(i, { source: v, value: '' })}>
                        <SelectTrigger aria-label={`Condition ${i + 1} field`}><SelectValue placeholder="Select a field" /></SelectTrigger>
                        <SelectContent>
                          {sources.map((s) => (
                            <SelectItem key={s.code} value={s.code} disabled={!s.available}>
                              {s.label}{s.available ? '' : ' — not resolvable yet'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Test</Label>
                      <Select value={c.op} onValueChange={(v) => patch(i, { op: v, value: '' })}>
                        <SelectTrigger aria-label={`Condition ${i + 1} test`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ops.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Value</Label>
                      {op?.arity === 'NONE' ? (
                        <p className="pt-2 text-xs text-muted-foreground">No value needed</p>
                      ) : allowed.length && op?.arity === 'VALUE' ? (
                        <Select value={c.value} onValueChange={(v) => patch(i, { value: v })}>
                          <SelectTrigger aria-label={`Condition ${i + 1} value`}><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            {allowed.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          aria-label={`Condition ${i + 1} value`}
                          value={c.value}
                          placeholder={op?.arity === 'VALUES' ? 'Comma-separated values' : 'Value'}
                          onChange={(e) => patch(i, { value: e.target.value })}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
              {group !== 'NOT' ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConditions((prev) => [...prev, { source: '', op: 'EQ', value: '' }])}
                >
                  Add condition
                </Button>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-provenance">Standards or policy basis (optional)</Label>
              <Input id="rule-provenance" value={provenance} onChange={(e) => setProvenance(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-rationale">Reason for this rule (at least 10 characters)</Label>
              <Input id="rule-rationale" value={rationale} onChange={(e) => setRationale(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">{vocab.note}</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={save.isPending || !complete || rationale.trim().length < 10}
            data-rbac="aml_supervision.manage_config"
          >
            {save.isPending ? 'Saving…' : 'Save rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveRuleDialog({
  ruleId, methodologyId, questionId, onClose,
}: { ruleId: string | null; methodologyId: string; questionId: string; onClose: () => void }) {
  const [rationale, setRationale] = useState('');
  const remove = useRemoveQuestionRule();

  const submit = async () => {
    if (!ruleId) return;
    try {
      await remove.mutateAsync({ methodologyId, questionId, ruleId, rationale: rationale.trim() });
      toast.success('Rule withdrawn from this draft version');
      setRationale('');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The rule could not be withdrawn');
    }
  };

  return (
    <Dialog open={!!ruleId} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Withdraw this rule</DialogTitle>
          <DialogDescription>
            Existing assessments keep the plan they were given. Withdrawing a rule only changes how future assessments
            on this draft version are resolved.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="rule-remove-rationale">Reason (at least 10 characters)</Label>
          <Input id="rule-remove-rationale" value={rationale} onChange={(e) => setRationale(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={remove.isPending}>Cancel</Button>
          <Button variant="destructive" onClick={submit}
                  disabled={remove.isPending || rationale.trim().length < 10}
                  data-rbac="aml_supervision.manage_config">
            {remove.isPending ? 'Withdrawing…' : 'Withdraw rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QuestionRuleSection({
  methodologyId, questionId, questionClass, canAuthor,
}: {
  methodologyId: string;
  questionId: string;
  questionClass?: string | null;
  canAuthor: boolean;
}) {
  const { data, isLoading, error } = useMethodologyQuestionRules(questionId);
  const [authoring, setAuthoring] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const rules = data ?? [];
  const conditional = (questionClass ?? '').toUpperCase() === 'CONDITIONAL';
  const hasExecutableTrigger = rules.some((r) => r.rule_kind === 'TRIGGER' && r.readiness === 'EXECUTABLE');

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Applicability &amp; trigger rules
        </p>
        {canAuthor ? (
          <Button size="sm" variant="outline" onClick={() => setAuthoring(true)} data-rbac="aml_supervision.manage_config">
            Add rule
          </Button>
        ) : null}
      </div>

      {isLoading ? <Skeleton className="mt-3 h-20 w-full" /> : error ? <ErrorPanel error={error} /> : (
        <div className="mt-3 space-y-2">
          {conditional && !hasExecutableTrigger ? (
            <p className="rounded-md bg-muted p-2 text-xs">
              This question is conditional but has no executable trigger rule, so the server cannot decide when it
              applies. Validation reports this as blocking.
            </p>
          ) : null}
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rule is recorded. {conditional
                ? 'A conditional question needs a trigger rule before this version can be validated.'
                : 'Without a rule the question follows its class and the programme scope.'}
            </p>
          ) : rules.map((r) => (
            <div key={r.id} className="rounded-md border p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Badge variant="outline">{humanize(r.rule_kind)}</Badge>
                  <Badge variant={r.readiness === 'EXECUTABLE' ? 'secondary' : 'destructive'}>
                    {humanize(r.readiness)}
                  </Badge>
                  <span className="font-mono text-[11px] text-muted-foreground">v{r.rule_version}</span>
                </span>
                {canAuthor ? (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRemoving(r.id)}
                          data-rbac="aml_supervision.manage_config">
                    Withdraw
                  </Button>
                ) : null}
              </div>
              <p className="mt-1 text-sm">{r.rule_summary ?? 'The server has not produced a summary for this rule.'}</p>
              {r.provenance ? <p className="mt-1 text-xs text-muted-foreground">Basis: {r.provenance}</p> : null}
              {r.findings?.length ? (
                <ul className="mt-1 list-inside list-disc text-xs text-destructive">
                  {r.findings.map((f, i) => <li key={i}>{f.message}</li>)}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {authoring ? (
        <RuleAuthorDialog
          open
          onClose={() => setAuthoring(false)}
          methodologyId={methodologyId}
          questionId={questionId}
          defaultKind={conditional ? 'TRIGGER' : 'APPLICABILITY'}
        />
      ) : null}
      <RemoveRuleDialog
        ruleId={removing}
        methodologyId={methodologyId}
        questionId={questionId}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
