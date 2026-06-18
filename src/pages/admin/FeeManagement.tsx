import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useSectors, useSubSectors, useCategories, useServices } from '@/hooks/useMasterConfig';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useRegulator } from '@/contexts/RegulatorContext';

import { toast } from 'sonner';
import { CALCULATION_TYPE_LABELS, CalculationType, FEE_RULE_TYPE_LABELS, FeeRuleType } from '@/types/platform';
import { PlusCircle, Pencil, Trash2, Loader2, Calculator, ShieldOff, Percent, DollarSign, Info } from 'lucide-react';
import { RowActionsMenu } from '@/components/common/RowActionsMenu';

interface FeeConfig {
  id: string;
  regulator_id: string | null;
  sector_id: string | null;
  sub_sector_id: string | null;
  category_id: string | null;
  service_id: string | null;
  form_id: string | null;
  fee_type: string;
  name: string;
  amount: number;
  currency: string;
  is_active: boolean;
  calculation_type: CalculationType;
  calculation_expression: string | null;
  min_amount: number;
  max_amount: number | null;
  created_at: string;
}


interface FeeRule {
  id: string;
  fee_configuration_id: string;
  rule_type: FeeRuleType;
  name: string;
  description: string | null;
  condition: any;
  expression: string | null;
  discount_percent: number;
  discount_amount: number;
  priority: number;
  is_active: boolean;
  created_at: string;
}

interface FeeTypeAmountRow {
  calculationType: 'fixed' | 'percentage';
  amount: string;
  minAmount: string;
  maxAmount: string;
  error?: string;
}

