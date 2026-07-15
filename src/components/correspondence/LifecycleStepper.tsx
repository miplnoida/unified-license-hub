import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CorrespondenceStatus } from '@/pages/correspondence/types';

const STEPS: { key: CorrespondenceStatus; label: string }[] = [
  { key: 'received', label: 'Received' },
  { key: 'classified', label: 'Classified' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_review', label: 'Under Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'responded', label: 'Responded' },
  { key: 'closed', label: 'Closed' },
];

export function LifecycleStepper({ status }: { status: CorrespondenceStatus }) {
  const currentIdx = STEPS.findIndex((s) => s.key === status);
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2">
      {STEPS.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s.key} className="flex items-center gap-1 shrink-0">
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs border',
                done && 'bg-primary/10 border-primary/30 text-primary',
                active && 'bg-primary text-primary-foreground border-primary shadow-sm',
                !done && !active && 'bg-muted/40 border-border text-muted-foreground',
              )}
            >
              {done ? <Check className="h-3 w-3" /> : <Circle className={cn('h-3 w-3', active && 'fill-current')} />}
              <span className="font-medium">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={cn('h-px w-4', done ? 'bg-primary/40' : 'bg-border')} />}
          </div>
        );
      })}
    </div>
  );
}
