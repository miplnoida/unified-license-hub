import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Fingerprint, Sparkles } from 'lucide-react';
import type { MatchedField } from '@/pages/complaints/duplicates/types';

export function MatchedFieldsList({ matched }: { matched: MatchedField[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {matched.map((m, i) => {
        const Icon = m.strength === 'exact' ? CheckCircle2 : m.strength === 'fuzzy' ? Fingerprint : Sparkles;
        return (
          <Badge key={i} variant="secondary" className="gap-1 font-normal" title={m.detail}>
            <Icon className="h-3 w-3" />
            <span className="font-medium">{m.field}</span>
            <span className="text-muted-foreground">· {m.detail}</span>
          </Badge>
        );
      })}
    </div>
  );
}
