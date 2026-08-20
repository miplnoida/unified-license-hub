/**
 * RDM-ENTITY-001 Wave C — §20 pending-authority screen.
 *
 * Shown when membership authority has been requested but not yet approved.
 * The intended application/form-package is retained (sessionStorage, via
 * applicationIntent.ts) so the journey resumes automatically once a
 * regulator officer approves the membership and the user returns here.
 */
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock3, Loader2, RefreshCcw } from 'lucide-react';
import type { ApplicationIntent } from '@/lib/applicationIntent';

export function PendingAuthorityScreen({
  entityDisplayName,
  intent,
  onRefresh,
  isRefreshing,
}: {
  entityDisplayName?: string | null;
  intent: ApplicationIntent | null;
  onRefresh: () => void;
  isRefreshing?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock3 className="h-4 w-4" /> Awaiting authority approval
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Clock3 className="h-4 w-4" />
          <AlertTitle>Your access request is pending review</AlertTitle>
          <AlertDescription>
            {entityDisplayName ? (
              <>A regulator officer is verifying your authority to act for <strong>{entityDisplayName}</strong>. </>
            ) : (
              <>A regulator officer is verifying your authority to act for this entity. </>
            )}
            You will be able to continue as soon as it is approved — nothing further is required from you right now.
          </AlertDescription>
        </Alert>

        {intent?.label && (
          <p className="text-sm text-muted-foreground">
            We&apos;ve kept your place: <strong>{intent.label}</strong> will resume automatically once your access is approved.
          </p>
        )}

        <Button variant="outline" onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />}
          Check status
        </Button>
      </CardContent>
    </Card>
  );
}
