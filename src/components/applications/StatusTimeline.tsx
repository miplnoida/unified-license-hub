import { APPLICATION_STATUS_LABELS, APPLICATION_STATUS_FLOW, ApplicationStatus } from '@/types/platform';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, XCircle, Clock, Loader2 } from 'lucide-react';

interface TimelineEvent {
  id: string;
  status: string;
  action: string;
  actor_email?: string;
  comments?: string | null;
  created_at: string;
}

interface Props {
  currentStatus: ApplicationStatus;
  events: TimelineEvent[];
}

const statusConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  draft: { icon: <Circle className="h-4 w-4" />, color: 'text-muted-foreground' },
  submitted: { icon: <Clock className="h-4 w-4" />, color: 'text-primary' },
  in_progress: { icon: <Loader2 className="h-4 w-4" />, color: 'text-warning' },
  approved: { icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-success' },
  rejected: { icon: <XCircle className="h-4 w-4" />, color: 'text-destructive' },
};

export function StatusTimeline({ currentStatus, events }: Props) {
  const isRejected = currentStatus === 'rejected';
  const currentIdx = APPLICATION_STATUS_FLOW.indexOf(currentStatus);
  // Progress: draft=0, submitted=33, in_progress=66, approved=100
  const progressValue = isRejected ? 100 : currentIdx >= 0 ? (currentIdx / (APPLICATION_STATUS_FLOW.length - 1)) * 100 : 0;

  const config = statusConfig[currentStatus] || statusConfig.draft;

  return (
    <div className="space-y-4">
      {/* Simple progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={config.color}>{config.icon}</span>
            <span className="text-sm font-semibold">
              {APPLICATION_STATUS_LABELS[currentStatus] || currentStatus}
            </span>
          </div>
          {!isRejected && (
            <span className="text-xs text-muted-foreground">
              Step {Math.max(currentIdx + 1, 1)} of {APPLICATION_STATUS_FLOW.length}
            </span>
          )}
        </div>
        <Progress
          value={progressValue}
          className={`h-2 ${isRejected ? '[&>div]:bg-destructive' : ''}`}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          {APPLICATION_STATUS_FLOW.map((s, i) => (
            <span key={s} className={currentStatus === s ? 'font-semibold text-foreground' : isRejected ? 'line-through' : ''}>
              {APPLICATION_STATUS_LABELS[s]}
            </span>
          ))}
          {isRejected && <span className="font-semibold text-destructive">Rejected</span>}
        </div>
      </div>

      {/* Activity log */}
      {events.length > 0 && (
        <div className="border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Activity Log</p>
          <div className="relative">
            <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />
            <div className="space-y-3">
              {events.map((event) => (
                <div key={event.id} className="relative flex gap-3 pl-8">
                  <div className="absolute left-1.5 top-1 w-3 h-3 rounded-full border-2 border-primary bg-background" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium capitalize">
                        {event.action.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.created_at).toLocaleString()}
                      </span>
                    </div>
                    {event.actor_email && (
                      <p className="text-xs text-muted-foreground mt-0.5">by {event.actor_email}</p>
                    )}
                    {event.comments && (
                      <p className="text-sm text-muted-foreground mt-1 italic border-l-2 border-muted pl-2">
                        {event.comments}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
