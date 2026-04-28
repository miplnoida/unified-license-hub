import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Building2 } from 'lucide-react';
import { usePpoc } from '@/contexts/PpocContext';

/**
 * Header switcher shown only when the current user is mapped as a PPOC for
 * 2+ licensee entities. Lets them pick which licensee they are currently
 * acting on behalf of for return submissions.
 */
export function LicenseeSwitcher() {
  const { isPpoc, mappedLicensees, activeLicenseeId, setActiveLicenseeId } = usePpoc();

  if (!isPpoc || mappedLicensees.length < 2) return null;

  return (
    <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
      <Building2 className="h-4 w-4 text-amber-700 dark:text-amber-300" />
      <span className="text-xs sm:text-sm text-amber-900 dark:text-amber-200 font-medium">
        Acting as PPOC for:
      </span>
      <Select value={activeLicenseeId || ''} onValueChange={(v) => setActiveLicenseeId(v)}>
        <SelectTrigger className="w-[260px] h-8 text-sm bg-background">
          <SelectValue placeholder="Select licensee..." />
        </SelectTrigger>
        <SelectContent>
          {mappedLicensees.map(l => (
            <SelectItem key={l.licensee_id} value={l.licensee_id}>
              {l.licensee_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Badge variant="secondary" className="text-xs hidden sm:inline-flex">PPOC</Badge>
    </div>
  );
}
