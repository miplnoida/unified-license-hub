/**
 * Calculation Approvals (Administration).
 *
 * Independent review of a submitted supervisory calculation configuration. The
 * server refuses an approval by the author of the configuration, refuses an
 * activation of anything not approved, and requires a rationale for every
 * transition; this screen only surfaces those governed operations.
 */
import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  useCalculationConfigs, useCalculationConfigDetail, useCalcMethodologies,
  useCalculationConfigLifecycle, useValidateCalculationConfig,
  calcErrorMessage, riskScaleCodes, controlScaleCodes,
} from '@/hooks/useSupervisoryCalculationConfig';

export default function SupervisoryCalculationApprovals() {
  const { data: configs = [] } = useCalculationConfigs();
  const { data: methodologies = [] } = useCalcMethodologies();
  const lifecycle = useCalculationConfigLifecycle();
  const validate = useValidateCalculationConfig();

  const [openId, setOpenId] = useState<string>('');
  const [rationale, setRationale] = useState('');
  const [problems, setProblems] = useState<string[] | null>(null);
  const { data: detail } = useCalculationConfigDetail(openId || undefined);

  const queue = configs.filter((c) => c.status === 'REVIEW' || c.status === 'APPROVED');
  const selected = configs.find((c) => c.id === openId) ?? null;
  const methodology = methodologies.find((m) => m.id === selected?.methodology_id) ?? null;

  const act = async (toStatus: 'APPROVED' | 'DRAFT' | 'ACTIVE') => {
    if (!selected) return;
    try {
      await lifecycle.mutateAsync({ configId: selected.id, toStatus, rationale });
      setRationale('');
      toast.success(
        toStatus === 'APPROVED' ? 'Configuration approved.'
          : toStatus === 'ACTIVE' ? 'Configuration activated; it now governs every calculation.'
          : 'Configuration returned to the author.',
      );
    } catch (e) {
      toast.error(calcErrorMessage(e));
    }
  };

  const check = async () => {
    if (!selected) return;
    try {
      const result = await validate.mutateAsync(selected.id);
      setProblems(result.problems ?? []);
    } catch (e) {
      toast.error(calcErrorMessage(e));
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Calculation Approvals"
          description="Independently review, approve and activate supervisory calculation configurations. The author of a configuration cannot approve it."
          backHref="/admin/config/supervision"
          backLabel="Supervision Configuration"
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Awaiting decision</CardTitle>
            <CardDescription>Configurations submitted for approval, and approved configurations awaiting activation.</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Methodology</TableHead><TableHead>Version</TableHead><TableHead>Status</TableHead>
                  <TableHead>Effective from</TableHead><TableHead>Submitted</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-muted-foreground">Nothing is awaiting a calculation decision.</TableCell></TableRow>
                )}
                {queue.map((c) => {
                  const m = methodologies.find((x) => x.id === c.methodology_id);
                  return (
                    <TableRow key={c.id} className={c.id === openId ? 'bg-muted/50' : undefined}>
                      <TableCell>{m ? `${m.domain_code} — ${m.title ?? m.name ?? m.code} v${m.version}` : c.methodology_id}</TableCell>
                      <TableCell className="font-mono">v{c.config_version}</TableCell>
                      <TableCell><Badge variant={c.status === 'APPROVED' ? 'default' : 'secondary'}>{c.status}</Badge></TableCell>
                      <TableCell>{c.effective_from ?? '—'}</TableCell>
                      <TableCell>{c.submitted_at ? new Date(c.submitted_at).toLocaleString() : '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => { setOpenId(c.id); setProblems(null); }}>Review</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {selected && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Version {selected.config_version} — {selected.status}
              </CardTitle>
              <CardDescription>{selected.notes ?? 'The author recorded no note for the approver.'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {problems && (
                problems.length === 0 ? (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Complete</AlertTitle>
                    <AlertDescription>Every parameter the calculation needs is published.</AlertDescription>
                  </Alert>
                ) : (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Incomplete</AlertTitle>
                    <AlertDescription><ul className="list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul></AlertDescription>
                  </Alert>
                )
              )}

              <div className="grid gap-4 md:grid-cols-2 text-sm">
                <div className="space-y-1">
                  <p><span className="text-muted-foreground">Aggregation:</span> {selected.aggregation_method}</p>
                  <p><span className="text-muted-foreground">Not applicable:</span> {selected.na_denominator_handling}</p>
                  <p><span className="text-muted-foreground">Insufficient evidence:</span> {selected.evidence_insufficiency_handling}</p>
                  <p><span className="text-muted-foreground">Critical question:</span> {selected.critical_question_handling}</p>
                </div>
                <div className="space-y-1">
                  <p><span className="text-muted-foreground">Recommendation policy:</span> {selected.recommendation_policy}</p>
                  <p><span className="text-muted-foreground">Threshold:</span> {selected.recommendation_threshold ?? '—'}</p>
                  <p><span className="text-muted-foreground">Rounding:</span> {selected.rounding_mode} ({selected.rounding_decimals} dp)</p>
                  <p><span className="text-muted-foreground">Inherent direction:</span> {selected.inherent_direction}</p>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold mb-2">Response scoring</h3>
                  <Table>
                    <TableHeader><TableRow><TableHead>Response</TableHead><TableHead>Score</TableHead><TableHead>Excluded</TableHead><TableHead>Critical</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(detail?.responses ?? []).map((r) => (
                        <TableRow key={r.response_code}>
                          <TableCell className="font-mono">{r.response_code}</TableCell>
                          <TableCell>{r.score ?? '—'}</TableCell>
                          <TableCell>{r.excluded_from_denominator ? 'yes' : 'no'}</TableCell>
                          <TableCell>{r.is_critical_floor ? 'yes' : 'no'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-2">Bands</h3>
                  <Table>
                    <TableHeader><TableRow><TableHead>Kind</TableHead><TableHead>Rating</TableHead><TableHead>Range</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(detail?.bands ?? []).map((b) => (
                        <TableRow key={`${b.band_kind}-${b.band_code}`}>
                          <TableCell>{b.band_kind}</TableCell>
                          <TableCell className="font-mono">{b.band_code}</TableCell>
                          <TableCell>{b.min_score}–{b.max_score}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Residual matrix</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Inherent \ Control</TableHead>
                        {controlScaleCodes(methodology).map((c) => <TableHead key={c}>{c}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {riskScaleCodes(methodology).map((inh) => (
                        <TableRow key={inh}>
                          <TableCell className="font-mono">{inh}</TableCell>
                          {controlScaleCodes(methodology).map((ctl) => (
                            <TableCell key={ctl}>
                              {(detail?.matrix ?? []).find((m) => m.inherent_band === inh && m.control_band === ctl)?.residual_rating ?? '—'}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="space-y-3 border-t pt-4">
                <Label htmlFor="approval-rationale">Decision rationale (at least 10 characters)</Label>
                <Textarea id="approval-rationale" rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={check} disabled={validate.isPending}>Check completeness</Button>
                  {selected.status === 'REVIEW' && (
                    <>
                      <Button data-rbac="aml_supervision.manage_config" onClick={() => act('APPROVED')}
                        disabled={lifecycle.isPending || rationale.trim().length < 10}>
                        Approve
                      </Button>
                      <Button data-rbac="aml_supervision.manage_config" variant="outline" onClick={() => act('DRAFT')}
                        disabled={lifecycle.isPending || rationale.trim().length < 10}>
                        Return to author
                      </Button>
                    </>
                  )}
                  {selected.status === 'APPROVED' && (
                    <Button data-rbac="aml_supervision.manage_config" onClick={() => act('ACTIVE')}
                      disabled={lifecycle.isPending || rationale.trim().length < 10}>
                      Publish
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
