import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Fingerprint, Sparkles } from 'lucide-react';
import type { MatchedField } from '@/pages/complaints/duplicates/types';

export function MatchedFieldsList({ matched }: { matched: MatchedField[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {matched.map((m, i) => {
        const Icon = m.strength === 'exact' ? CheckCircle2 : m.strength === 'fuzzy' ? Fingerprint : Sparkles;
        return (
          <Badge
            key={i}
            variant="outline"
            className="gap-1 font-normal bg-white text-slate-900 border-slate-200 hover:bg-white"
            title={m.detail}
          >
            <Icon className="h-3 w-3 text-slate-700" />
            <span className="font-medium">{m.field}</span>
            <span className="text-slate-600">· {m.detail}</span>
          </Badge>
        );
      })}
    </div>
  );
}
