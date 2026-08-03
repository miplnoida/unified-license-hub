import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Bold, Italic, List, ListOrdered, Underline } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minRows?: number;
}

const COMMANDS = [
  { cmd: 'bold', icon: Bold, label: 'Bold' },
  { cmd: 'italic', icon: Italic, label: 'Italic' },
  { cmd: 'underline', icon: Underline, label: 'Underline' },
  { cmd: 'insertUnorderedList', icon: List, label: 'Bulleted list' },
  { cmd: 'insertOrderedList', icon: ListOrdered, label: 'Numbered list' },
] as const;

/**
 * Controlled formatted-text editor. Only a fixed set of inline formatting
 * commands is exposed so message bodies stay within the sanitised subset
 * that the thread renderer and the PDF export both understand.
 */
export function RichTextComposer({
  value, onChange, placeholder, disabled, className, minRows = 4,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
  }, [value]);

  const run = (cmd: string) => {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(cmd, false);
    onChange(ref.current?.innerHTML ?? '');
  };

  return (
    <div className={cn('rounded-md border bg-background', disabled && 'opacity-60', className)}>
      <div className="flex items-center gap-1 border-b px-1 py-1">
        {COMMANDS.map(({ cmd, icon: Icon, label }) => (
          <Button
            key={cmd}
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            title={label}
            aria-label={label}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(cmd)}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        ))}
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder ?? 'Message body'}
        contentEditable={!disabled}
        data-placeholder={placeholder}
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
        }}
        className={cn(
          'prose-sm max-w-none px-3 py-2 text-sm outline-none',
          'empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground',
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
        )}
        style={{ minHeight: `${minRows * 1.5}rem` }}
      />
    </div>
  );
}

/** Strips markup for character counting and plain-text fallbacks. */
export function htmlToPlainText(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.textContent ?? '').replace(/\u00a0/g, ' ').trim();
}
