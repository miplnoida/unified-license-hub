import { Badge } from '@/components/ui/badge';
import { Building2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePpoc } from '@/contexts/PpocContext';

/**
 * Header banner shown when the current user is mapped as a PPOC for one or
 * more licensee entities. PPOC users select the active licensee here; the
 * selection is persisted in session and used as the default entity context
 * across all PPOC operations (returns, filings, etc.).
 */
export function LicenseeSwitcher() {
  const { isPpoc, mappedLicensees, activeLicenseeId, setActiveLicenseeId } = usePpoc();

  if (!isPpoc || mappedLicensees.length === 0) return null;

  // Single mapping: just show a static badge — nothing to switch.
  if (mappedLicensees.length === 1) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2 border-b bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
        <Building2 className="h-4 w-4 text-amber-700 dark:text-amber-300" />
        <span className="text-xs sm:text-sm text-amber-900 dark:text-amber-200 font-medium">
          Acting as PPOC for:
        </span>
        <Badge
          variant="outline"
          className="bg-background border-amber-400 text-amber-900 dark:text-amber-200 text-xs"
        >
          {mappedLicensees[0].licensee_name}
        </Badge>
        <Badge variant="secondary" className="text-xs hidden sm:inline-flex ml-auto">PPOC</Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2 border-b bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
      <Building2 className="h-4 w-4 text-amber-700 dark:text-amber-300" />
      <span className="text-xs sm:text-sm text-amber-900 dark:text-amber-200 font-medium">
        Acting as PPOC for:
      </span>
      <Select
        value={activeLicenseeId || ''}
        onValueChange={(v) => setActiveLicenseeId(v)}
      >
        <SelectTrigger className="h-8 w-[260px] bg-background border-amber-400 text-amber-900 dark:text-amber-200 text-xs">
          <SelectValue placeholder="Select licensee" />
        </SelectTrigger>
        <SelectContent>
          {mappedLicensees.map(l => (
            <SelectItem key={l.licensee_id} value={l.licensee_id}>
              {l.licensee_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Badge variant="secondary" className="text-xs hidden sm:inline-flex ml-auto">PPOC</Badge>
    </div>
  );
}
