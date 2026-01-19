import { Return } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, ArrowRight, ClipboardList, AlertTriangle } from 'lucide-react';
import { format, isPast, differenceInDays } from 'date-fns';

interface ReturnCardProps {
  returnItem: Return;
  showActions?: boolean;
  onView?: () => void;
  onSubmit?: () => void;
}

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  draft: 'Draft',
  submitted: 'Submitted',
  accepted: 'Accepted',
  rejected: 'Rejected',
  overdue: 'Overdue',
};

const frequencyLabels: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

export function ReturnCard({
  returnItem,
  showActions = true,
  onView,
  onSubmit,
}: ReturnCardProps) {
  const dueDate = new Date(returnItem.dueDate);
  const isOverdue = isPast(dueDate) && returnItem.status !== 'submitted' && returnItem.status !== 'accepted';
  const daysUntilDue = differenceInDays(dueDate, new Date());
  const isDueSoon = daysUntilDue > 0 && daysUntilDue <= 7;

  const displayStatus = isOverdue ? 'overdue' : returnItem.status;

  return (
    <div className="card-elevated p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            isOverdue ? 'bg-destructive/10' : 'bg-secondary/10'
          }`}>
            {isOverdue ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <ClipboardList className="h-5 w-5 text-secondary" />
            )}
          </div>
          <div>
            <h4 className="font-semibold text-foreground">
              {returnItem.returnNumber}
            </h4>
            <p className="text-sm text-muted-foreground">
              {frequencyLabels[returnItem.frequency]} Return
            </p>
          </div>
        </div>
        <Badge variant={displayStatus as any}>
          {statusLabels[displayStatus]}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Period</p>
          <p className="font-medium">
            {format(new Date(returnItem.periodStart), 'MMM d')} - {format(new Date(returnItem.periodEnd), 'MMM d, yyyy')}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Due Date</p>
          <p className={`font-medium ${isOverdue ? 'text-destructive' : isDueSoon ? 'text-warning' : ''}`}>
            {format(dueDate, 'MMM d, yyyy')}
          </p>
        </div>
      </div>

      {(isOverdue || isDueSoon) && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
          isOverdue ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'
        }`}>
          <AlertTriangle className="h-4 w-4" />
          <span>
            {isOverdue
              ? `Overdue by ${Math.abs(daysUntilDue)} days`
              : `Due in ${daysUntilDue} days`}
          </span>
        </div>
      )}

      {showActions && (
        <div className="flex gap-2 pt-2 border-t">
          <Button variant="card-action" size="sm" className="flex-1" onClick={onView}>
            {returnItem.status === 'draft' ? 'Continue' : 'View'}
            <ArrowRight className="h-4 w-4" />
          </Button>
          {(returnItem.status === 'pending' || returnItem.status === 'draft') && (
            <Button 
              variant={isOverdue ? 'destructive' : 'default'} 
              size="sm" 
              onClick={onSubmit}
            >
              Submit
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
