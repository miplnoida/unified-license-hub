import { CheckCircle2, Circle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { APPLICATION_STATUS_LABELS, APPLICATION_STATUS_FLOW, ApplicationStatus } from '@/types/platform';

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

const statusIcons: Record<string, React.ReactNode> = {
  draft: <Circle className="h-4 w-4" />,
  submitted: <Clock className="h-4 w-4" />,
  scrutiny: <Clock className="h-4 w-4" />,
  query_raised: <AlertCircle className="h-4 w-4" />,
  resubmitted: <Clock className="h-4 w-4" />,
  technical_review: <Clock className="h-4 w-4" />,
  pending_approval: <Clock className="h-4 w-4" />,
  approved: <CheckCircle2 className="h-4 w-4" />,
  rejected: <XCircle className="h-4 w-4" />,
  license_issued: <CheckCircle2 className="h-4 w-4" />,
};

export function StatusTimeline({ currentStatus, events }: Props) {
  const currentIdx = APPLICATION_STATUS_FLOW.indexOf(currentStatus);
  const mainStages = APPLICATION_STATUS_FLOW.filter(s => s !== 'query_raised' && s !== 'resubmitted');

  return (
    <div className="space-y-6">
      {/* Visual pipeline */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {mainStages.map((stage, i) => {
          const stageIdx = APPLICATION_STATUS_FLOW.indexOf(stage);
          const isCurrent = stage === currentStatus;
          const isPast = stageIdx < currentIdx && currentStatus !== 'rejected';
          const isRejected = currentStatus === 'rejected';
          
          return (
            <div key={stage} className="flex items-center">
              {i > 0 && (
                <div className={`w-6 md:w-10 h-0.5 transition-colors ${
                  isPast ? 'bg-primary' : isRejected && stageIdx <= currentIdx ? 'bg-destructive' : 'bg-border'
                }`} />
              )}
              <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors ${
                isCurrent && !isRejected
                  ? 'bg-primary text-primary-foreground'
                  : isCurrent && isRejected
                  ? 'bg-destructive text-destructive-foreground'
                  : isPast
                  ? 'bg-primary/15 text-primary'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {statusIcons[stage] || <Circle className="h-3 w-3" />}
                <span className="hidden md:inline">{APPLICATION_STATUS_LABELS[stage]}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Event history */}
      {events.length > 0 && (
        <div className="relative">
          <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />
          <div className="space-y-4">
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
      )}
    </div>
  );
}
