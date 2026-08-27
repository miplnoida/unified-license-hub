import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { BookmarkPlus, ChevronDown, Star, Trash2, Users } from 'lucide-react';
import { useConductSavedViews, useDeleteConductView, useSaveConductView, type ConductSavedView } from '@/hooks/useConductSavedViews';

interface Props {
  currentConfig: Record<string, any>;
  activeViewId: string | null;
  onLoad: (view: ConductSavedView) => void;
}

export function SavedViewsBar({ currentConfig, activeViewId, onLoad }: Props) {
  const { data: views = [] } = useConductSavedViews();
  const save = useSaveConductView();
  const remove = useDeleteConductView();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [isDefault, setIsDefault] = useState(false);

  const active = views.find((v) => v.id === activeViewId);

  const submit = async () => {
    if (!name.trim()) return;
    await save.mutateAsync({ name: name.trim(), is_shared: shared, is_default: isDefault, config: currentConfig });
    setOpen(false); setName(''); setShared(false); setIsDefault(false);
  };

  return (
    <Card>
      <CardContent className="p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Saved views</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {active ? active.name : 'Load a view'} <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            {views.length === 0 ? (
              <DropdownMenuItem data-rbac="market_conduct.manage_complaints" disabled>No saved views yet</DropdownMenuItem>
            ) : views.map((v) => (
              <DropdownMenuItem key={v.id} onClick={() => onLoad(v)} className="flex items-center gap-2">
                <span className="flex-1 truncate">{v.name}</span>
                {v.is_default && <Star className="h-3 w-3 text-amber-500" />}
                {v.is_shared && <Users className="h-3 w-3 text-muted-foreground" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button data-rbac="market_conduct.manage_complaints" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <BookmarkPlus className="h-3.5 w-3.5 mr-1" /> Save current
        </Button>

        {active && (
          <>
            <Button data-rbac="market_conduct.manage_complaints"
              variant="ghost" size="sm"
              onClick={() => save.mutate({ id: active.id, name: active.name, is_shared: active.is_shared, is_default: active.is_default, config: currentConfig })}
            >
              Update “{active.name}”
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => save.mutate({ id: active.id, name: active.name, is_shared: active.is_shared, is_default: !active.is_default, config: active.config })}
            >
              <Star className={`h-3.5 w-3.5 mr-1 ${active.is_default ? 'text-amber-500' : ''}`} />
              {active.is_default ? 'Unset default' : 'Set default'}
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove.mutate(active.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            {active.is_shared && <Badge variant="secondary" className="text-xs">Shared with team</Badge>}
          </>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save analytical view</DialogTitle>
              <DialogDescription>Stores the current filters, active tab and selected entity.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="view-name">View name</Label>
                <Input id="view-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Retail banking — critical watch" />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="view-shared" className="font-normal">Share with my team</Label>
                <Switch id="view-shared" checked={shared} onCheckedChange={setShared} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="view-default" className="font-normal">Apply automatically on page load</Label>
                <Switch id="view-default" checked={isDefault} onCheckedChange={setIsDefault} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button data-rbac="market_conduct.manage_complaints" onClick={submit} disabled={!name.trim() || save.isPending}>Save view</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
