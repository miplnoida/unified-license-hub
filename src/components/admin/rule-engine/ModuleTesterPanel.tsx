import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Download, Loader2, Play, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { download } from '@/lib/ruleTester';
import {
  MODULE_TESTER_SPECS, ModuleFamily, ModuleTestHistoryRow, ModuleTestResult,
  buildInputs, fetchModuleTestHistory, moduleTestCsv, moduleTestJson, runModuleTest,
} from '@/lib/moduleRuleTester';

interface Props {
  family: ModuleFamily;
  ruleId: string;
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : '—');
const show = (v: unknown) =>
  v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);

/**
 * Specialised module tester (ADM-RE-003). Renders the family's own inputs,
 * evaluates the module's own rule row server-side and shows every condition,
 * the match result and the ordered actions the runtime owner would perform.
 */
export function ModuleTesterPanel({ family, ruleId }: Props) {
  const spec = MODULE_TESTER_SPECS[family];
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ModuleTestResult | null>(null);
  const [history, setHistory] = useState<ModuleTestHistoryRow[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await fetchModuleTestHistory(family, ruleId));
    } catch (e: any) {
      toast.error(e.message);
    }
  }, [family, ruleId]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const inputs = buildInputs(family, values);
      const data = await runModuleTest(family, ruleId, inputs);
      setResult(data);
      toast[data.matched ? 'success' : 'info'](
        data.matched ? 'Rule matched — see the previewed actions' : 'Rule did not match these inputs',
      );
      await loadHistory();
    } catch (e: any) {
      toast.error(e.message || 'Test failed');
    }
    setRunning(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{spec.label} (dry run)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{spec.blurb}</p>
          <p className="text-xs text-muted-foreground">
            Runtime owner: <span className="font-mono">{spec.runtimeOwner}</span>. A test run writes only its own
            test-history record — no alert, task, notification, escalation, RFI, assignment or workflow record is created.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            {spec.fields.map((f) => (
              <div key={f.path} className="space-y-2">
                <Label className="flex items-center gap-2">
                  {f.label}
                  {f.evaluated === false && (
                    <Badge variant="outline" className="text-[10px]">context only</Badge>
                  )}
                </Label>
                {f.type === 'boolean' ? (
                  <div className="flex h-10 items-center">
                    <Switch
                      checked={values[f.path] === true}
                      onCheckedChange={(v) => setValues((s) => ({ ...s, [f.path]: v }))}
                    />
                  </div>
                ) : f.type === 'json' ? (
                  <Textarea
                    rows={3}
                    className="font-mono text-xs"
                    placeholder={f.placeholder}
                    value={String(values[f.path] ?? '')}
                    onChange={(e) => setValues((s) => ({ ...s, [f.path]: e.target.value }))}
                  />
                ) : (
                  <Input
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                    placeholder={f.placeholder}
                    value={String(values[f.path] ?? '')}
                    onChange={(e) => setValues((s) => ({ ...s, [f.path]: e.target.value }))}
                  />
                )}
                {f.help && <p className="text-[11px] text-muted-foreground">{f.help}</p>}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={run} disabled={running} data-rbac="rule_engine.test">
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Run test
            </Button>
            {result && (
              <>
                <Button data-rbac="rule_engine.export" variant="outline" onClick={() => download(`${result.rule_code}-test.csv`, moduleTestCsv(result))}>
                  <Download className="mr-2 h-4 w-4" />CSV
                </Button>
                <Button data-rbac="rule_engine.export" variant="outline" onClick={() => download(`${result.rule_code}-test.json`, moduleTestJson(result))}>
                  <Download className="mr-2 h-4 w-4" />JSON
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {result.matched
                ? <CheckCircle2 className="h-4 w-4 text-primary" />
                : <XCircle className="h-4 w-4 text-muted-foreground" />}
              {result.rule_code} — {result.matched ? 'matched' : 'not matched'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 text-xs sm:grid-cols-4">
              <div><span className="text-muted-foreground">Rule</span><div>{result.rule_name || '—'}</div></div>
              <div><span className="text-muted-foreground">Mode</span><div>{result.mode}</div></div>
              <div><span className="text-muted-foreground">Duration</span><div>{result.duration_ms} ms</div></div>
              <div><span className="text-muted-foreground">Correlation ID</span><div className="font-mono break-all">{result.correlation_id}</div></div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-medium">Conditions</h4>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Condition</TableHead>
                      <TableHead>Metric</TableHead>
                      <TableHead>Actual</TableHead>
                      <TableHead>Operator</TableHead>
                      <TableHead>Expected</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(result.conditions || []).map((c, i) => (
                      <TableRow key={i}>
                        <TableCell>{c.label}</TableCell>
                        <TableCell className="font-mono text-xs">{show(c.metric)}</TableCell>
                        <TableCell className="font-mono text-xs">{show(c.actual)}</TableCell>
                        <TableCell className="font-mono text-xs">{show(c.operator)}</TableCell>
                        <TableCell className="font-mono text-xs">{show(c.expected)}</TableCell>
                        <TableCell>
                          <Badge variant={c.passed ? 'default' : 'outline'}>{c.passed ? 'pass' : 'fail'}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.reason}</TableCell>
                      </TableRow>
                    ))}
                    {!(result.conditions || []).length && (
                      <TableRow><TableCell colSpan={7} className="text-sm text-muted-foreground">
                        This rule declares no evaluable condition for the supplied inputs.
                      </TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-medium">Expected actions (in execution order)</h4>
              {(result.expected_actions || []).length ? (
                <ol className="space-y-1 text-sm">
                  {result.expected_actions.map((a, i) => (
                    <li key={i} className="rounded border p-2 font-mono text-xs">{JSON.stringify(a)}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">No action would be taken for these inputs.</p>
              )}
            </div>

            {result.notes && <p className="text-xs text-muted-foreground">{result.notes}</p>}
            <p className="text-xs text-muted-foreground">Side effects: {result.side_effects}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Test history</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run at</TableHead>
                  <TableHead>Matched</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Correlation ID</TableHead>
                  <TableHead>Inputs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="whitespace-nowrap">{fmt(h.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={h.matched ? 'default' : 'outline'}>{h.matched ? 'yes' : 'no'}</Badge>
                    </TableCell>
                    <TableCell>{h.duration_ms ?? '—'} ms</TableCell>
                    <TableCell className="font-mono text-[11px] break-all">{h.correlation_id}</TableCell>
                    <TableCell className="font-mono text-[11px] max-w-[24rem] truncate">
                      {JSON.stringify(h.inputs)}
                    </TableCell>
                  </TableRow>
                ))}
                {!history.length && (
                  <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">
                    No test has been run against this rule yet.
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ModuleTesterPanel;
