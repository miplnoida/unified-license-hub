import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRegistrationApprovalStatus } from '@/hooks/useRegistrationApprovalStatus';
import { REGISTRATION_STATUS_MESSAGES } from '@/lib/registrationStatus';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, LogOut, RefreshCw, FileEdit, MailCheck } from 'lucide-react';

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function RegistrationStatusPage() {
  const { user, logout } = useAuth();
  const { loading, category, registration, isApproved } = useRegistrationApprovalStatus();
  const message = REGISTRATION_STATUS_MESSAGES[category];

  const variant: Record<typeof category, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    approved: 'default',
    pending: 'secondary',
    in_review: 'secondary',
    correction: 'outline',
    rejected: 'destructive',
    unverified: 'outline',
    missing: 'destructive',
  } as const;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{message.title}</CardTitle>
            <Badge variant={variant[category]} className="capitalize">
              {(registration?.status ?? category).replace(/_/g, ' ')}
            </Badge>
          </div>
          <CardDescription>Signed in as {user?.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking your registration status…
            </div>
          ) : (
            <>
              <p className="text-sm text-foreground">{message.description}</p>

              {registration && (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-1">
                  {registration.registration_reference && (
                    <div>
                      <span className="text-muted-foreground">Reference:</span>{' '}
                      <span className="font-mono">{registration.registration_reference}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Submitted:</span>{' '}
                    {formatDate(registration.created_at)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last update:</span>{' '}
                    {formatDate(registration.updated_at)}
                  </div>
                  {registration.remarks && (
                    <div className="pt-2">
                      <div className="text-muted-foreground">Reviewer remarks:</div>
                      <div className="mt-1 rounded bg-background border p-2 whitespace-pre-wrap">
                        {registration.remarks}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {category === 'correction' && (
                <Button asChild className="w-full">
                  {/* Resubmission must open the update portal so existing
                      registration data and uploaded documents are prefilled.
                      Never link to `/register` (blank new registration). */}
                  <Link to="/registration/portal">
                    <FileEdit className="h-4 w-4 mr-2" /> Update & Resubmit Registration
                  </Link>
                </Button>
              )}
              {category === 'unverified' && (
                <Button asChild variant="outline" className="w-full">
                  <Link to="/register">
                    <MailCheck className="h-4 w-4 mr-2" /> Continue Verification
                  </Link>
                </Button>
              )}
              {isApproved && (
                <Button asChild className="w-full">
                  <Link to="/dashboard">Go to Dashboard</Link>
                </Button>
              )}

              <div className="flex items-center justify-between gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={() => logout()}>
                  <LogOut className="h-4 w-4 mr-2" /> Sign Out
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
