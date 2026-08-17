import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { RiskScoreExplainer, BAND_STYLE, type Band, type RiskScoreRow } from '@/components/prudential/RiskScoreExplainer';

export type { RiskScoreRow };

interface Props {
  row: RiskScoreRow | null;
  entityName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Plain-language explanation of a single entity's composite risk score. */
export function RiskScoreDetailDrawer({ row, entityName, open, onOpenChange }: Props) {
  if (!row) return null;
  const band = (row.band as Band) ?? 'low';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 flex-wrap pr-6">
            <span>{entityName ?? 'Regulated entity'}</span>
            <Badge className={BAND_STYLE[band]}>{band}</Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4">
          <RiskScoreExplainer row={row} entityName={entityName} active={open} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default RiskScoreDetailDrawer;
