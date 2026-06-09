import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Calendar, Star, Search } from 'lucide-react';
import { REPORT_CATEGORIES, REPORT_DEFINITIONS } from '../reportDefinitions';
import type { ReportDefinition, ReportRun } from '../types';
import { generateReport, listFavorites, toggleFavorite } from '../services/reportService';
import { useToast } from '@/hooks/use-toast';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';

interface Props {
  onPreview: (run: ReportRun) => void;
  onSchedule: (def: ReportDefinition) => void;
}

export function ReportLibrary({ onPreview, onSchedule }: Props) {
  const { toast } = useToast();
  const { hasModuleAccess, isLoading: permsLoading } = useUserDynamicPermissions();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    listFavorites().then((rows) => setFavs(new Set(rows.map((r) => r.reportSlug)))).catch(() => {});
  }, []);

  const accessibleDefs = useMemo(() => {
    if (permsLoading) return REPORT_DEFINITIONS;
    return REPORT_DEFINITIONS.filter((d) => hasModuleAccess(d.module));
  }, [hasModuleAccess, permsLoading]);

  const list = useMemo(() => {
    return accessibleDefs.filter((d) => {
      if (cat !== 'all' && d.category !== cat) return false;
      if (showFavsOnly && !favs.has(d.id)) return false;
      if (search) {
        const q = search.toLowerCase();
        return d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => {
      const af = favs.has(a.id) ? 0 : 1;
      const bf = favs.has(b.id) ? 0 : 1;
      return af - bf;
    });
  }, [accessibleDefs, search, cat, favs, showFavsOnly]);

  const handleToggleFav = async (id: string) => {
    const next = new Set(favs);
    const on = await toggleFavorite(id);
    on ? next.add(id) : next.delete(id);
    setFavs(next);
  };

  const handleGenerate = async (def: ReportDefinition) => {
    setBusyId(def.id);
    try {
      const run = await generateReport({
        name: def.name,
        category: def.category,
        source: def.source,
        filters: {},
        reportSlug: def.id,
        description: def.description,
        selectedColumns: def.defaultColumns,
        groupBy: def.defaultGroupBy,
      });
      toast({ title: 'Report generated', description: `${run.rowCount} rows.` });
      onPreview(run);
    } catch (e: any) {
      toast({ title: 'Failed to generate', description: e?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  if (!permsLoading && accessibleDefs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          You don't have access to any report modules. Contact an administrator.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reports..." className="pl-9" />
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="md:w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {REPORT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={showFavsOnly ? 'default' : 'outline'}
          onClick={() => setShowFavsOnly((v) => !v)}
        >
          <Star className={`h-4 w-4 mr-2 ${showFavsOnly ? 'fill-current' : ''}`} />
          Favorites
        </Button>
      </div>

      {list.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No reports match your filters.</CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((d) => (
            <Card key={d.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <CardTitle className="text-base">{d.name}</CardTitle>
                    <Badge variant="secondary" className="text-xs">{d.category}</Badge>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => handleToggleFav(d.id)} aria-label="Favorite">
                    <Star className={`h-4 w-4 ${favs.has(d.id) ? 'fill-yellow-400 text-yellow-500' : ''}`} />
                  </Button>
                </div>
                <CardDescription className="text-sm">{d.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex gap-1">
                    {d.exportFormats.map((f) => <Badge key={f} variant="outline" className="text-[10px] uppercase">{f}</Badge>)}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => onSchedule(d)}>
                      <Calendar className="h-3 w-3 mr-1" />Schedule
                    </Button>
                    <Button size="sm" onClick={() => handleGenerate(d)} disabled={busyId === d.id}>
                      <Play className="h-3 w-3 mr-1" />{busyId === d.id ? 'Generating…' : 'Generate'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
