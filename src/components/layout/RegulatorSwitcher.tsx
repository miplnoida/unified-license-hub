import { useRegulator } from '@/contexts/RegulatorContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2 } from 'lucide-react';

export function RegulatorSwitcher() {
  const { activeRegulatorId, regulators, setActiveRegulator, isLoading } = useRegulator();

  if (isLoading || regulators.length === 0) return null;

  // If only one regulator, show it as a badge instead of dropdown
  if (regulators.length === 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 text-sm font-medium">
        <Building2 className="h-4 w-4 text-primary" />
        <span>{regulators[0].name}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <Select value={activeRegulatorId || ''} onValueChange={setActiveRegulator}>
        <SelectTrigger className="h-9 w-48 bg-muted/40 border-0 text-sm">
          <SelectValue placeholder="Select regulator..." />
        </SelectTrigger>
        <SelectContent>
          {regulators.map(r => (
            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
