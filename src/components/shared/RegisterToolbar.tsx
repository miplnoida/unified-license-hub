/**
 * Compact enterprise listing toolbar: search | filters | trailing utilities.
 *
 * Presentation only — it owns no data and performs no action. Screens keep their
 * own state and pass filter controls as children so filters stay next to the
 * data they affect without consuming vertical space.
 */
import { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface RegisterToolbarProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Primary filter controls (Selects, toggles). */
  children?: ReactNode;
  /** Right-aligned utilities: refresh, export, secondary actions. */
  trailing?: ReactNode;
  className?: string;
}

export function RegisterToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  children,
  trailing,
  className,
}: RegisterToolbarProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
      {onSearchChange && (
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={search ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
      )}
      {children}
      {trailing ? <div className="ml-auto flex items-center gap-2">{trailing}</div> : null}
    </div>
  );
}
