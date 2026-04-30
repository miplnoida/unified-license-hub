import { Badge } from '@/components/ui/badge';
import { GitBranch } from 'lucide-react';
import { useFormVersion, useLatestPublishedVersion } from '@/hooks/useFormTemplates';

interface VersionInfoBadgeProps {
  templateId?: string | null;
  versionId?: string | null;
  /** Show "(latest)" / "(outdated)" suffix relative to the latest published version */
  showLatestComparison?: boolean;
  size?: 'xs' | 'sm';
}

/**
 * Shows the form version a submission was filed on. If `templateId` is provided
 * and `showLatestComparison` is true, also indicates whether it's the latest.
 */
export function VersionInfoBadge({ templateId, versionId, showLatestComparison, size = 'xs' }: VersionInfoBadgeProps) {
  const { data: version } = useFormVersion(versionId || null);
  const { data: latest } = useLatestPublishedVersion(showLatestComparison && templateId ? templateId : null);

  if (!versionId) {
    return (
      <Badge variant="outline" className={size === 'xs' ? 'text-[10px]' : 'text-xs'}>
        <GitBranch className="h-3 w-3 mr-1" /> v?
      </Badge>
    );
  }

  const label = (version as any)?.semantic_version || `${(version as any)?.version ?? '?'}`;
  const isLatest = latest && latest.id === versionId;
  const variant = isLatest ? 'outline' : showLatestComparison ? 'pending' : 'outline';

  return (
    <Badge variant={variant as any} className={size === 'xs' ? 'text-[10px]' : 'text-xs'}>
      <GitBranch className="h-3 w-3 mr-1" /> v{label}
      {showLatestComparison && latest && !isLatest && <span className="ml-1">• outdated</span>}
      {showLatestComparison && isLatest && <span className="ml-1">• latest</span>}
    </Badge>
  );
}
