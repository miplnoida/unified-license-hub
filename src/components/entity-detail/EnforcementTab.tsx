/**
 * EPR-03 — entity enforcement tab.
 *
 * Now a read-only summary of the independent Enforcement process. All case
 * mutation moved to the enforcement case workspace's current step.
 */
import EntityEnforcementPanel from '@/components/enforcement/EntityEnforcementPanel';

export default function EnforcementTab({ entityId }: { entityId: string }) {
  return <EntityEnforcementPanel entityId={entityId} />;
}
