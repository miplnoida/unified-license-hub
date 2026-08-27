import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2, Download, Loader2, Play, XCircle, GitCompareArrows,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  TEST_MODES, TestMode, TesterRunResult, VersionTarget,
  download, parseOverrides, runRuleTest, testRunCsv, testRunJson,
} from '@/lib/ruleTester';

interface Props {
  ruleId?: string;
  isNew: boolean;
  ruleCode?: string;
  currentVersion?: number;
  activeVersion?: number | null;
  versions: { version: number; note: string | null; created_at: string }[];
  history: any[];
  onRan: () => void;
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : '—');

/**
 * Shared Rule Tester (ADM-RE-003). Version-aware, mode-aware, dry-run only:
 * every run writes nothing but the saved test record and its audit entry.
 */
export function RuleTesterPanel({
  ruleId, isNew, ruleCode, currentVersion, activeVersion, versions, history, onRan,
}: Props) {
  const [mode, setMode] = useState<TestMode>('current_snapshot');
  const [versionTarget, setVersionTarget] = useState<string>('draft');
  const [entityId, setEntityId] = useState('');
  const [asOf, setAsOf] = useState('');
  const [limit, setLimit] = useState('25');
  const [label, setLabel] = useState('');
  const [overrideText, setOverrideText] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TesterRunResult | null>(null);
  const [compareA, setCompareA] = useState<string>('');
  const [compareB, setCompareB] = useState<string>('');

  const modeBlurb = TEST_MODES.find((m) => m.value === mode)?.blurb;

  const versionOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [
      { value: 'draft', label: `Current draft (v${currentVersion ?? 1})` },
    ];
    if (activeVersion) opts.push({ value: 'active', label: `Active version (v${activeVersion})` });
    for (const v of versions) opts.push({ value: String(v.version), label: `Historical v${v.version}` });
    return opts;
  }, [currentVersion, activeVersion, versions]);

  const run = async () => {
    if (isNew || !ruleId) return toast.error('Save the rule before testing.');
    if (mode === 'override' && !overrideText.trim()) {
      return toast.error('Provide at least one metric override, e.g. car_ratio=8.5');
    }
    if (mode === 'historical_replay' && !asOf) {
      return toast.error('Choose the date to replay against.');
    }
    setRunning(true);
    setResult(null);
    try {
      const version: VersionTarget =
        versionTarget === 'draft' || versionTarget === 'active'
          ? (versionTarget as VersionTarget)
          : Number(versionTarget);
      const data = await runRuleTest({
        ruleId, mode, version,
        entityId: entityId.trim() || null,
        asOf: asOf || null,
        limit: Number(limit) || 25,
        label: label.trim() || null,
        overrides: mode === 'override' ? parseOverrides(overrideText) : {},
      });
      setResult(data);
      if (data.ok === false) toast.error(data.error || 'Test failed');
      else if (data.passed) toast.success(`Test passed — ${data.matched} of ${data.candidates} records match`);
      else toast.warning('Test ran but did not pass: no evaluable data or errors were reported.');
      onRan();
    } catch (e: any) {
      toast.error(e.message);
    }
    setRunning(false);
  };

  const first = result?.results?.[0];
  const runA = history.find((h) => h.id === compareA);
  const runB = history.find((h) => h.id === compareB);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Rule Tester (dry run)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Tests never touch production data: no alerts, tasks, notifications, workflows, risk updates or
            suppression records are created and the rule's trigger counters stay unchanged. Only the saved
            test record and its audit entry are written.
          </p>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Test mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as TestMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEST_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{modeBlurb}</p>
            </div>

            <div className="space-y-2">
              <Label>Version under test</Label>
              <Select value={versionTarget} onValueChange={setVersionTarget}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {versionOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Run label (optional)</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Q2 tuning check" />
            </div>

            <div className="space-y-2">
              <Label>Entity ID (optional)</Label>
              <Input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="Restrict to one licensee" />
            </div>

            <div className="space-y-2">
              <Label>As at date {mode === 'historical_replay' && <span className="text-destructive">*</span>}</Label>
              <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Sample limit</Label>
              <Input type="number" min={1} max={100} value={limit} onChange={(e) => setLimit(e.target.value)} />
            </div>
          </div>

          {mode === 'override' && (
            <div className="space-y-2">
              <Label>Manual metric values</Label>
              <Textarea
                rows={3}
                value={overrideText}
                onChange={(e) => setOverrideText(e.target.value)}
                placeholder={'One per line, e.g.\ncar_ratio=8.5\nliquid_assets_ratio=12'}
              />
              <p className="text-xs text-muted-foreground">
                Overrides bypass stored data and evaluate the configured conditions directly.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button data-rbac="rule_engine.edit" onClick={run} disabled={running || isNew}>
              {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />} Run test
            </Button>
            {result && (
              <>
                <Button data-rbac="rule_engine.export" variant="outline" onClick={() => download(`rule-test-${ruleCode ?? 'rule'}.csv`, testRunCsv(result))}>
                  <Download className="h-4 w-4 mr-2" /> Export CSV
                </Button>
                <Button data-rbac="rule_engine.export" variant="outline" onClick={() => download(`rule-test-${ruleCode ?? 'rule'}.json`, testRunJson(result), 'application/json')}>
                  <Download className="h-4 w-4 mr-2" /> Export JSON
                </Button>
              </>
            )}
          </div>

          {result && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {result.passed
                  ? <Badge variant="approved" className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Passed</Badge>
                  : <Badge variant="destructive" className="gap-1"><XCircle className="h-3.5 w-3.5" /> Not passed</Badge>}
                <span className="font-mono text-xs">mode: {result.mode}</span>
                <span className="font-mono text-xs">version: v{first?.version ?? '—'}</span>
                <span className="font-mono text-xs">{result.candidates ?? 0} evaluated</span>
                <span className="font-mono text-xs">{result.matched ?? 0} matched</span>
                <span className="font-mono text-xs">{result.unmatched ?? 0} unmatched</span>
                <span className="font-mono text-xs">{result.duration_ms ?? 0} ms</span>
                <span className="font-mono text-xs">cid: {result.correlation_id}</span>
              </div>

              {first && (
                <div className="text-xs text-muted-foreground">
                  Effective {first.effective_from || 'always'} → {first.effective_to || 'no end'} ·{' '}
                  {first.executable_as_of ? 'in force for this run' : 'NOT in force for this run'} ·
                  action failure policy: {first.on_action_failure}
                </div>
              )}

              {(result.errors || []).length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  {(result.errors as string[]).join('; ')}
                </div>
              )}

              <div className="space-y-3">
                {(first?.preview || []).map((row, i) => (
                  <div key={i} className="rounded-md border p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{row.entity_label || row.entity_key || '—'}</span>
                      {row.matched ? <Badge variant="approved">Match</Badge> : <Badge variant="outline">No match</Badge>}
                      {row.suppression?.suppressed && (
                        <Badge variant="secondary">
                          Suppressed until {fmt(row.suppression.suppressed_until)}
                        </Badge>
                      )}
                      {row.suppression?.critical_bypass && <Badge variant="outline">Critical — suppression bypassed</Badge>}
                    </div>

                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>#</TableHead><TableHead>Metric</TableHead><TableHead>Actual</TableHead>
                        <TableHead>Operator</TableHead><TableHead>Expected</TableHead>
                        <TableHead>Result</TableHead><TableHead>Reason</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {(row.conditions || []).map((c) => (
                          <TableRow key={c.index}>
                            <TableCell className="text-xs font-mono">{c.index + 1}</TableCell>
                            <TableCell className="text-xs font-mono">{c.metric}</TableCell>
                            <TableCell className="text-xs font-mono">{String(c.actual ?? '—')}</TableCell>
                            <TableCell className="text-xs">{c.operator_symbol}</TableCell>
                            <TableCell className="text-xs font-mono">{String(c.expected ?? '—')}</TableCell>
                            <TableCell>{c.passed ? <Badge variant="approved">Pass</Badge> : <Badge variant="outline">Fail</Badge>}</TableCell>
                            <TableCell className="text-xs">{c.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    <div className="text-xs">
                      <span className="text-muted-foreground">Actions that would fire, in order: </span>
                      {(row.would_do || []).length === 0 ? 'none' : (row.would_do as any[]).map((w, wi) => (
                        <div key={wi} className="font-mono">
                          {Number(w.action_index) + 1}. {w.type}
                          {w.alert_text ? ` — ${w.alert_text}` : ''}
                          {w.event_key ? ` — ${w.event_key}` : ''}
                          {w.assigned_role ? ` — ${w.assigned_role}` : ''}
                          {w.due_date ? ` (due ${w.due_date})` : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Saved test runs</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No test runs recorded yet.</p>
          ) : (
            <>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Run at</TableHead><TableHead>Mode</TableHead><TableHead>Version</TableHead>
                  <TableHead>Evaluated</TableHead><TableHead>Matched</TableHead>
                  <TableHead>Duration</TableHead><TableHead>Result</TableHead><TableHead>Label</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {history.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs font-mono">{fmt(t.created_at)}</TableCell>
                      <TableCell className="text-xs">{t.run_mode || 'current_snapshot'}</TableCell>
                      <TableCell className="text-xs font-mono">v{t.target_version ?? t.version}</TableCell>
                      <TableCell className="text-xs font-mono">{t.evaluated_count}</TableCell>
                      <TableCell className="text-xs font-mono">{t.matched_count}</TableCell>
                      <TableCell className="text-xs font-mono">{t.duration_ms ?? '—'}</TableCell>
                      <TableCell>{t.passed ? <Badge variant="approved">Passed</Badge> : <Badge variant="destructive">Failed</Badge>}</TableCell>
                      <TableCell className="text-xs">{t.label || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Compare run A</Label>
                  <Select value={compareA} onValueChange={setCompareA}>
                    <SelectTrigger><SelectValue placeholder="Select a run" /></SelectTrigger>
                    <SelectContent>
                      {history.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {fmt(t.created_at)} · v{t.target_version ?? t.version} · {t.run_mode || 'current_snapshot'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Compare run B</Label>
                  <Select value={compareB} onValueChange={setCompareB}>
                    <SelectTrigger><SelectValue placeholder="Select a run" /></SelectTrigger>
                    <SelectContent>
                      {history.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {fmt(t.created_at)} · v{t.target_version ?? t.version} · {t.run_mode || 'current_snapshot'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {runA && runB && (
                <div className="rounded-md border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <GitCompareArrows className="h-4 w-4" /> Run comparison
                  </div>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Field</TableHead><TableHead>Run A</TableHead><TableHead>Run B</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {([
                        ['Run at', fmt(runA.created_at), fmt(runB.created_at)],
                        ['Mode', runA.run_mode || 'current_snapshot', runB.run_mode || 'current_snapshot'],
                        ['Version', `v${runA.target_version ?? runA.version}`, `v${runB.target_version ?? runB.version}`],
                        ['Evaluated', runA.evaluated_count, runB.evaluated_count],
                        ['Matched', runA.matched_count, runB.matched_count],
                        ['Duration (ms)', runA.duration_ms ?? '—', runB.duration_ms ?? '—'],
                        ['Passed', runA.passed ? 'yes' : 'no', runB.passed ? 'yes' : 'no'],
                        ['Error', runA.error || '—', runB.error || '—'],
                      ] as [string, unknown, unknown][]).map(([field, a, b]) => (
                        <TableRow key={field}>
                          <TableCell className="text-xs">{field}</TableCell>
                          <TableCell className={`text-xs font-mono ${String(a) !== String(b) ? 'text-primary font-semibold' : ''}`}>{String(a)}</TableCell>
                          <TableCell className={`text-xs font-mono ${String(a) !== String(b) ? 'text-primary font-semibold' : ''}`}>{String(b)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
