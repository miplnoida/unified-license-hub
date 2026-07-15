import { cn } from '@/lib/utils';

export type ViewMode = 'markup' | 'final' | 'original';

interface Props {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}

const OPTIONS: { value: ViewMode; label: string; hint: string }[] = [
  { value: 'markup', label: 'Markup', hint: 'Show all tracked changes and comments' },
  { value: 'final', label: 'Final', hint: 'Preview with pending suggestions applied' },
  { value: 'original', label: 'Original', hint: 'Raw narrative without markup' },
];

export function ViewModeToggle({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded-md border bg-muted/40 p-0.5 text-xs">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          title={opt.hint}
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-2.5 py-1 rounded-sm transition-colors',
            value === opt.value
              ? 'bg-background text-foreground shadow-sm font-medium'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
