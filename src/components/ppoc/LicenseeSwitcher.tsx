import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Building2 } from 'lucide-react';

interface MappedEntity {
  id: string;
  licensee_id: string;
  licensee_name: string;
}

interface LicenseeSwitcherProps {
  onEntityChange: (licenseeId: string) => void;
  selectedEntityId?: string;
}

export function LicenseeSwitcher({ onEntityChange, selectedEntityId }: LicenseeSwitcherProps) {
  const { user } = useAuth();
  const [entities, setEntities] = useState<MappedEntity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: mappings } = await supabase
        .from('ppoc_entity_mappings' as any)
        .select('id, licensee_id')
        .eq('ppoc_user_id', user.id)
        .eq('is_active', true);

      if (!mappings?.length) {
        setEntities([]);
        setLoading(false);
        return;
      }

      const licIds = (mappings as any[]).map(m => m.licensee_id);
      const { data: lics } = await supabase.from('licensees').select('id, name').in('id', licIds);
      const licMap = Object.fromEntries((lics || []).map((l: any) => [l.id, l.name]));

      setEntities((mappings as any[]).map(m => ({
        id: m.id,
        licensee_id: m.licensee_id,
        licensee_name: licMap[m.licensee_id] || 'Unknown',
      })));
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading || entities.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Acting as:</span>
      <Select value={selectedEntityId || entities[0]?.licensee_id} onValueChange={onEntityChange}>
        <SelectTrigger className="w-[240px] h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {entities.map(e => (
            <SelectItem key={e.licensee_id} value={e.licensee_id}>
              {e.licensee_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Badge variant="secondary" className="text-xs">PPOC</Badge>
    </div>
  );
}
