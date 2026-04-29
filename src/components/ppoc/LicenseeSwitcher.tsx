import { Badge } from '@/components/ui/badge';
import { Building2 } from 'lucide-react';
import { usePpoc } from '@/contexts/PpocContext';

/**
 * Header banner shown when the current user is mapped as a PPOC for 2+
 * licensee entities. Lists every mapped entity name (no selection here —
 * entity is chosen at return-creation time).
 */
export function LicenseeSwitcher() {
  const { isPpoc, mappedLicensees } = usePpoc();

  if (!isPpoc || mappedLicensees.length < 2) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2 border-b bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
      <Building2 className="h-4 w-4 text-amber-700 dark:text-amber-300" />
      <span className="text-xs sm:text-sm text-amber-900 dark:text-amber-200 font-medium">
        Acting as PPOC for:
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {mappedLicensees.map(l => (
          <Badge
            key={l.licensee_id}
            variant="outline"
            className="bg-background border-amber-400 text-amber-900 dark:text-amber-200 text-xs"
          >
            {l.licensee_name}
          </Badge>
        ))}
      </div>
      <Badge variant="secondary" className="text-xs hidden sm:inline-flex ml-auto">PPOC</Badge>
    </div>
  );
}
