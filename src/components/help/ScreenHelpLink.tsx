/**
 * Canonical contextual-help affordance.
 *
 * The ONLY component allowed to link into the in-app User Manual. Screens pass
 * a `surface` key from `src/content/user-manual/helpLinks.ts`; anchors and the
 * manual route live in that registry, never in feature code.
 *
 * Documentation only — renders no regulatory data and takes no action.
 */
import { Link } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { INTERNAL_ROLES } from '@/types/platform';
import { HELP_LINK_BY_SURFACE, manualHref } from '@/content/user-manual/helpLinks';

interface ScreenHelpLinkProps {
  /** Key registered in HELP_LINKS. */
  surface: string;
  /** Override the anchor for a sub-surface (e.g. a specific Entity 360 section). */
  anchor?: string;
  /** Override the visible label. */
  label?: string;
  variant?: 'button' | 'icon' | 'inline';
  className?: string;
}

export function ScreenHelpLink({ surface, anchor, label, variant = 'button', className }: ScreenHelpLinkProps) {
  const { user } = useAuth();
  const target = HELP_LINK_BY_SURFACE[surface];
  if (!target) return null;

  const isInternal = !!user && INTERNAL_ROLES.includes(user.role);
  // Documentation visibility mirrors the manual itself: internal-only guidance
  // is never surfaced to external portal users.
  if (target.audience === 'internal' && !isInternal) return null;

  const text = label ?? target.label;
  const href = manualHref(anchor ?? target.anchor);
  const labelClass = variant === 'button' ? 'ml-2 hidden sm:inline' : 'sr-only';

  if (variant === 'inline') {
    return (
      <Link to={href} className={`text-sm text-primary underline-offset-4 hover:underline ${className ?? ''}`}>
        {text}
      </Link>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          asChild
          variant="ghost"
          size={variant === 'icon' ? 'icon' : 'sm'}
          className={`print:hidden ${className ?? ''}`}
          aria-label={text}
        >
          <Link to={href}>
            <HelpCircle className="h-4 w-4" />
            <span className={labelClass}>{text}</span>
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{target.hint}</TooltipContent>
    </Tooltip>
  );
}

export default ScreenHelpLink;
