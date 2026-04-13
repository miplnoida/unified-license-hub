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
import { useRegulator } from '@/contexts/RegulatorContext';
import { toast } from 'sonner';
import { CALCULATION_TYPE_LABELS, CalculationType, FEE_RULE_TYPE_LABELS, FeeRuleType } from '@/types/platform';
import { PlusCircle, Pencil, Trash2, Loader2, Calculator, ShieldOff, Percent, DollarSign, Info } from 'lucide-react';

interface FeeConfig {
  id: string;
  regulator_id: string | null;
  sector_id: string | null;
  sub_sector_id: string | null;
  category_id: string | null;
  service_id: string | null;
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
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [sectorId, setSectorId] = useState('');
  const [subSectorId, setSubSectorId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [calculationType, setCalculationType] = useState<CalculationType>('fixed');
  const [calculationExpression, setCalculationExpression] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

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
    setName(''); setFeeTypesSelected([]); setAmount(''); setCurrency('USD');
    setSectorId(''); setSubSectorId(''); setCategoryId(''); setServiceId('');
    setIsActive(true); setEditing(null); setCalculationType('fixed');
    setCalculationExpression(''); setMinAmount(''); setMaxAmount('');
  };

  const resetRuleForm = () => {
    setRuleName(''); setRuleType('calculation'); setRuleDescription('');
    setRuleFeeId(''); setRuleExpression(''); setRuleDiscountPercent('');
    setRuleDiscountAmount(''); setRulePriority('0'); setRuleConditionField('');
    setRuleConditionOperator('gte'); setRuleConditionValue(''); setRuleActive(true);
    setEditingRule(null);
  };

  const openEdit = (fee: FeeConfig) => {
    setEditing(fee);
    setName(fee.name); setFeeTypesSelected([fee.fee_type]); setAmount(String(fee.amount));
    setCurrency(fee.currency); setSectorId(fee.sector_id || '');
    setSubSectorId(fee.sub_sector_id || ''); setCategoryId(fee.category_id || '');
    setServiceId(fee.service_id || ''); setIsActive(fee.is_active);
    setCalculationType(fee.calculation_type || 'fixed');
    setCalculationExpression(fee.calculation_expression || '');
    setMinAmount(String(fee.min_amount || '')); setMaxAmount(String(fee.max_amount || ''));
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

  const handleSave = async () => {
    if (!name.trim() || !amount || feeTypes.length === 0) { toast.error('Name, fee type(s), and amount are required'); return; }
    setSaving(true);
    const basePayload: any = {
      amount: parseFloat(amount), currency,
      sector_id: sectorId || null, sub_sector_id: subSectorId || null,
      category_id: categoryId || null, service_id: serviceId || null, is_active: isActive,
      regulator_id: activeRegulatorId || null,
      calculation_type: calculationType,
      calculation_expression: calculationExpression || null,
      min_amount: parseFloat(minAmount) || 0,
      max_amount: maxAmount ? parseFloat(maxAmount) : null,
    };
    if (editing) {
      // When editing, update with first selected fee type
      const payload = { ...basePayload, name: name.trim(), fee_type: feeTypes[0] };
      const { error } = await supabase.from('fee_configurations' as any).update(payload).eq('id', editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Fee updated');
    } else {
      // When creating, batch-insert one config per selected fee type
      const rows = feeTypes.map(ft => ({ ...basePayload, name: name.trim(), fee_type: ft }));
      const { error } = await supabase.from('fee_configurations' as any).insert(rows);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success(`${rows.length} fee configuration(s) created`);
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
              <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) resetForm(); }}>
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
                          onChange={setFeeTypesSelected}
                          placeholder="Select fee types..."
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Calculation Type</Label>
                        <Select value={calculationType} onValueChange={v => setCalculationType(v as CalculationType)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(CALCULATION_TYPE_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{calculationType === 'percentage' ? 'Percentage (%)' : 'Amount'} *</Label>
                        <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
                      </div>
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

                    {calculationType === 'formula' && (
                      <div className="space-y-2">
                        <Label>Formula Expression</Label>
                        <Textarea value={calculationExpression} onChange={e => setCalculationExpression(e.target.value)}
                          placeholder='{turnover} * 0.01 + 500' className="font-mono text-sm" />
                        <p className="text-xs text-muted-foreground">Use {'{field_name}'} to reference form inputs. Supported: +, -, *, /, Math functions.</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Min Amount</Label>
                        <Input type="number" step="0.01" value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="0" />
                      </div>
                      <div className="space-y-2">
                        <Label>Max Amount (cap)</Label>
                        <Input type="number" step="0.01" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} placeholder="No cap" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Sector</Label>
                        <Select value={sectorId} onValueChange={v => { setSectorId(v); setSubSectorId(''); setCategoryId(''); setServiceId(''); }}>
                          <SelectTrigger><SelectValue placeholder="All sectors" /></SelectTrigger>
                          <SelectContent>
                            {sectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Sub-Sector</Label>
                        <Select value={subSectorId} onValueChange={v => { setSubSectorId(v); setCategoryId(''); setServiceId(''); }} disabled={!sectorId}>
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
                        <Label>Service</Label>
                        <Select value={serviceId} onValueChange={setServiceId} disabled={!subSectorId}>
                          <SelectTrigger><SelectValue placeholder="All services" /></SelectTrigger>
                          <SelectContent>
                            {filteredServices.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Calculation</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Sector</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fees.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No fees configured</TableCell></TableRow>
                      ) : fees.map(fee => (
                        <TableRow key={fee.id}>
                          <TableCell className="font-medium">{fee.name}</TableCell>
                          <TableCell><Badge variant="outline">{fee.fee_type}</Badge></TableCell>
                          <TableCell><Badge variant="secondary" className="text-xs">{CALCULATION_TYPE_LABELS[fee.calculation_type] || 'Fixed'}</Badge></TableCell>
                          <TableCell className="font-mono">
                            {fee.calculation_type === 'percentage' ? `${fee.amount}%` : `${fee.currency} ${Number(fee.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{getSectorName(fee.sector_id)}</TableCell>
                          <TableCell><Badge variant={fee.is_active ? 'default' : 'secondary'}>{fee.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(fee)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(fee.id)}><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rules" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={ruleDialogOpen} onOpenChange={(v) => { setRuleDialogOpen(v); if (!v) resetRuleForm(); }}>
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
                          <Button variant="ghost" size="icon" onClick={() => openEditRule(rule)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteRule(rule.id)}><Trash2 className="h-4 w-4" /></Button>
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
              <Dialog open={ftDialogOpen} onOpenChange={(v) => { setFtDialogOpen(v); if (!v) resetFtForm(); }}>
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
                          <Button variant="ghost" size="icon" onClick={() => openEditFt(ft)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteFt(ft.id)}><Trash2 className="h-4 w-4" /></Button>
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
