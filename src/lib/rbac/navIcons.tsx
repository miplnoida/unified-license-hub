import React from 'react';
import * as LucideIcons from 'lucide-react';

const FALLBACK = LucideIcons.Circle;

/**
 * Resolve a database-stored icon key (Lucide component name, e.g.
 * `LayoutDashboard`) into a rendered icon element. Unknown keys degrade to a
 * neutral dot instead of throwing, so admins can add nav items freely.
 */
export function renderNavIcon(iconKey: string | null | undefined, className = 'h-4 w-4 shrink-0'): React.ReactNode {
  const key = (iconKey || '').trim();
  const candidate = key ? (LucideIcons as unknown as Record<string, unknown>)[key] : undefined;
  // Lucide icons are `forwardRef` objects, not plain functions — accept both
  // shapes, otherwise every DB-driven icon silently degrades to the fallback.
  const isComponent =
    typeof candidate === 'function'
    || (typeof candidate === 'object' && candidate !== null && '$$typeof' in candidate);
  const Icon = (isComponent ? candidate : FALLBACK) as React.ComponentType<{ className?: string }>;
  return <Icon className={className} />;
}
