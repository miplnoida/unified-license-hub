import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { MultiSelect } from '@/components/ui/multi-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PlusCircle, Pencil, Trash2, Loader2, DollarSign } from 'lucide-react';
import { PermissionGate } from '@/components/auth/PermissionGate';
import {
  feeComponentOperation,
  feeErrorMessage,
  fetchFeeAssessmentPreview,
  fetchFeeAssessmentState,
  money,
  num,
  type FeeAssessmentLine,
  type FeeAssessmentPreview,
  type FeeAssessmentState,
} from '@/lib/fees/assessmentClient';

interface FeeType {
  id: string;
  name: string;
  code: string | null;
  status: string;
}

interface FeeComponent {
  id: string;
  application_id: string;
  fee_type_id: string;
  amount: number;
  description: string | null;
  fee_type_name?: string;
}

interface Props {
  applicationId: string;
  editable?: boolean;
}

/**
 * Regulator-facing fee itemisation panel.
 *
 * The authoritative payable result is ALWAYS the server's: a persisted
 * assessment of record (`fee_assessment_state`) when one exists, otherwise the
 * server's non-persisting resolver preview (`fee_assessment_preview`). No fee
 * ranking, matching or pricing logic is reproduced in TypeScript. Manual
 * components remain editable, but only through `fee_component_operation`.
 */
