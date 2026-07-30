import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Gavel, Loader2, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLicenseAppeals } from '@/hooks/useLicenseAppeals';
import {
  APPEAL_WINDOW_DAYS, appealDeadlineFor, appealDecisionMeta, appealStatusMeta,
  daysRemaining, formatAppealDate,
} from '@/lib/licenseAppeals';
import { AppealTimeline } from '@/components/appeals/AppealTimeline';
import { LodgeAppealDialog } from '@/components/appeals/LodgeAppealDialog';

interface RefusedApplication {
  id: string;
  application_number: string;
  rejected_at: string | null;
  updated_at: string | null;
  regulator_id: string | null;
}

/** Applicant-facing list of appeals they have lodged, with live status and history. */
export default function MyAppeals() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: appeals, isLoading } = useLicenseAppeals();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refused, setRefused] = useState<RefusedApplication[]>([]);
  const [loadingRefused, setLoadingRefused] = useState(true);
  const [refusedError, setRefusedError] = useState<string | null>(null);
  const [refusedRetryKey, setRefusedRetryKey] = useState(0);
  const [lodgeFor, setLodgeFor] = useState<RefusedApplication | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user?.id) { setLoadingRefused(false); return; }
      setLoadingRefused(true);
      setRefusedError(null);
      const { data, error } = await supabase
        .from('applications')
        .select('id, application_number, rejected_at, updated_at, regulator_id')
        .eq('applicant_id', user.id)
        .eq('status', 'rejected')
        .order('updated_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        setRefused([]);
        setRefusedError('We could not check which applications are eligible for appeal. Please try again.');
        setLoadingRefused(false);
        return;
      }
      setRefused((data || []) as unknown as RefusedApplication[]);
      setLoadingRefused(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [user?.id, refusedRetryKey]);

  const appealedAppIds = new Set((appeals || []).map((a) => a.application_id));
  const appealable = refused.filter((r) => !appealedAppIds.has(r.id));
  const busy = isLoading || loadingRefused;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="My Appeals"
          description="Appeals you have lodged against licensing decisions, and how they are progressing."
        />

        {busy ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading appeals…
          </div>
        ) : (
          <>
            {refusedError && (
              <Card className="border-destructive/40">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{refusedError}</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setRefusedRetryKey((key) => key + 1)}>
                    Try again
                  </Button>
                </CardContent>
              </Card>
            )}

            {appealable.length > 0 && (
              <Card className="border-amber-200">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Gavel className="h-4 w-4 text-amber-600" />
                    Applications you can appeal
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {appealable.map((app) => {
                    const deadline = appealDeadlineFor(app.rejected_at || app.updated_at);
                    const remaining = daysRemaining(deadline);
                    const closed = remaining !== null && remaining < 0;
                    return (
                      <div
                        key={app.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                      >
                        <div className="space-y-1">
                          <p className="font-mono text-sm font-medium">{app.application_number}</p>
                          <p className="text-xs text-muted-foreground">
                            Refused on {formatAppealDate(app.rejected_at || app.updated_at)}
                          </p>
                          {deadline && (
                            <p className={`flex items-center gap-1 text-xs ${closed ? 'text-destructive' : 'text-amber-700'}`}>
                              <AlertTriangle className="h-3 w-3" />
                              {closed
                                ? `Appeal window closed on ${formatAppealDate(deadline.toISOString())}`
                                : `${remaining} day${remaining === 1 ? '' : 's'} left — deadline ${formatAppealDate(deadline.toISOString())}`}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => navigate(`/applications/${app.id}`)}>
                            View application
                          </Button>
                          <Button size="sm" disabled={closed} onClick={() => setLodgeFor(app)}>
                            <Gavel className="h-4 w-4 mr-2" />
                            Lodge an appeal
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {!appeals?.length && !refusedError ? (
              <Card>
                <CardContent className="py-12 text-center space-y-3">
                  <Gavel className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {appealable.length > 0
                      ? `You have not lodged any appeals yet. Use "Lodge an appeal" above — you have ${APPEAL_WINDOW_DAYS} days from the refusal.`
                      : 'You have no appeals and no refused applications within the appeal window.'}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => navigate('/applications')}>
                    View my applications
                  </Button>
                </CardContent>
              </Card>
            ) : appeals?.length ? (
              <div className="space-y-4">
                {appeals.map((a) => {
                  const status = appealStatusMeta(a.status);
                  const decision = appealDecisionMeta(a.decision);
                  const isOpen = expanded === a.id;
                  return (
                    <Card key={a.id}>
                      <CardContent className="pt-6 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-medium">{a.appeal_reference}</span>
                            <Badge variant="outline" className={status.className}>{status.label}</Badge>
                            {decision && <Badge variant="outline" className={decision.className}>{decision.label}</Badge>}
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => setExpanded(isOpen ? null : a.id)}>
                            {isOpen ? 'Hide details' : 'View details'}
                          </Button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3 text-sm">
                          <div><p className="text-xs text-muted-foreground">Lodged</p><p>{formatAppealDate(a.filed_at)}</p></div>
                          <div><p className="text-xs text-muted-foreground">Hearing</p><p>{formatAppealDate(a.hearing_date)}</p></div>
                          <div><p className="text-xs text-muted-foreground">Decided</p><p>{formatAppealDate(a.decided_at)}</p></div>
                        </div>
                        {isOpen && (
                          <>
                            <Separator />
                            <div className="space-y-3 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground">Grounds of appeal</p>
                                <p className="whitespace-pre-wrap">{a.grounds}</p>
                              </div>
                              {a.relief_sought && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Outcome sought</p>
                                  <p className="whitespace-pre-wrap">{a.relief_sought}</p>
                                </div>
                              )}
                              {a.decision_rationale && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Decision rationale</p>
                                  <p className="whitespace-pre-wrap">{a.decision_rationale}</p>
                                </div>
                              )}
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-2">History</p>
                                <AppealTimeline appealId={a.id} />
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/applications/${a.application_id}`)}
                              >
                                Open related application
                              </Button>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : null}
          </>
        )}

        {lodgeFor && (
          <LodgeAppealDialog
            open={!!lodgeFor}
            onOpenChange={(o) => { if (!o) setLodgeFor(null); }}
            applicationId={lodgeFor.id}
            applicationNumber={lodgeFor.application_number}
            regulatorId={lodgeFor.regulator_id}
            deadline={appealDeadlineFor(lodgeFor.rejected_at || lodgeFor.updated_at)}
            onLodged={() => setLodgeFor(null)}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
