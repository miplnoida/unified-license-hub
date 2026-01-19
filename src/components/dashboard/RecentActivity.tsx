import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  MessageSquare,
  ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';

interface Activity {
  id: string;
  type: 'application_submitted' | 'application_approved' | 'application_rejected' | 'return_submitted' | 'return_overdue' | 'query_raised';
  title: string;
  description: string;
  timestamp: string;
  reference?: string;
}

const mockActivities: Activity[] = [
  {
    id: '1',
    type: 'application_approved',
    title: 'Application Approved',
    description: 'Your pre-license application has been approved',
    timestamp: '2024-01-15T10:30:00Z',
    reference: 'APP-2024-001',
  },
  {
    id: '2',
    type: 'query_raised',
    title: 'Query Raised',
    description: 'Additional documents required for your application',
    timestamp: '2024-01-14T15:45:00Z',
    reference: 'APP-2024-002',
  },
  {
    id: '3',
    type: 'return_overdue',
    title: 'Return Overdue',
    description: 'Monthly return for December is overdue',
    timestamp: '2024-01-13T09:00:00Z',
    reference: 'RET-2024-012',
  },
  {
    id: '4',
    type: 'application_submitted',
    title: 'Application Submitted',
    description: 'Post-license service application submitted',
    timestamp: '2024-01-12T14:20:00Z',
    reference: 'APP-2024-003',
  },
  {
    id: '5',
    type: 'return_submitted',
    title: 'Return Accepted',
    description: 'Quarterly return has been accepted',
    timestamp: '2024-01-10T11:15:00Z',
    reference: 'RET-2024-Q4',
  },
];

const activityIcons = {
  application_submitted: <FileText className="h-4 w-4" />,
  application_approved: <CheckCircle className="h-4 w-4" />,
  application_rejected: <XCircle className="h-4 w-4" />,
  return_submitted: <CheckCircle className="h-4 w-4" />,
  return_overdue: <AlertTriangle className="h-4 w-4" />,
  query_raised: <MessageSquare className="h-4 w-4" />,
};

const activityColors = {
  application_submitted: 'bg-info/10 text-info',
  application_approved: 'bg-success/10 text-success',
  application_rejected: 'bg-destructive/10 text-destructive',
  return_submitted: 'bg-success/10 text-success',
  return_overdue: 'bg-destructive/10 text-destructive',
  query_raised: 'bg-warning/10 text-warning',
};

export function RecentActivity() {
  return (
    <div className="card-elevated">
      <div className="flex items-center justify-between p-5 border-b">
        <h3 className="text-lg font-semibold">Recent Activity</h3>
        <button className="flex items-center gap-1 text-sm text-primary hover:underline">
          View all
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <div className="divide-y">
        {mockActivities.map((activity) => (
          <div key={activity.id} className="flex items-start gap-4 p-5">
            <div className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full',
              activityColors[activity.type]
            )}>
              {activityIcons[activity.type]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{activity.title}</p>
                  <p className="text-sm text-muted-foreground">{activity.description}</p>
                </div>
                {activity.reference && (
                  <Badge variant="outline" className="shrink-0">
                    {activity.reference}
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(activity.timestamp), 'MMM d, yyyy · h:mm a')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
