/**
 * Business-facing definition list.
 *
 * Used instead of a dynamic key/value table wherever an entity domain has a
 * known set of attributes. Structured values are rendered as chips or nested
 * rows by the caller — this component never stringifies an object.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { EMPTY } from '@/lib/presentation/format';

export interface DefinitionItem {
  label: string;
  value: ReactNode;
  /** Optional muted helper under the value. */
  hint?: string;
  /** Hide the row entirely when the value is absent. */
  hideWhenEmpty?: boolean;
  span?: 1 | 2 | 3;
}

export function DefinitionList({
  items, columns = 3, className,
}: { items: DefinitionItem[]; columns?: 1 | 2 | 3; className?: string }) {
  const visible = items.filter((i) => !(i.hideWhenEmpty && (i.value === null || i.value === undefined || i.value === '' || i.value === EMPTY)));
  if (visible.length === 0) return null;

  return (
    <dl
      className={cn(
        'grid gap-x-8 gap-y-3 text-sm',
        columns === 1 ? 'grid-cols-1' : columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {visible.map((item, i) => (
        <div
          key={`${item.label}-${i}`}
          className={cn(
            'flex flex-col gap-0.5 border-b border-border/60 pb-2',
            item.span === 2 && 'sm:col-span-2',
            item.span === 3 && 'sm:col-span-2 lg:col-span-3',
          )}
        >
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</dt>
          <dd className="font-medium text-foreground">{item.value ?? EMPTY}</dd>
          {item.hint && <p className="text-xs text-muted-foreground">{item.hint}</p>}
        </div>
      ))}
    </dl>
  );
}

export default DefinitionList;
