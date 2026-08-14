/**
 * Presentation-only chip identifying which supervisory area a report belongs to.
 * Gives each card a stable icon + tone so a list of reports for the same
 * organisation stays scannable. No data or behaviour attached.
 */
import {
  Building2,
  ClipboardCheck,
  FileSignature,
  Gavel,
  Layers,
  LineChart,
  MessageSquareWarning,
  Scale,
  ShieldCheck,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { hubModuleVisual, type HubModule } from '@/lib/ai/reportHub';

export const HUB_MODULE_ICON: Record<HubModule, LucideIcon> = {
  licensing: FileSignature,
  fit_proper: UserCheck,
  prudential: ShieldCheck,
  examination: ClipboardCheck,
  complaints: MessageSquareWarning,
  conduct: Scale,
  enforcement: Gavel,
  cross_module: Layers,
  executive: LineChart,
};

export function hubModuleIcon(module: HubModule): LucideIcon {
  return HUB_MODULE_ICON[module] ?? Building2;
}

export function ModuleAreaChip({ module, className }: { module: HubModule; className?: string }) {
  const visual = hubModuleVisual(module);
  const Icon = hubModuleIcon(module);
  return (
    <Badge
      variant="outline"
      className={cn('gap-1.5 px-2 py-0.5 text-[11px] font-semibold', visual.chipClass, className)}
    >
      <Icon className="h-3 w-3" />
      {visual.chip}
    </Badge>
  );
}

export default ModuleAreaChip;
