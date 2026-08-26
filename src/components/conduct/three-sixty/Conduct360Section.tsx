/**
 * MC-07.3 — Conduct 360 section shell: heading, classification tag, the
 * server's own source line, and a calm empty state.
 */
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ClassificationChip, type Classification } from './ClassificationLegend';

interface Props {
  title: string;
  description?: string;
  classification?: Classification;
  source?: string | null;
  isEmpty?: boolean;
  emptyMessage?: string;
  children?: ReactNode;
  actions?: ReactNode;
}

export function Conduct360Section({
  title,
  description,
  classification = 'FACT',
  source,
  isEmpty = false,
  emptyMessage = 'Nothing recorded for this window.',
  children,
  actions,
}: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">{title}</h2>
              <ClassificationChip type={classification} />
            </div>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
          {actions}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEmpty ? (
          <p className="text-sm text-muted-foreground py-2">{emptyMessage}</p>
        ) : (
          children
        )}
        {source && (
          <p className="text-xs text-muted-foreground border-t pt-3">Source: {source}</p>
        )}
      </CardContent>
    </Card>
  );
}
