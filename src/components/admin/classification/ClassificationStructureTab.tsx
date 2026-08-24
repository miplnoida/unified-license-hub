/**
 * Hierarchical classification structure:
 *   common sector family -> local sector -> business type -> (schemes shown on the Schemes tab)
 * Status is hierarchical: a child that is ACTIVE but whose parent is not active is
 * shown as effectively unavailable rather than being rewritten.
 */
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, ChevronRight, Plus, Pencil, Ban, CheckCircle2, Archive, History, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useClassificationTree, useClassificationMutations, useSectorFamilies, useSubjectForms,
  MARKET_SCOPES, type LocalSectorRow, type BusinessTypeRow,
} from '@/hooks/useRegulatoryClassification';
import { StatusChangeDialog, ClassificationStatusBadgeTone, type StatusChangeRequest } from './StatusChangeDialog';

interface SectorForm {
  id: string | null; code: string; name: string; family_code: string; display_group: string; scope_note: string;
}
interface BtForm {
  id: string | null; sector_id: string; code: string; name: string; local_legal_name: string;
  subject_form_code: string; market_scope: string; legal_basis: string; description: string;
  effective_from: string; effective_to: string;
}

const emptySector: SectorForm = { id: null, code: '', name: '', family_code: 'none', display_group: '', scope_note: '' };
const emptyBt = (sectorId: string): BtForm => ({
  id: null, sector_id: sectorId, code: '', name: '', local_legal_name: '', subject_form_code: 'none',
  market_scope: 'DOMESTIC', legal_basis: '', description: '', effective_from: '', effective_to: '',
});

