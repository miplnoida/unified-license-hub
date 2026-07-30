import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Gavel, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLicenseAppeals } from '@/hooks/useLicenseAppeals';
import { appealDecisionMeta, appealStatusMeta, formatAppealDate } from '@/lib/licenseAppeals';
import { AppealTimeline } from '@/components/appeals/AppealTimeline';

/** Applicant-facing list of appeals they have lodged, with live status and history. */
export default function MyAppeals() {
  const navigate = useNavigate();
  const { data: appeals, isLoading } = useLicenseAppeals();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="My Appeals"
          description="Appeals you have lodged against licensing decisions, and how they are progressing."
        />

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading appeals…
          </div>
        ) : !appeals?.length ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <Gavel className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                You have not lodged any appeals. If an application is refused, you can appeal from the
                application page within 30 days of the decision.
              </p>
              <Button variant="outline" size="sm" onClick={() => navigate('/applications')}>
                View my applications
              </Button>
            </CardContent>
          </Card>
        ) : (
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
        )}
      </div>
    </DashboardLayout>
  );
}
