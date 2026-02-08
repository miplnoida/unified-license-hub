import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { sectors, getSubSectorsBySector, getCategoriesBySubSector } from '@/data/sectorData';

interface Props {
  sectorId: string;
  subSectorId: string;
  categoryId: string;
  onSectorChange: (value: string) => void;
  onSubSectorChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  errors: Record<string, string>;
}

export function SectorSelectionSection({
  sectorId,
  subSectorId,
  categoryId,
  onSectorChange,
  onSubSectorChange,
  onCategoryChange,
  errors,
}: Props) {
  const subSectors = sectorId ? getSubSectorsBySector(sectorId) : [];
  const categories = subSectorId ? getCategoriesBySubSector(subSectorId) : [];

  return (
    <div className="form-section">
      <h3 className="text-lg font-semibold text-foreground">Sector Selection Information</h3>
      <p className="text-sm text-muted-foreground">Select the sector, sub-sector, and category for your license application.</p>

      <div className="grid md:grid-cols-3 gap-6 pt-2">
        <div className="space-y-2">
          <Label>Sector *</Label>
          <Select value={sectorId} onValueChange={onSectorChange}>
            <SelectTrigger className={errors.sectorId ? 'border-destructive' : ''}>
              <SelectValue placeholder="Select sector..." />
            </SelectTrigger>
            <SelectContent>
              {sectors.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.sectorId && <p className="text-sm text-destructive">{errors.sectorId}</p>}
        </div>

        <div className="space-y-2">
          <Label>Sub-Sector *</Label>
          <Select value={subSectorId} onValueChange={onSubSectorChange} disabled={!sectorId}>
            <SelectTrigger className={errors.subSectorId ? 'border-destructive' : ''}>
              <SelectValue placeholder="Select sub-sector..." />
            </SelectTrigger>
            <SelectContent>
              {subSectors.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.subSectorId && <p className="text-sm text-destructive">{errors.subSectorId}</p>}
        </div>

        <div className="space-y-2">
          <Label>Category *</Label>
          <Select value={categoryId} onValueChange={onCategoryChange} disabled={!subSectorId}>
            <SelectTrigger className={errors.categoryId ? 'border-destructive' : ''}>
              <SelectValue placeholder="Select category..." />
            </SelectTrigger>
            <SelectContent>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.categoryId && <p className="text-sm text-destructive">{errors.categoryId}</p>}
        </div>
      </div>
    </div>
  );
}