export default function FeeManagement() {
  const { activeRegulatorId } = useRegulator();
  const [fees, setFees] = useState<FeeConfig[]>([]);
  const [rules, setRules] = useState<FeeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FeeConfig | null>(null);
  const [editingRule, setEditingRule] = useState<FeeRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('configurations');
  const [legacyNote, setLegacyNote] = useState(false);

  // Fee Types master state
  const [feeTypesData, setFeeTypesData] = useState<{ id: string; name: string; code: string | null; status: string; created_at: string }[]>([]);
  const [ftDialogOpen, setFtDialogOpen] = useState(false);
  const [ftEditing, setFtEditing] = useState<{ id: string; name: string; code: string | null; status: string } | null>(null);
  const [ftName, setFtName] = useState('');
  const [ftCode, setFtCode] = useState('');
  const [ftStatus, setFtStatus] = useState('active');

  // Fee form state
  const [name, setName] = useState('');
  const [feeTypes, setFeeTypesSelected] = useState<string[]>([]);
  const [feeTypeAmounts, setFeeTypeAmounts] = useState<Record<string, FeeTypeAmountRow>>({});
  const [currency, setCurrency] = useState('USD');
  const [sectorId, setSectorId] = useState('');
  const [subSectorId, setSubSectorId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [formIds, setFormIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);


  // Rule form state
  const [ruleName, setRuleName] = useState('');
  const [ruleType, setRuleType] = useState<FeeRuleType>('calculation');
  const [ruleDescription, setRuleDescription] = useState('');
  const [ruleFeeId, setRuleFeeId] = useState('');
  const [ruleExpression, setRuleExpression] = useState('');
  const [ruleDiscountPercent, setRuleDiscountPercent] = useState('');
  const [ruleDiscountAmount, setRuleDiscountAmount] = useState('');
  const [rulePriority, setRulePriority] = useState('0');
  const [ruleConditionField, setRuleConditionField] = useState('');
  const [ruleConditionOperator, setRuleConditionOperator] = useState('gte');
  const [ruleConditionValue, setRuleConditionValue] = useState('');
  const [ruleActive, setRuleActive] = useState(true);

  const { data: sectors = [] } = useSectors(activeRegulatorId);
  const { data: subSectors = [] } = useSubSectors(activeRegulatorId);
  const { data: categories = [] } = useCategories(activeRegulatorId);
  const { data: services = [] } = useServices(activeRegulatorId);
  const { data: formTemplates = [] } = useFormTemplates(undefined, activeRegulatorId);


  const loadFees = async () => {
    setLoading(true);
    let query = supabase.from('fee_configurations' as any).select('*').order('created_at', { ascending: false });
    if (activeRegulatorId) query = query.eq('regulator_id', activeRegulatorId);
    const { data, error } = await query;
    if (!error) setFees((data || []) as any);
    setLoading(false);
  };

  const loadRules = async () => {
    const { data, error } = await supabase.from('fee_rules' as any).select('*').order('priority', { ascending: true });
    if (!error) setRules((data || []) as any);
  };

  const loadFeeTypes = async () => {
    const { data } = await supabase.from('fee_types' as any).select('*').order('name');
    if (data) setFeeTypesData(data as any);
  };

  useEffect(() => { loadFees(); loadRules(); loadFeeTypes(); }, [activeRegulatorId]);

  const resetFtForm = () => { setFtName(''); setFtCode(''); setFtStatus('active'); setFtEditing(null); };

  const openEditFt = (ft: any) => {
    setFtEditing(ft); setFtName(ft.name); setFtCode(ft.code || ''); setFtStatus(ft.status); setFtDialogOpen(true);
  };

  const handleSaveFt = async () => {
    if (!ftName.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    const payload: any = { name: ftName.trim(), code: ftCode.trim() || null, status: ftStatus };
    if (ftEditing) {
      const { error } = await supabase.from('fee_types' as any).update(payload).eq('id', ftEditing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Fee type updated');
    } else {
      const { error } = await supabase.from('fee_types' as any).insert(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Fee type created');
    }
    setSaving(false); setFtDialogOpen(false); resetFtForm(); loadFeeTypes();
  };

  const handleDeleteFt = async (id: string) => {
    const { error } = await supabase.from('fee_types' as any).delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Fee type deleted'); loadFeeTypes();
  };

  const resetForm = () => {
    setName(''); setFeeTypesSelected([]); setFeeTypeAmounts({}); setCurrency('USD');
    setSectorId(''); setSubSectorId(''); setCategoryId(''); setServiceIds([]); setFormIds([]);
    setIsActive(true); setEditing(null); setLegacyNote(false);
  };


  const handleFeeTypesChange = useCallback((selected: string[]) => {
    setFeeTypesSelected(selected);
    setFeeTypeAmounts(prev => {
      const next: Record<string, FeeTypeAmountRow> = {};
      selected.forEach(ft => {
        next[ft] = prev[ft] || { calculationType: 'fixed', amount: '', minAmount: '', maxAmount: '' };
      });
      return next;
    });
  }, []);

  const updateFeeTypeRow = useCallback((ft: string, field: keyof FeeTypeAmountRow, value: string) => {
    setFeeTypeAmounts(prev => ({
      ...prev,
      [ft]: { ...prev[ft], [field]: value, error: undefined },
    }));
  }, []);

  const removeFeeTypeRow = useCallback((ft: string) => {
    setFeeTypesSelected(prev => prev.filter(t => t !== ft));
    setFeeTypeAmounts(prev => {
      const next = { ...prev };
      delete next[ft];
      return next;
    });
  }, []);
  const resetRuleForm = () => {
    setRuleName(''); setRuleType('calculation'); setRuleDescription('');
    setRuleFeeId(''); setRuleExpression(''); setRuleDiscountPercent('');
    setRuleDiscountAmount(''); setRulePriority('0'); setRuleConditionField('');
    setRuleConditionOperator('gte'); setRuleConditionValue(''); setRuleActive(true);
    setEditingRule(null);
  };

  const openEdit = (fee: FeeConfig) => {
    setEditing(fee);
    setName(fee.name); setFeeTypesSelected([fee.fee_type]);
    const row: FeeTypeAmountRow = {
      calculationType: (fee.calculation_type === 'percentage' ? 'percentage' : 'fixed') as 'fixed' | 'percentage',
      amount: String(fee.amount),
      minAmount: String(fee.min_amount || ''),
      maxAmount: String(fee.max_amount || ''),
    };
    setFeeTypeAmounts({ [fee.fee_type]: row });
    setLegacyNote(false);
    setCurrency(fee.currency); setSectorId(fee.sector_id || '');
    setSubSectorId(fee.sub_sector_id || ''); setCategoryId(fee.category_id || '');
    setServiceIds(fee.service_id ? [fee.service_id] : []); setIsActive(fee.is_active);
    setDialogOpen(true);
  };

  const openEditRule = (rule: FeeRule) => {
    setEditingRule(rule);
    setRuleName(rule.name); setRuleType(rule.rule_type as FeeRuleType);
    setRuleDescription(rule.description || ''); setRuleFeeId(rule.fee_configuration_id);
    setRuleExpression(rule.expression || '');
    setRuleDiscountPercent(String(rule.discount_percent || ''));
    setRuleDiscountAmount(String(rule.discount_amount || ''));
    setRulePriority(String(rule.priority));
    const cond = rule.condition || {};
    setRuleConditionField(cond.field || ''); setRuleConditionOperator(cond.operator || 'gte');
    setRuleConditionValue(cond.value || ''); setRuleActive(rule.is_active);
    setRuleDialogOpen(true);
  };

  const validateRows = (): boolean => {
    let valid = true;
    const updated = { ...feeTypeAmounts };
    for (const ft of feeTypes) {
      const row = updated[ft];
      if (!row) continue;
      const amt = parseFloat(row.amount);
      if (isNaN(amt) || amt <= 0) { updated[ft] = { ...row, error: 'Amount required and > 0' }; valid = false; continue; }
      if (row.calculationType === 'percentage' && (amt < 0 || amt > 100)) { updated[ft] = { ...row, error: 'Percentage must be 0–100' }; valid = false; continue; }
      if (row.calculationType === 'fixed') {
        const min = parseFloat(row.minAmount) || 0;
        const max = row.maxAmount ? parseFloat(row.maxAmount) : null;
        if (min < 0) { updated[ft] = { ...row, error: 'Min must be ≥ 0' }; valid = false; continue; }
        if (max !== null && max < 0) { updated[ft] = { ...row, error: 'Max must be ≥ 0' }; valid = false; continue; }
        if (max !== null && min > max) { updated[ft] = { ...row, error: 'Min must be ≤ Max' }; valid = false; continue; }
        if (max !== null && (amt < min || amt > max)) { updated[ft] = { ...row, error: 'Amount must be between Min and Max' }; valid = false; continue; }
        if (amt < min) { updated[ft] = { ...row, error: 'Amount must be ≥ Min' }; valid = false; continue; }
      }
      updated[ft] = { ...row, error: undefined };
    }
    setFeeTypeAmounts(updated);
    return valid;
  };

  const handleSave = async () => {
    if (!name.trim() || feeTypes.length === 0) { toast.error('Name and at least one fee type are required'); return; }
    if (!validateRows()) { toast.error('Fix amount errors before saving'); return; }
    setSaving(true);
    const basePayload: any = {
      currency,
      sector_id: sectorId || null, sub_sector_id: subSectorId || null,
      category_id: categoryId || null, is_active: isActive,
      regulator_id: activeRegulatorId || null,
      calculation_expression: null,
    };

    const buildRow = (ft: string, svcId: string | null) => {
      const row = feeTypeAmounts[ft];
      return {
        ...basePayload, name: name.trim(), fee_type: ft, service_id: svcId,
        amount: parseFloat(row.amount), calculation_type: row.calculationType,
        min_amount: parseFloat(row.minAmount) || 0,
        max_amount: row.maxAmount ? parseFloat(row.maxAmount) : null,
      };
    };

    // Expand fee types × services. When no service is selected, write a single
    // row per fee type with service_id=null (pre-licensee scope).
    const serviceTargets: (string | null)[] = serviceIds.length > 0 ? serviceIds : [null];
    const allRows: any[] = [];
    feeTypes.forEach(ft => {
      serviceTargets.forEach(svc => allRows.push(buildRow(ft, svc)));
    });

    if (editing) {
      // Update the existing row with the first (fee type, service) combo
      const [firstRow, ...rest] = allRows;
      const { error: updateErr } = await supabase.from('fee_configurations' as any).update(firstRow).eq('id', editing.id);
      if (updateErr) { toast.error(updateErr.message); setSaving(false); return; }
      if (rest.length > 0) {
        const { error: insertErr } = await supabase.from('fee_configurations' as any).insert(rest);
        if (insertErr) { toast.error(insertErr.message); setSaving(false); return; }
      }
      toast.success(`${allRows.length} fee configuration(s) saved`);
    } else {
      const { error } = await supabase.from('fee_configurations' as any).insert(allRows);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success(`${allRows.length} fee configuration(s) created`);
    }
    setSaving(false); setDialogOpen(false); resetForm(); loadFees();
  };

  const handleSaveRule = async () => {
    if (!ruleName.trim() || !ruleFeeId) { toast.error('Name and fee configuration are required'); return; }
    setSaving(true);
    const payload: any = {
      fee_configuration_id: ruleFeeId, rule_type: ruleType, name: ruleName.trim(),
      description: ruleDescription || null,
      condition: { field: ruleConditionField, operator: ruleConditionOperator, value: ruleConditionValue },
      expression: ruleExpression || null,
      discount_percent: parseFloat(ruleDiscountPercent) || 0,
      discount_amount: parseFloat(ruleDiscountAmount) || 0,
      priority: parseInt(rulePriority) || 0, is_active: ruleActive,
    };
    if (editingRule) {
      const { error } = await supabase.from('fee_rules' as any).update(payload).eq('id', editingRule.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Rule updated');
    } else {
      const { error } = await supabase.from('fee_rules' as any).insert(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Rule created');
    }
    setSaving(false); setRuleDialogOpen(false); resetRuleForm(); loadRules();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('fee_configurations' as any).delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Fee deleted'); loadFees();
  };

  const handleDeleteRule = async (id: string) => {
    const { error } = await supabase.from('fee_rules' as any).delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Rule deleted'); loadRules();
  };

  const getSectorName = (id: string | null) => sectors.find(s => s.id === id)?.name || '—';
  const getSubSectorName = (id: string | null) => subSectors.find(s => s.id === id)?.name || '—';
  const getCategoryName = (id: string | null) => categories.find(c => c.id === id)?.name || '—';
  const getServiceName = (id: string | null) => services.find(s => s.id === id)?.name || '—';
  const getFeeName = (id: string) => fees.find(f => f.id === id)?.name || '—';
  const filteredSubSectors = subSectors.filter(s => s.sector_id === sectorId);
  const filteredCategories = categories.filter(c => c.sub_sector_id === subSectorId);
  const filteredServices = services.filter(s => s.sub_sector_id === subSectorId);

  const ruleTypeIcon = (type: string) => {
    switch (type) {
      case 'calculation': return <Calculator className="h-4 w-4" />;
      case 'exemption': return <ShieldOff className="h-4 w-4" />;
      case 'discount': return <Percent className="h-4 w-4" />;
      default: return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Fee Management"
          description="Configure fees, dynamic calculation rules, exemptions, and discounts."
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10"><DollarSign className="h-5 w-5 text-primary" /></div>
                <div>
                  <p className="text-2xl font-bold">{fees.length}</p>
                  <p className="text-sm text-muted-foreground">Fee Configs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10"><Calculator className="h-5 w-5 text-primary" /></div>
                <div>
                  <p className="text-2xl font-bold">{rules.filter(r => r.rule_type === 'calculation').length}</p>
                  <p className="text-sm text-muted-foreground">Calc Rules</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10"><ShieldOff className="h-5 w-5 text-primary" /></div>
                <div>
                  <p className="text-2xl font-bold">{rules.filter(r => r.rule_type === 'exemption').length}</p>
                  <p className="text-sm text-muted-foreground">Exemptions</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10"><Percent className="h-5 w-5 text-primary" /></div>
                <div>
                  <p className="text-2xl font-bold">{rules.filter(r => r.rule_type === 'discount').length}</p>
                  <p className="text-sm text-muted-foreground">Discounts</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="configurations">Fee Configurations</TabsTrigger>
            <TabsTrigger value="rules">Rules & Exemptions</TabsTrigger>
            <TabsTrigger value="fee-types">Fee Types</TabsTrigger>
          </TabsList>

          <TabsContent value="configurations" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) { resetForm(); setTimeout(() => { document.body.style.pointerEvents = ''; }, 100); } }}>
                <DialogTrigger asChild>
                  <Button><PlusCircle className="h-4 w-4 mr-2" />Add Fee</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>{editing ? 'Edit Fee' : 'New Fee Configuration'}</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Fee Name *</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Application Fee" />
                      </div>
                      <div className="space-y-2">
                        <Label>Fee Type(s) *</Label>
                        <MultiSelect
                          options={feeTypesData
                            .filter(ft => ft.status === 'active')
                            .map(ft => ({ value: ft.name, label: ft.name + (ft.code ? ` (${ft.code})` : '') }))}
                          selected={feeTypes}
                          onChange={handleFeeTypesChange}
                          placeholder="Select fee types..."
                          withinDialog
                        />
                      </div>
                    </div>

                    {/* Currency */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Currency</Label>
                        <Select value={currency} onValueChange={setCurrency}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['USD','EUR','GBP','LSL','ZAR','INR'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Per-fee-type amount rows */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Fee Type Amounts</Label>
                      {legacyNote && (
                        <div className="flex items-start gap-2 p-2 rounded-md bg-accent/50 border border-border text-xs text-muted-foreground">
                          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span>Legacy record: values were copied to all rows. Adjust each row individually as needed.</span>
                        </div>
                      )}
                      {feeTypes.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4 border rounded-md bg-muted/20">
                          Select one or more fee types above to enter amounts.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {feeTypes.map(ft => {
                            const row = feeTypeAmounts[ft];
                            if (!row) return null;
                            const ftData = feeTypesData.find(d => d.name === ft);
                            const label = ftData ? ftData.name + (ftData.code ? ` (${ftData.code})` : '') : ft;
                            return (
                              <div key={ft} className={`border rounded-lg p-3 space-y-2 ${row.error ? 'border-destructive bg-destructive/5' : 'bg-muted/20'}`}>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium">{label}</span>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeFeeTypeRow(ft)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                                <div className="grid grid-cols-4 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Calc Type</Label>
                                    <Select value={row.calculationType} onValueChange={v => updateFeeTypeRow(ft, 'calculationType', v)}>
                                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="fixed">Fixed</SelectItem>
                                        <SelectItem value="percentage">Percentage</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">{row.calculationType === 'percentage' ? '% *' : 'Amount *'}</Label>
                                    <Input className="h-8 text-xs" type="number" step="0.01" value={row.amount}
                                      onChange={e => updateFeeTypeRow(ft, 'amount', e.target.value)} placeholder="0.00" />
                                  </div>
                                  {row.calculationType === 'fixed' && (
                                    <>
                                      <div className="space-y-1">
                                        <Label className="text-xs">Min</Label>
                                        <Input className="h-8 text-xs" type="number" step="0.01" value={row.minAmount}
                                          onChange={e => updateFeeTypeRow(ft, 'minAmount', e.target.value)} placeholder="0" />
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs">Max</Label>
                                        <Input className="h-8 text-xs" type="number" step="0.01" value={row.maxAmount}
                                          onChange={e => updateFeeTypeRow(ft, 'maxAmount', e.target.value)} placeholder="No cap" />
                                      </div>
                                    </>
                                  )}
                                </div>
                                {row.error && <p className="text-xs text-destructive">{row.error}</p>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Sector</Label>
                        <Select value={sectorId} onValueChange={v => { setSectorId(v); setSubSectorId(''); setCategoryId(''); setServiceIds([]); }}>
                          <SelectTrigger><SelectValue placeholder="All sectors" /></SelectTrigger>
                          <SelectContent>
                            {sectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Sub-Sector</Label>
                        <Select value={subSectorId} onValueChange={v => { setSubSectorId(v); setCategoryId(''); setServiceIds([]); }} disabled={!sectorId}>
                          <SelectTrigger><SelectValue placeholder="All sub-sectors" /></SelectTrigger>
                          <SelectContent>
                            {filteredSubSectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Select value={categoryId} onValueChange={setCategoryId} disabled={!subSectorId}>
                          <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
                          <SelectContent>
                            {filteredCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Services</Label>
                        <MultiSelect
                          options={services.map(s => ({ value: s.id, label: s.name }))}
                          selected={serviceIds}
                          onChange={setServiceIds}
                          placeholder="None (applies to pre-licensee)"
                          withinDialog
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={isActive} onCheckedChange={setIsActive} />
                      <Label>Active</Label>
                    </div>
                    <Button onClick={handleSave} disabled={saving} className="w-full">
                      {saving ? 'Saving...' : editing ? 'Update Fee' : 'Create Fee'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Calculation</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Sector</TableHead>
                          <TableHead>Sub-Sector</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Service</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fees.length === 0 ? (
                          <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No fees configured</TableCell></TableRow>
                        ) : fees.map(fee => (
                          <TableRow key={fee.id}>
                            <TableCell className="font-medium">{fee.name}</TableCell>
                            <TableCell><Badge variant="outline">{fee.fee_type}</Badge></TableCell>
                            <TableCell><Badge variant="secondary" className="text-xs">{CALCULATION_TYPE_LABELS[fee.calculation_type] || 'Fixed'}</Badge></TableCell>
                            <TableCell className="font-mono">
                              {fee.calculation_type === 'percentage' ? `${fee.amount}%` : `${fee.currency} ${Number(fee.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{getSectorName(fee.sector_id)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{getSubSectorName(fee.sub_sector_id)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{getCategoryName(fee.category_id)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{getServiceName(fee.service_id)}</TableCell>
                            <TableCell><Badge variant={fee.is_active ? 'default' : 'secondary'}>{fee.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                            <TableCell className="text-right">
                              <RowActionsMenu dropdownModal={false} actions={[
                                { label: 'Edit', icon: Pencil, onClick: () => openEdit(fee) },
                                { label: 'Delete', icon: Trash2, onClick: () => handleDelete(fee.id), destructive: true, separator: true },
                              ]} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rules" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={ruleDialogOpen} onOpenChange={(v) => { setRuleDialogOpen(v); if (!v) { resetRuleForm(); setTimeout(() => { document.body.style.pointerEvents = ''; }, 100); } }}>
                <DialogTrigger asChild>
                  <Button><PlusCircle className="h-4 w-4 mr-2" />Add Rule</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>{editingRule ? 'Edit Rule' : 'New Fee Rule'}</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Fee Configuration *</Label>
                      <Select value={ruleFeeId} onValueChange={setRuleFeeId}>
                        <SelectTrigger><SelectValue placeholder="Select fee..." /></SelectTrigger>
                        <SelectContent>
                          {fees.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Rule Name *</Label>
                        <Input value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder="e.g. High turnover surcharge" />
                      </div>
                      <div className="space-y-2">
                        <Label>Rule Type</Label>
                        <Select value={ruleType} onValueChange={v => setRuleType(v as FeeRuleType)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(FEE_RULE_TYPE_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea value={ruleDescription} onChange={e => setRuleDescription(e.target.value)} placeholder="When this rule applies..." />
                    </div>

                    <Card className="border-dashed">
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Condition</CardTitle><CardDescription className="text-xs">When should this rule trigger?</CardDescription></CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          <Input placeholder="Field name" value={ruleConditionField} onChange={e => setRuleConditionField(e.target.value)} />
                          <Select value={ruleConditionOperator} onValueChange={setRuleConditionOperator}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="eq">Equals</SelectItem>
                              <SelectItem value="gte">≥</SelectItem>
                              <SelectItem value="lte">≤</SelectItem>
                              <SelectItem value="gt">&gt;</SelectItem>
                              <SelectItem value="lt">&lt;</SelectItem>
                              <SelectItem value="in">In list</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input placeholder="Value" value={ruleConditionValue} onChange={e => setRuleConditionValue(e.target.value)} />
                        </div>
                      </CardContent>
                    </Card>

                    {ruleType === 'calculation' && (
                      <div className="space-y-2">
                        <Label>Expression</Label>
                        <Input value={ruleExpression} onChange={e => setRuleExpression(e.target.value)} placeholder="{turnover} * 0.005" className="font-mono" />
                      </div>
                    )}
                    {(ruleType === 'discount' || ruleType === 'exemption') && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Discount %</Label>
                          <Input type="number" value={ruleDiscountPercent} onChange={e => setRuleDiscountPercent(e.target.value)} placeholder="0" />
                        </div>
                        <div className="space-y-2">
                          <Label>Discount Amount</Label>
                          <Input type="number" value={ruleDiscountAmount} onChange={e => setRuleDiscountAmount(e.target.value)} placeholder="0" />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Priority</Label>
                        <Input type="number" value={rulePriority} onChange={e => setRulePriority(e.target.value)} />
                      </div>
                      <div className="flex items-center gap-2 pt-6">
                        <Switch checked={ruleActive} onCheckedChange={setRuleActive} />
                        <Label>Active</Label>
                      </div>
                    </div>
                    <Button onClick={handleSaveRule} disabled={saving} className="w-full">
                      {saving ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Fee</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Effect</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No rules configured</TableCell></TableRow>
                    ) : rules.map(rule => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">{rule.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1">
                            {ruleTypeIcon(rule.rule_type)}
                            {FEE_RULE_TYPE_LABELS[rule.rule_type as FeeRuleType] || rule.rule_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{getFeeName(rule.fee_configuration_id)}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {rule.condition?.field ? `${rule.condition.field} ${rule.condition.operator} ${rule.condition.value}` : '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {rule.rule_type === 'calculation' && rule.expression ? <span className="font-mono text-xs">{rule.expression}</span> : null}
                          {rule.discount_percent > 0 && <span>{rule.discount_percent}% off</span>}
                          {rule.discount_amount > 0 && <span>-{rule.discount_amount}</span>}
                          {rule.rule_type === 'exemption' && rule.discount_percent === 100 ? <span className="text-destructive">Full exemption</span> : null}
                        </TableCell>
                        <TableCell>{rule.priority}</TableCell>
                        <TableCell><Badge variant={rule.is_active ? 'default' : 'secondary'}>{rule.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                        <TableCell className="text-right">
                          <RowActionsMenu actions={[
                            { label: 'Edit', icon: Pencil, onClick: () => openEditRule(rule) },
                            { label: 'Delete', icon: Trash2, onClick: () => handleDeleteRule(rule.id), destructive: true, separator: true },
                          ]} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fee-types" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={ftDialogOpen} onOpenChange={(v) => { setFtDialogOpen(v); if (!v) { resetFtForm(); setTimeout(() => { document.body.style.pointerEvents = ''; }, 100); } }}>
                <DialogTrigger asChild>
                  <Button><PlusCircle className="h-4 w-4 mr-2" />Add Fee Type</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>{ftEditing ? 'Edit Fee Type' : 'New Fee Type'}</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Name *</Label>
                      <Input value={ftName} onChange={e => setFtName(e.target.value)} placeholder="e.g. Application Fee" />
                    </div>
                    <div className="space-y-2">
                      <Label>Code</Label>
                      <Input value={ftCode} onChange={e => setFtCode(e.target.value)} placeholder="e.g. APP_FEE (optional)" />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={ftStatus} onValueChange={setFtStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleSaveFt} disabled={saving} className="w-full">
                      {saving ? 'Saving...' : ftEditing ? 'Update' : 'Create'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feeTypesData.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No fee types configured</TableCell></TableRow>
                    ) : feeTypesData.map(ft => (
                      <TableRow key={ft.id}>
                        <TableCell className="font-medium">{ft.name}</TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">{ft.code || '—'}</TableCell>
                        <TableCell><Badge variant={ft.status === 'active' ? 'default' : 'secondary'}>{ft.status === 'active' ? 'Active' : 'Inactive'}</Badge></TableCell>
                        <TableCell className="text-right">
                          <RowActionsMenu actions={[
                            { label: 'Edit', icon: Pencil, onClick: () => openEditFt(ft) },
                            { label: 'Delete', icon: Trash2, onClick: () => handleDeleteFt(ft.id), destructive: true, separator: true },
                          ]} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

