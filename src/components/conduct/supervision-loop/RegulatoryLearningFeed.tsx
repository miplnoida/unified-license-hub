import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GraduationCap, Loader2, ExternalLink } from 'lucide-react';
import { fmtDate, type LearningItem } from '@/lib/conduct/supervisionLoop';

export function RegulatoryLearningFeed({ items, isLoading }: { items: LearningItem[]; isLoading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-primary" /> Regulatory Learning
          <Badge variant="outline" className="ml-1">{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No regulatory learning recorded yet from closed thematic reviews or investigations.
          </p>
        ) : (
          <ScrollArea className="h-[420px] pr-3">
            <ol className="space-y-3">
              {items.map((l) => (
                <li key={`${l.source}-${l.id}`} className="rounded-md border border-border p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">
                      {l.source === 'thematic_review' ? 'Thematic review' : 'Investigation'}
                    </Badge>
                    {l.ref && <span className="text-xs font-mono">{l.ref}</span>}
                    <span className="text-xs text-muted-foreground">{fmtDate(l.occurred_at)}</span>
                    <Button variant="ghost" size="sm" className="ml-auto" asChild>
                      <Link to={l.href}><ExternalLink className="h-3.5 w-3.5" /></Link>
                    </Button>
                  </div>
                  <div className="text-sm font-medium mt-1">{l.title}</div>
                  <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{l.learning}</p>
                </li>
              ))}
            </ol>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
