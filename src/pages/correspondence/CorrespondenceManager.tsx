import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { ThreadList } from '@/components/correspondence/ThreadList';
import { ThreadDetail } from '@/components/correspondence/ThreadDetail';
import {
  useCorrespondenceThreads,
  useMarkThreadRead,
  type ThreadFilters,
} from '@/hooks/useCorrespondence';

export default function CorrespondenceManager() {
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<ThreadFilters>({ query: '', threadType: 'all', threadState: 'all' });
  const { data: threads = [], isLoading } = useCorrespondenceThreads(filters);
  const selectedId = params.get('thread') ?? undefined;
  const markRead = useMarkThreadRead(selectedId);

  const sorted = useMemo(
    () => [...threads].sort((a, b) =>
      new Date(b.last_message_at ?? b.received_at).getTime() - new Date(a.last_message_at ?? a.received_at).getTime()),
    [threads],
  );

  useEffect(() => {
    if (!selectedId && sorted.length > 0) {
      setParams({ thread: sorted[0].id }, { replace: true });
    }
  }, [selectedId, sorted, setParams]);

  useEffect(() => {
    if (selectedId) markRead.mutate(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          title="Communication Thread Manager"
          description="Every regulator-entity conversation in one auditable place — threads, internal notes, delivery status and read receipts."
        />
        <Card className="overflow-hidden">
          <div className="grid lg:grid-cols-[360px_1fr] divide-y lg:divide-y-0 lg:divide-x min-h-[70vh]">
            <div className="lg:h-[75vh]">
              <ThreadList
                threads={sorted}
                isLoading={isLoading}
                selectedId={selectedId}
                onSelect={(id) => setParams({ thread: id })}
                filters={filters}
                onFiltersChange={setFilters}
              />
            </div>
            <div className="lg:h-[75vh]">
              <ThreadDetail threadId={selectedId} />
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
