/**
 * Visual separation between public information and secure entity services.
 * Used across every logged-out licensee-facing surface so a visitor can always
 * tell whether content is public or requires sign-in.
 */
import { Lock, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { signInHref } from '@/lib/publicServices/catalogue';

export function PublicInfoBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary ${className}`}
    >
      <Globe className="h-3 w-3" /> Public information
    </span>
  );
}

export function SecureServiceBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 ${className}`}
    >
      <Lock className="h-3 w-3" /> Secure entity service — sign in required
    </span>
  );
}

/** Sign-in CTA that carries a safe relative redirect target. */
export function SignInCta({
  label,
  target,
  variant = 'default',
  size = 'default',
  className = '',
}: {
  label: string;
  target?: string | null;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}) {
  const navigate = useNavigate();
  return (
    <Button variant={variant} size={size} className={className} onClick={() => navigate(signInHref(target))}>
      <Lock className="mr-2 h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
