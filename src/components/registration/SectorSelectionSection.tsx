import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useSectors, useSubSectors, useCategories } from '@/hooks/useMasterConfig';

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
  const qc = useQueryClient();
  const { data: sectors = [] } = useSectors();
  const { data: allSubSectors = [] } = useSubSectors();
  const { data: allCategories = [] } = useCategories();

  // Ensure freshly opened registration page fetches latest taxonomy
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['sectors'] });
    qc.invalidateQueries({ queryKey: ['sub_sectors'] });
    qc.invalidateQueries({ queryKey: ['categories'] });
  }, [qc]);

  const activeSectors = useMemo(
    () => (sectors || []).filter((s: any) => s.status === 'active'),
    [sectors]
  );
  const subSectors = useMemo(
    () =>
      sectorId
        ? (allSubSectors || []).filter(
            (s: any) => s.sector_id === sectorId && s.status === 'active'
          )
        : [],
    [allSubSectors, sectorId]
  );
  const categories = useMemo(
    () =>
      subSectorId
        ? (allCategories || []).filter(
            (c: any) => c.sub_sector_id === subSectorId && c.status === 'active'
          )
        : [],
    [allCategories, subSectorId]
  );

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
              {activeSectors.length === 0 ? (
                <SelectItem value="__none__" disabled>No active sectors</SelectItem>
              ) : (
                activeSectors.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))
              )}
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
              {subSectors.length === 0 ? (
                <SelectItem value="__none__" disabled>No active sub-sectors</SelectItem>
              ) : (
                subSectors.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))
              )}
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
              {categories.length === 0 ? (
                <SelectItem value="__none__" disabled>No active categories</SelectItem>
              ) : (
                categories.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {errors.categoryId && <p className="text-sm text-destructive">{errors.categoryId}</p>}
        </div>
      </div>
    </div>
  );
}
