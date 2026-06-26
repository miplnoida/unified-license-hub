import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { CheckCircle2, ArrowRight, Download, LayoutDashboard } from 'lucide-react';

interface Props {
  title?: string;
  message?: string;
  referenceNumber: string;
  submittedAt?: string | Date | null;
  status?: string | null;
  nextStep?: string | null;
  /** Route for "Track Application". When omitted the track button is hidden. */
  trackHref?: string | null;
  /** Route for "Return to Dashboard". Defaults to /. */
  dashboardHref?: string;
  /**
   * Optional download handler. When omitted we fall back to `window.print()`
   * so the user can still keep a copy even if no backend endpoint exists.
   */
  onDownload?: () => void;
}

/**
 * Shared submission acknowledgement panel. Display-only; does not perform
 * any submit/network work — callers stay in charge of submission.
 */
export function SubmissionAcknowledgement({
  title = 'Submission Received',
  message = 'Your submission has been recorded successfully.',
  referenceNumber,
  submittedAt,
  status,
  nextStep,
  trackHref,
  dashboardHref = '/',
  onDownload,
}: Props) {
  const submittedLabel =
    submittedAt
      ? new Date(submittedAt).toLocaleString()
      : new Date().toLocaleString();

  const handleDownload = () => {
    if (onDownload) onDownload();
    else if (typeof window !== 'undefined') window.print();
  };

  return (
    <Card className="w-full max-w-xl mx-auto animate-slide-up">
      <CardContent className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/50 border p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Reference</p>
            <p className="text-base font-bold font-mono text-primary mt-0.5 break-all">{referenceNumber}</p>
          </div>
          <div className="rounded-lg bg-muted/50 border p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Submitted</p>
            <p className="text-sm font-medium mt-0.5">{submittedLabel}</p>
          </div>
          {status && (
            <div className="rounded-lg bg-muted/50 border p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Current Status</p>
              <Badge variant="outline" className="mt-1">{status}</Badge>
            </div>
          )}
          {nextStep && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Expected Next Step</p>
              <p className="text-sm font-medium mt-0.5">{nextStep}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <Button asChild className="flex-1">
            <Link to={dashboardHref}>
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Return to Dashboard
            </Link>
          </Button>
          {trackHref && (
            <Button asChild variant="outline" className="flex-1">
              <Link to={trackHref}>
                Track Application
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          )}
          <Button variant="outline" className="flex-1" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
