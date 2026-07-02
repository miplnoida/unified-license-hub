import { EntityTimeline } from '@/components/shared/EntityTimeline';

/**
 * Application-scoped activity trail. Thin wrapper around the unified
 * `<EntityTimeline>` primitive — kept as a named component for existing
 * consumers.
 */
export function ActivityTab({ applicationId }: { applicationId: string }) {
  return (
    <EntityTimeline
      entityType="application"
      entityId={applicationId}
      metadataKeys={['application_id']}
    />
  );
}