export function FeeComponentsPanel({ applicationId, editable = false }: Props) {
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [components, setComponents] = useState<FeeComponent[]>([]);
  const [assessment, setAssessment] = useState<FeeAssessmentState | null>(null);
  const [preview, setPreview] = useState<FeeAssessmentPreview | null>(null);
  const [financeError, setFinanceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state for adding/editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feeTypeIds, setFeeTypeIds] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const activeFeeTypes = useMemo(() => feeTypes.filter(ft => ft.status === 'active'), [feeTypes]);

  const loadData = async () => {
    setLoading(true);
    setFinanceError(null);

    const [ftRes, fcRes] = await Promise.all([
      supabase.from('fee_types' as any).select('*').order('name'),
      supabase.from('fee_components' as any).select('*').eq('application_id', applicationId).order('created_at'),
    ]);

    if (ftRes.data) setFeeTypes(ftRes.data as any);
    if (fcRes.data) {
      setComponents((fcRes.data as any[]).map(c => ({
        ...c,
        fee_type_name: (ftRes.data as any[])?.find(ft => ft.id === c.fee_type_id)?.name || 'Unknown',
      })));
    }

    try {
      const state = await fetchFeeAssessmentState(applicationId);
      setAssessment(state.found ? state : null);
      if (state.found) {
        setPreview(null);
      } else {
        setPreview(await fetchFeeAssessmentPreview(applicationId));
      }
    } catch (e) {
      setAssessment(null);
      setPreview(null);
      setFinanceError(feeErrorMessage(e));
    }

    setLoading(false);
  };

  useEffect(() => { void loadData(); }, [applicationId]);

  const resetForm = () => {
    setFeeTypeIds([]); setAmount(''); setDescription(''); setEditingId(null); setShowForm(false);
  };

  const openEdit = (comp: FeeComponent) => {
    setEditingId(comp.id);
    setFeeTypeIds([comp.fee_type_id]);
    setAmount(String(comp.amount));
    setDescription(comp.description || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (feeTypeIds.length === 0) { toast.error('Fee type is required'); return; }
    const existingTypeIds = components.filter(c => c.id !== editingId).map(c => c.fee_type_id);
    const duplicates = feeTypeIds.filter(id => existingTypeIds.includes(id));
    if (duplicates.length > 0) {
      const dupNames = duplicates.map(id => feeTypes.find(ft => ft.id === id)?.name || id).join(', ');
      toast.error(`Duplicate fee type(s): ${dupNames}`);
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) { toast.error('Amount must be greater than 0'); return; }

    setSaving(true);
    try {
      if (editingId) {
        await feeComponentOperation(applicationId, 'update', {
          component_id: editingId,
          fee_type_id: feeTypeIds[0],
          amount: numAmount,
          description: description.trim() || null,
        });
        toast.success('Fee component updated');
      } else {
        for (const ftId of feeTypeIds) {
          await feeComponentOperation(applicationId, 'add', {
            fee_type_id: ftId,
            amount: numAmount,
            description: description.trim() || null,
          });
        }
        toast.success(`${feeTypeIds.length} fee component(s) added`);
      }
    } catch (e) {
      toast.error(feeErrorMessage(e));
      setSaving(false);
      return;
    }
    setSaving(false); resetForm(); void loadData();
  };

  const handleDelete = async (id: string) => {
    try {
      await feeComponentOperation(applicationId, 'remove', { component_id: id });
    } catch (e) {
      toast.error(feeErrorMessage(e));
      return;
    }
    toast.success('Fee component removed');
    void loadData();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const authoritativeLines: FeeAssessmentLine[] = assessment
    ? (Array.isArray(assessment.lines) ? assessment.lines : [])
    : (preview?.lines || []);
  const authoritativeTotal = assessment ? num(assessment.assessed_total) : num(preview?.assessed_total);
  const currency = assessment?.currency || preview?.currency || '';
  const basis = assessment?.basis || preview?.basis || null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Fee Breakdown
            {assessment?.assessment_number && (
              <Badge variant="outline" className="font-mono text-xs">{assessment.assessment_number}</Badge>
            )}
            {!assessment && !financeError && (
              <Badge variant="secondary" className="text-xs">Not yet assessed</Badge>
            )}
          </CardTitle>
          {editable && !showForm && (
            <PermissionGate module="fee_management" action="edit">
              <Button data-rbac="fee_management.edit" size="sm" variant="outline" onClick={() => setShowForm(true)}>
                <PlusCircle className="h-4 w-4 mr-2" /> Add Fee
              </Button>
            </PermissionGate>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {financeError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="font-semibold">Financial record unavailable</p>
            <p className="mt-1 text-muted-foreground">{financeError}</p>
          </div>
        )}

        {/* Add/Edit form — governed writer only */}
        {editable && showForm && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <p className="text-sm font-medium">{editingId ? 'Edit Fee' : 'Add Fee Component'}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fee Type(s) *</Label>
                <MultiSelect
                  options={activeFeeTypes.map(ft => ({
                    value: ft.id,
                    label: ft.name + (ft.code ? ` (${ft.code})` : ''),
                  }))}
                  selected={feeTypeIds}
                  onChange={setFeeTypeIds}
                  placeholder="Select types..."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount *</Label>
                <Input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional note" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Add'}
              </Button>
              <Button size="sm" variant="outline" onClick={resetForm}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Manual components — editable inputs, NOT the authoritative result */}
        {components.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Manual fee components (inputs to the server assessment).
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fee Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {editable && <TableHead className="text-right w-[80px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {components.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.fee_type_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.description || '—'}</TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(c.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    {editable && (
                      <TableCell className="text-right">
                        <PermissionGate module="fee_management" action="edit">
                          <Button data-rbac="fee_management.edit" variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </PermissionGate>
                        <PermissionGate module="fee_management" action="edit">
                          <Button data-rbac="fee_management.edit" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </PermissionGate>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Authoritative server result */}
        {!financeError && (
          authoritativeLines.length > 0 ? (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
              <p className="text-sm font-medium">
                {assessment ? 'Assessment of record (immutable)' : 'Server-resolved preview (no financial record created)'}
              </p>
              <div className="space-y-1.5">
                {authoritativeLines.map((line, i) => (
                  <div key={`${line.fee_type_code || 'line'}-${i}`} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {line.description || line.fee_type_code || 'Fee'}
                    </span>
                    <span className="font-mono">{money(line.amount, line.currency || currency)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-2 font-semibold text-sm">
                  <span>{assessment ? 'Assessed total' : 'Indicative total'}</span>
                  <span className="font-mono">{money(authoritativeTotal, currency)}</span>
                </div>
                {assessment && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Outstanding</span>
                    <span className="font-mono">{money(assessment.outstanding, currency)}</span>
                  </div>
                )}
              </div>
              {basis && (
                <p className="text-xs text-muted-foreground pt-1">Basis: <span className="font-mono">{basis}</span></p>
              )}
            </div>
          ) : basis === 'BUSINESS_CONFIGURATION_ABSENT' ? (
            <p className="text-sm text-amber-700 dark:text-amber-300 text-center py-4 font-medium">
              No fee is configured for this matter. The regulator must configure the fee before any amount can be assessed.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              The server resolved no payable fee for this application.
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}
