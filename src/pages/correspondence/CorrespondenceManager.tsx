import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ThreadList } from '@/components/correspondence/ThreadList';
import { IntakeForm } from '@/components/correspondence/IntakeForm';
import { ThreadDetail } from '@/components/correspondence/ThreadDetail';
import { useIsInternal } from '@/hooks/useUserPermissions';
import {
  useInternalOfficers,
  useMarkThreadRead,
  useThreadFeed,
  type ThreadFeedFilters,
} from '@/hooks/useCorrespondence';

const PAGE_SIZE = 50;

export default function CorrespondenceManager() {
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<ThreadFeedFilters>({ query: '', status: 'all', module: 'all', direction: 'all', thread_type: 'all' });
  const [page, setPage] = useState(0);
  const isInternal = useIsInternal();
  const { data, isLoading } = useThreadFeed(filters, page, PAGE_SIZE);
  const { data: officers = [] } = useInternalOfficers();
  const selectedId = params.get('thread') ?? undefined;
  const markRead = useMarkThreadRead(selectedId);

  const threads = useMemo(() => data?.rows ?? [], [data]);

  useEffect(() => { setPage(0); }, [filters]);

  useEffect(() => {
    if (!selectedId && threads.length > 0) {
      setParams({ thread: threads[0].id }, { replace: true });
    }
  }, [selectedId, threads, setParams]);

  useEffect(() => {
    if (selectedId) markRead.mutate(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const hasMore = (data?.page_count ?? 0) === PAGE_SIZE;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          title="Communication Thread Manager"
          description="Every regulator-entity conversation in one auditable place — linked cases, internal notes, response deadlines and delivery status."
          actions={<IntakeForm />}
        />

        <Card className="overflow-hidden">
          <div className="grid lg:grid-cols-[380px_1fr] divide-y lg:divide-y-0 lg:divide-x min-h-[70vh]">
            <div className="lg:h-[75vh] flex flex-col">
              <ThreadList
                threads={threads}
                isLoading={isLoading}
                selectedId={selectedId}
                onSelect={(id) => setParams({ thread: id })}
                filters={filters}
                onFiltersChange={setFilters}
                canFilterAssignee={isInternal && (data?.can_filter_assignee ?? false)}
                officers={officers.map((o) => ({ id: o.id, full_name: o.full_name }))}
                total={data?.total}
              />
              {(page > 0 || hasMore) && (
                <div className="flex items-center justify-between border-t p-2">
                  <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">Page {page + 1}</span>
                  <Button size="sm" variant="ghost" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              )}
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
