import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

/**
 * Tag entry for list-style fields. The parent still persists the value in the
 * exact format the backend expects — this component only changes the input UX.
 */
export function ChipsInput({
  value,
  onChange,
  placeholder,
  disabled,
  id,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const parts = draft
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .filter(s => !value.includes(s));
    if (parts.length) onChange([...value, ...parts]);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(v => (
            <Badge key={v} variant="secondary" className="gap-1">
              {v}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${v}`}
                  className="rounded-full hover:text-destructive"
                  onClick={() => onChange(value.filter(x => x !== v))}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
      {!disabled && (
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
        />
      )}
    </div>
  );
}

export default ChipsInput;