export function ClassificationStructureTab({ canWrite, onHistory }: { canWrite: boolean; onHistory: (id: string) => void }) {
  const { toast } = useToast();
  const tree = useClassificationTree();
  const families = useSectorFamilies();
  const forms = useSubjectForms();
  const mut = useClassificationMutations();

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sectorForm, setSectorForm] = useState<SectorForm | null>(null);
  const [btForm, setBtForm] = useState<BtForm | null>(null);
  const [statusReq, setStatusReq] = useState<StatusChangeRequest | null>(null);

  const familyStatus = useMemo(() => {
    const map = new Map<string, string>();
    (families.data || []).forEach((f) => map.set(f.code.toUpperCase(), f.status));
    return map;
  }, [families.data]);

  const grouped = useMemo(() => {
    const sectors = (tree.data?.sectors || []) as LocalSectorRow[];
    const keys = Array.from(new Set(sectors.map((s) => (s.family_code || 'UNMAPPED').toUpperCase())));
    return keys
      .map((key) => ({
        key,
        label: (families.data || []).find((f) => f.code.toUpperCase() === key)?.label || 'Unmapped sector family',
        status: familyStatus.get(key) || 'active',
        sectors: sectors.filter((s) => (s.family_code || 'UNMAPPED').toUpperCase() === key),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tree.data, families.data, familyStatus]);

  const saveSector = async () => {
    if (!sectorForm) return;
    try {
      await mut.upsertSector.mutateAsync({
        _id: sectorForm.id, _code: sectorForm.code, _name: sectorForm.name,
        _family_code: sectorForm.family_code === 'none' ? null : sectorForm.family_code,
        _display_group: sectorForm.display_group || null, _scope_note: sectorForm.scope_note || null,
        _status: sectorForm.id ? undefined : 'draft', _reason: 'Structure edit',
      });
      toast({ title: sectorForm.id ? 'Sector updated' : 'Sector created as draft' });
      setSectorForm(null);
    } catch (e: any) {
      toast({ title: 'Not saved', description: e.message, variant: 'destructive' });
    }
  };

  const saveBt = async () => {
    if (!btForm) return;
    try {
      await mut.upsertBusinessType.mutateAsync({
        _id: btForm.id, _sector_id: btForm.sector_id, _code: btForm.code, _name: btForm.name,
        _local_legal_name: btForm.local_legal_name || null,
        _subject_form_code: btForm.subject_form_code === 'none' ? null : btForm.subject_form_code,
        _market_scope: btForm.market_scope, _legal_basis: btForm.legal_basis || null,
        _description: btForm.description || null,
        _effective_from: btForm.effective_from || null, _effective_to: btForm.effective_to || null,
        _status: btForm.id ? undefined : 'draft', _reason: 'Structure edit',
      });
      toast({ title: btForm.id ? 'Business type updated' : 'Business type created as draft' });
      setBtForm(null);
    } catch (e: any) {
      toast({ title: 'Not saved', description: e.message, variant: 'destructive' });
    }
  };

  const confirmStatus = async (reason: string) => {
    if (!statusReq) return;
    const args = { _id: statusReq.entityId, _status: statusReq.targetStatus, _reason: reason };
    if (statusReq.entityType === 'sector') await mut.setSectorStatus.mutateAsync(args);
    else await mut.setBusinessTypeStatus.mutateAsync(args);
  };

  const deleteDraft = async (entityType: 'sector' | 'business_type', id: string, label: string) => {
    try {
      await mut.deleteDraft.mutateAsync({ _entity_type: entityType, _id: id, _reason: 'Unused draft removed' });
      toast({ title: `${label} deleted` });
    } catch (e: any) {
      toast({ title: 'Delete refused', description: e.message, variant: 'destructive' });
    }
  };

  const StatusActions = ({ type, id, label, status }: { type: 'sector' | 'business_type'; id: string; label: string; status: string }) => (
    <div className="flex flex-wrap items-center gap-1">
      {status !== 'active' && (
        <Button size="sm" variant="ghost" disabled={!canWrite}
          onClick={() => setStatusReq({ entityType: type, entityId: id, label, currentStatus: status, targetStatus: 'active' })}>
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Enable
        </Button>
      )}
      {status === 'active' && (
        <Button size="sm" variant="ghost" disabled={!canWrite}
          onClick={() => setStatusReq({ entityType: type, entityId: id, label, currentStatus: status, targetStatus: 'disabled' })}>
          <Ban className="mr-1 h-3.5 w-3.5" />Disable
        </Button>
      )}
      {status !== 'retired' && (
        <Button size="sm" variant="ghost" disabled={!canWrite}
          onClick={() => setStatusReq({ entityType: type, entityId: id, label, currentStatus: status, targetStatus: 'retired' })}>
          <Archive className="mr-1 h-3.5 w-3.5" />Retire
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => onHistory(id)}>
        <History className="mr-1 h-3.5 w-3.5" />History
      </Button>
      {status === 'draft' && (
        <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => deleteDraft(type, id, label)}>
          <Trash2 className="mr-1 h-3.5 w-3.5" />Delete draft
        </Button>
      )}
    </div>
  );

  const renderBt = (bt: BusinessTypeRow, sector: LocalSectorRow, familyOk: boolean) => {
    const parentOk = familyOk && sector.status === 'active';
    const unavailable = bt.status === 'active' && !parentOk;
    return (
      <div key={bt.id} className="flex flex-wrap items-start justify-between gap-2 border-t px-4 py-2 pl-12">
        <div>
          <p className="text-sm font-medium">{bt.name}</p>
          <p className="text-xs text-muted-foreground">
            Business type · {bt.code}
            {bt.effective_from ? ` · from ${bt.effective_from}` : ''}
            {bt.effective_to ? ` to ${bt.effective_to}` : ''}
            {bt.subject_form_code ? ` · ${bt.subject_form_code}` : ''}
          </p>
          {unavailable && (
            <p className="text-xs text-amber-600">
              Unavailable because {familyOk ? 'the local sector' : 'the sector family'} is not active
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={ClassificationStatusBadgeTone(bt.status) as any}>{bt.status.toUpperCase()}</Badge>
          <Button size="sm" variant="ghost" disabled={!canWrite}
            onClick={() => setBtForm({
              id: bt.id, sector_id: bt.sector_id, code: bt.code, name: bt.name,
              local_legal_name: bt.local_legal_name || '', subject_form_code: bt.subject_form_code || 'none',
              market_scope: bt.market_scope || 'DOMESTIC', legal_basis: bt.legal_basis || '',
              description: bt.description || '', effective_from: bt.effective_from || '', effective_to: bt.effective_to || '',
            })}>
            <Pencil className="mr-1 h-3.5 w-3.5" />Edit
          </Button>
          <StatusActions type="business_type" id={bt.id} label={bt.name} status={bt.status} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Sector family → local regulatory sector → regulated business type. Authorization schemes and classes are
          managed on the Authorization Schemes tab.
        </p>
        <Button size="sm" disabled={!canWrite} onClick={() => setSectorForm({ ...emptySector })}>
          <Plus className="mr-1 h-4 w-4" />Add local sector
        </Button>
      </div>

      {grouped.map((group) => {
        const familyOk = group.status === 'active';
        return (
          <Card key={group.key}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {group.label}
                <Badge variant={ClassificationStatusBadgeTone(group.status) as any}>{group.status.toUpperCase()}</Badge>
              </CardTitle>
              <CardDescription>{group.sectors.length} local sector(s)</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {group.sectors.map((sector) => {
                const isOpen = open[sector.id] ?? sector.status === 'active';
                const unavailable = sector.status === 'active' && !familyOk;
                return (
                  <div key={sector.id} className="border-t">
                    <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-2">
                      <button type="button" className="flex items-start gap-2 text-left"
                        onClick={() => setOpen((s) => ({ ...s, [sector.id]: !isOpen }))}>
                        {isOpen ? <ChevronDown className="mt-0.5 h-4 w-4" /> : <ChevronRight className="mt-0.5 h-4 w-4" />}
                        <span>
                          <span className="text-sm font-semibold">{sector.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            Local sector · {sector.code || '—'} · {sector.businessTypes.length} business type(s)
                            {sector.scope_note ? ` · ${sector.scope_note}` : ''}
                          </span>
                          {unavailable && (
                            <span className="block text-xs text-amber-600">Unavailable because the sector family is not active</span>
                          )}
                        </span>
                      </button>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={ClassificationStatusBadgeTone(sector.status) as any}>
                          {(sector.status === 'inactive' ? 'disabled' : sector.status).toUpperCase()}
                        </Badge>
                        <Button size="sm" variant="ghost" disabled={!canWrite}
                          onClick={() => setSectorForm({
                            id: sector.id, code: sector.code || '', name: sector.name,
                            family_code: sector.family_code || 'none', display_group: sector.display_group || '',
                            scope_note: sector.scope_note || '',
                          })}>
                          <Pencil className="mr-1 h-3.5 w-3.5" />Edit
                        </Button>
                        <Button size="sm" variant="ghost" disabled={!canWrite}
                          onClick={() => setBtForm(emptyBt(sector.id))}>
                          <Plus className="mr-1 h-3.5 w-3.5" />Add business type
                        </Button>
                        <StatusActions type="sector" id={sector.id} label={sector.name} status={sector.status} />
                      </div>
                    </div>
                    {isOpen && sector.businessTypes.map((bt) => renderBt(bt, sector, familyOk))}
                    {isOpen && sector.businessTypes.length === 0 && (
                      <p className="border-t px-4 py-2 pl-12 text-xs text-muted-foreground">No business types yet.</p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      {/* Sector dialog */}
      <Dialog open={!!sectorForm} onOpenChange={(o) => { if (!o) setSectorForm(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{sectorForm?.id ? 'Edit local sector' : 'Add local sector'}</DialogTitle></DialogHeader>
          {sectorForm && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input value={sectorForm.code} onChange={(e) => setSectorForm({ ...sectorForm, code: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={sectorForm.name} onChange={(e) => setSectorForm({ ...sectorForm, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Common sector family</Label>
                <Select value={sectorForm.family_code} onValueChange={(v) => setSectorForm({ ...sectorForm, family_code: v })}>
                  <SelectTrigger><SelectValue placeholder="Select a family" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unmapped</SelectItem>
                    {(families.data || []).map((f) => <SelectItem key={f.code} value={f.code}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Display group</Label>
                <Input value={sectorForm.display_group} onChange={(e) => setSectorForm({ ...sectorForm, display_group: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Scope note</Label>
                <Textarea rows={2} value={sectorForm.scope_note} onChange={(e) => setSectorForm({ ...sectorForm, scope_note: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSectorForm(null)}>Cancel</Button>
            <Button onClick={saveSector}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Business type dialog */}
      <Dialog open={!!btForm} onOpenChange={(o) => { if (!o) setBtForm(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{btForm?.id ? 'Edit business type' : 'Add business type'}</DialogTitle></DialogHeader>
          {btForm && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input value={btForm.code} onChange={(e) => setBtForm({ ...btForm, code: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={btForm.name} onChange={(e) => setBtForm({ ...btForm, name: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Local legal name</Label>
                <Input value={btForm.local_legal_name} onChange={(e) => setBtForm({ ...btForm, local_legal_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Subject form</Label>
                <Select value={btForm.subject_form_code} onValueChange={(v) => setBtForm({ ...btForm, subject_form_code: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    {(forms.data || []).filter((f) => f.status === 'active')
                      .map((f) => <SelectItem key={f.code} value={f.code}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Market scope</Label>
                <Select value={btForm.market_scope} onValueChange={(v) => setBtForm({ ...btForm, market_scope: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MARKET_SCOPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Effective from</Label>
                <Input type="date" value={btForm.effective_from} onChange={(e) => setBtForm({ ...btForm, effective_from: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Effective to</Label>
                <Input type="date" value={btForm.effective_to} onChange={(e) => setBtForm({ ...btForm, effective_to: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Legal basis</Label>
                <Input value={btForm.legal_basis} onChange={(e) => setBtForm({ ...btForm, legal_basis: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Description</Label>
                <Textarea rows={2} value={btForm.description} onChange={(e) => setBtForm({ ...btForm, description: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBtForm(null)}>Cancel</Button>
            <Button onClick={saveBt}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StatusChangeDialog request={statusReq} onClose={() => setStatusReq(null)} onConfirm={confirmStatus} />
    </div>
  );
}
