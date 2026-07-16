import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface QueryErrorStateProps {
  title?: string;
  message?: string;
  error?: unknown;
  onRetry?: () => void;
  compact?: boolean;
}

/**
 * Shared error state for failed complaint-module queries. Used across list,
 * detail, analytics, escalation, duplicate, evidence, and classification
 * surfaces. Never hide a failure as empty state — always render this instead.
 */
export function QueryErrorState({
  title = 'Failed to load',
  message,
  error,
  onRetry,
  compact = false,
}: QueryErrorStateProps) {
  const detail =
    message ??
    (error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'An unexpected error occurred while loading this section.');

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="truncate">{detail}</span>
        </div>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="flex flex-col items-start gap-3 p-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">{title}</span>
        </div>
        <p className="text-sm text-muted-foreground">{detail}</p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default QueryErrorState;
