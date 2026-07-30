import { useLicenseAppealEvents } from '@/hooks/useLicenseAppeals';
import { formatAppealDateTime } from '@/lib/licenseAppeals';
import { Loader2 } from 'lucide-react';

/** Plain-English history of everything that has happened on an appeal. */
export function AppealTimeline({ appealId }: { appealId: string }) {
  const { data: events, isLoading } = useLicenseAppealEvents(appealId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
      </div>
    );
  }

  if (!events?.length) {
    return <p className="text-sm text-muted-foreground py-2">No activity recorded yet.</p>;
  }

  return (
    <ol className="relative border-l border-border pl-4 space-y-4">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
          <p className="text-sm font-medium">{e.description}</p>
          <p className="text-xs text-muted-foreground">{formatAppealDateTime(e.created_at)}</p>
        </li>
      ))}
    </ol>
  );
}
