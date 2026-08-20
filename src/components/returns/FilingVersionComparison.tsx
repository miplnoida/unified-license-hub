/**
 * RDM-ENTITY-001 Wave C — reviewer comparison of two return filing versions.
 *
 * The diff is computed server-side by `returns_compare_filing_versions`; this
 * component only presents it. Field changes, metric movements, validation
 * deltas, submission timestamps, declaration and the correction request are all
 * rendered as structured rows — never as raw JSON blobs.
 */
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, GitCompare, Info } from 'lucide-react';
import { formatDateTime } from '@/lib/datetime';
import { useFilingVersionComparison } from '@/hooks/useWaveC';

interface VersionOption {
  id: string;
  version_number: number;
  status: string;
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.length ? value.map((v) => String(v)).join(', ') : '—';
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length ? entries.map(([k, v]) => `${k}: ${String(v)}`).join('; ') : '—';
  }
  const text = String(value);
  return text.trim().length ? text : '—';
}

function humanField(field: string): string {
  return field
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const CHANGE_VARIANT: Record<string, string> = {
  ADDED: 'border-primary/30 bg-primary/10 text-primary',
  REMOVED: 'border-destructive/30 bg-destructive/10 text-destructive',
  CHANGED: '',
};

export function FilingVersionComparison({ versions }: { versions: VersionOption[] }) {
  const ordered = useMemo(
    () => [...versions].sort((a, b) => a.version_number - b.version_number),
    [versions],
  );

  const [left, setLeft] = useState<string | undefined>();
  const [right, setRight] = useState<string | undefined>();

  useEffect(() => {
    if (ordered.length >= 2) {
      setLeft((prev) => prev ?? ordered[ordered.length - 2].id);
      setRight((prev) => prev ?? ordered[ordered.length - 1].id);
    }
  }, [ordered]);

  const { data, isLoading, error } = useFilingVersionComparison(left, right);

  if (ordered.length < 2) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Only one version exists</AlertTitle>
        <AlertDescription>
          A comparison becomes available once a correction has been requested and the entity has
          submitted a second version of this filing.
        </AlertDescription>
      </Alert>
    );
  }

  const label = (v: VersionOption) => `v${v.version_number} — ${v.status}`;
  const changedForms = data?.forms.filter((f) => f.field_changes.length > 0 || f.form_version_pinning_changed) ?? [];
  const changedMetrics = data?.metrics.filter((m) => m.changed) ?? [];
  const newFindings = data
    ? data.validation.b.filter((b) => !data.validation.a.some((a) => a.rule_code === b.rule_code))
    : [];
  const clearedFindings = data
    ? data.validation.a.filter((a) => !data.validation.b.some((b) => b.rule_code === a.rule_code))
    : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCompare className="h-4 w-4" />Compare versions
          </CardTitle>
          <CardDescription>
            Select the baseline and the corrected version. Differences are computed by the platform,
            not in the browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Baseline version</Label>
            <Select value={left} onValueChange={setLeft}>
              <SelectTrigger><SelectValue placeholder="Select version" /></SelectTrigger>
              <SelectContent>
                {ordered.map((v) => <SelectItem key={v.id} value={v.id}>{label(v)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Compared version</Label>
            <Select value={right} onValueChange={setRight}>
              <SelectTrigger><SelectValue placeholder="Select version" /></SelectTrigger>
              <SelectContent>
                {ordered.map((v) => <SelectItem key={v.id} value={v.id}>{label(v)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Comparison unavailable</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Submission &amp; declaration</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Attribute</TableHead>
                  <TableHead>v{data.a.version_number}</TableHead>
                  <TableHead>v{data.b.version_number}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Status</TableCell>
                    <TableCell><Badge variant="outline">{data.a.status}</Badge></TableCell>
                    <TableCell><Badge variant="outline">{data.b.status}</Badge></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Submitted</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(data.a.submitted_at)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(data.b.submitted_at)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Declaration accepted</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(data.a.declaration_accepted_at)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(data.b.declaration_accepted_at)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Immutable</TableCell>
                    <TableCell>{data.a.is_immutable ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{data.b.is_immutable ? 'Yes' : 'No'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Reviewer rationale</TableCell>
                    <TableCell className="max-w-[280px] text-xs text-muted-foreground">{data.a.rejection_reason ?? '—'}</TableCell>
                    <TableCell className="max-w-[280px] text-xs text-muted-foreground">{data.b.rejection_reason ?? '—'}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {data.requests.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Correction request context</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.requests.map((r, i) => (
                  <div key={`${r.created_at}-${i}`} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{r.request_kind}</Badge>
                      <Badge variant="outline">{r.status}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span>
                    </div>
                    <p className="mt-2 text-sm">{r.message}</p>
                    {r.response_text && (
                      <p className="mt-2 border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">
                        Response ({formatDateTime(r.responded_at)}): {r.response_text}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Form response changes ({changedForms.length})</CardTitle>
              <CardDescription>Field-level differences per pinned form.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {changedForms.length === 0 ? (
                <p className="py-6 text-center text-muted-foreground">No form responses changed between these versions.</p>
              ) : changedForms.map((f) => (
                <div key={f.template_id ?? f.template_name ?? 'form'} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{f.template_name ?? 'Form'}</p>
                    <Badge variant="outline">{f.a_completion ?? '—'} → {f.b_completion ?? '—'}</Badge>
                    {f.form_version_pinning_changed && (
                      <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
                        Pinned form version differs
                      </Badge>
                    )}
                  </div>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Field</TableHead><TableHead>Change</TableHead>
                        <TableHead>v{data.a.version_number}</TableHead><TableHead>v{data.b.version_number}</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {f.field_changes.map((c) => (
                          <TableRow key={c.field}>
                            <TableCell className="font-medium">{humanField(c.field)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={CHANGE_VARIANT[c.change] ?? ''}>{c.change}</Badge>
                            </TableCell>
                            <TableCell className="max-w-[240px] break-words text-sm text-muted-foreground">{renderValue(c.old_value)}</TableCell>
                            <TableCell className="max-w-[240px] break-words text-sm font-medium">{renderValue(c.new_value)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Metric changes ({changedMetrics.length})</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Code</TableHead><TableHead>Metric</TableHead>
                  <TableHead className="text-right">v{data.a.version_number}</TableHead>
                  <TableHead className="text-right">v{data.b.version_number}</TableHead>
                  <TableHead className="text-right">Movement</TableHead>
                  <TableHead>Availability</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {changedMetrics.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No metric values changed.</TableCell></TableRow>
                  ) : changedMetrics.map((m) => (
                    <TableRow key={m.code}>
                      <TableCell className="font-mono text-xs">{m.code}</TableCell>
                      <TableCell>{m.name}{m.unit ? ` (${m.unit})` : ''}</TableCell>
                      <TableCell className="text-right font-mono">{m.a_value !== null ? Number(m.a_value).toLocaleString() : '—'}</TableCell>
                      <TableCell className="text-right font-mono">{m.b_value !== null ? Number(m.b_value).toLocaleString() : '—'}</TableCell>
                      <TableCell className="text-right font-mono">{m.delta !== null ? Number(m.delta).toLocaleString() : '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {(m.a_availability ?? '—')} → {(m.b_availability ?? '—')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Validation changes</CardTitle>
              <CardDescription>
                {newFindings.length} new, {clearedFindings.length} cleared.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {newFindings.length === 0 && clearedFindings.length === 0 ? (
                <p className="py-6 text-center text-muted-foreground">Validation outcome is unchanged.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Direction</TableHead><TableHead>Rule</TableHead>
                      <TableHead>Severity</TableHead><TableHead>Message</TableHead><TableHead>Blocking</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {newFindings.map((f) => (
                        <TableRow key={`new-${f.rule_code}`}>
                          <TableCell><Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">New</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{f.rule_code}</TableCell>
                          <TableCell>{f.severity}</TableCell>
                          <TableCell className="max-w-[360px]">{f.message}</TableCell>
                          <TableCell>{f.is_blocking ? 'Yes' : 'No'}</TableCell>
                        </TableRow>
                      ))}
                      {clearedFindings.map((f) => (
                        <TableRow key={`cleared-${f.rule_code}`}>
                          <TableCell><Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">Cleared</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{f.rule_code}</TableCell>
                          <TableCell>{f.severity}</TableCell>
                          <TableCell className="max-w-[360px]">{f.message}</TableCell>
                          <TableCell>{f.is_blocking ? 'Yes' : 'No'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
