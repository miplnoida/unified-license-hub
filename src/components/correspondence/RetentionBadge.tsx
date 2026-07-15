import { Archive } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';

export function RetentionBadge({ years, expiresAt }: { years: number; expiresAt: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="gap-1 font-normal">
          <Archive className="h-3 w-3" />
          Retain {years}y
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">
          Retention schedule: <strong>{years} years</strong>
          <br />
          Eligible for disposal on <strong>{format(new Date(expiresAt), 'PP')}</strong>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
