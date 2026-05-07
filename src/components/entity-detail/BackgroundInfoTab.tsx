import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Building2, MapPin, Phone, Mail, Save, Loader2, CheckCircle2, XCircle } from 'lucide-react';

interface BackgroundInfoTabProps {
  entity: any;
  sectors: Record<string, string>;
  subSectors: Record<string, string>;
  categories: Record<string, string>;
  onUpdate: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

export default function BackgroundInfoTab({ entity, sectors, subSectors, categories, onUpdate, onDirtyChange }: BackgroundInfoTabProps) {
  const [form, setForm] = useState({
    name: entity.name || '',
    status: entity.status || 'active',
    sector_id: entity.sector_id || '',
    sub_sector_id: entity.sub_sector_id || '',
    category_id: entity.category_id || '',
  });
  const [saving, setSaving] = useState(false);
  const [nameStatus, setNameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  const handleChange = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    onDirtyChange(true);
    if (key === 'name') setNameStatus('idle');
  };

  const checkNameUnique = async () => {
    const trimmed = form.name.trim();
    if (!trimmed || trimmed.toLowerCase() === (entity.name || '').toLowerCase()) {
      setNameStatus('idle');
      return;
    }
    setNameStatus('checking');
    const { data, error } = await supabase
      .from('licensees')
      .select('id')
      .ilike('name', trimmed)
      .neq('id', entity.id)
      .limit(1);
    if (error) { setNameStatus('idle'); return; }
    setNameStatus(data && data.length > 0 ? 'taken' : 'available');
  };

  const handleSave = async () => {
    if (nameStatus === 'taken') {
      toast.error('Entity name already exists');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('licensees').update({
      name: form.name,
      status: form.status,
      sector_id: form.sector_id || null,
      sub_sector_id: form.sub_sector_id || null,
      category_id: form.category_id || null,
    }).eq('id', entity.id);

    if (error) {
      toast.error('Failed to save: ' + error.message);
    } else {
      toast.success('Entity information updated');
      onDirtyChange(false);
      onUpdate();
    }
    setSaving(false);
  };

  const sectorList = Object.entries(sectors).sort((a, b) => a[1].localeCompare(b[1]));
  const subSectorList = Object.entries(subSectors).sort((a, b) => a[1].localeCompare(b[1]));
  const categoryList = Object.entries(categories).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Entity Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-primary" />
              Entity Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Entity Name *</Label>
              <div className="relative">
                <Input
                  id="name"
                  value={form.name}
                  onChange={e => handleChange('name', e.target.value)}
                  onBlur={checkNameUnique}
                  className={nameStatus === 'taken' ? 'border-destructive pr-10' : 'pr-10'}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {nameStatus === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {nameStatus === 'available' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  {nameStatus === 'taken' && <XCircle className="h-4 w-4 text-destructive" />}
                </div>
              </div>
              {nameStatus === 'taken' && (
                <p className="text-sm text-destructive">An entity with this name already exists</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={form.status} onValueChange={v => handleChange('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Sector</Label>
              <Select value={form.sector_id} onValueChange={v => handleChange('sector_id', v)}>
                <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
                <SelectContent>
                  {sectorList.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sub-Sector</Label>
              <Select value={form.sub_sector_id} onValueChange={v => handleChange('sub_sector_id', v)}>
                <SelectTrigger><SelectValue placeholder="Select sub-sector" /></SelectTrigger>
                <SelectContent>
                  {subSectorList.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category_id} onValueChange={v => handleChange('category_id', v)}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categoryList.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Registration Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MapPin className="h-5 w-5 text-primary" />
              Registration Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Entity ID</span>
              <span className="font-mono text-sm">{entity.id?.slice(0, 8)}...</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Created</span>
              <span className="text-sm">{new Date(entity.created_at).toLocaleDateString()}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Last Updated</span>
              <span className="text-sm">{new Date(entity.updated_at).toLocaleDateString()}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant="outline" className={`capitalize ${entity.status === 'active' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200' : 'bg-muted text-muted-foreground'}`}>
                {entity.status}
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Sector</span>
              <span className="text-sm">{entity.sector_id ? sectors[entity.sector_id] || '—' : '—'}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Sub-Sector</span>
              <span className="text-sm">{entity.sub_sector_id ? subSectors[entity.sub_sector_id] || '—' : '—'}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Category</span>
              <span className="text-sm">{entity.category_id ? categories[entity.category_id] || '—' : '—'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
