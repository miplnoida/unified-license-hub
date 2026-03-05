import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PlusCircle, Eye, Pencil, Trash2, Search } from 'lucide-react';
import { getStoredForms, deleteForm, updateFormStatus, type StoredForm } from '@/lib/formStorage';
import { toast } from 'sonner';

interface FormEntry {
  id: string;
  name: string;
  category: string;
  formType: string;
  status: 'draft' | 'published' | 'archived';
  createdDate: string;
}

const hardcodedForms: FormEntry[] = [
  { id: 'hc-1', name: 'Life Insurance Application', category: 'Life Insurance', formType: 'Pre-License', status: 'published', createdDate: '2026-02-15' },
  { id: 'hc-2', name: 'General Insurance Registration', category: 'General Insurance', formType: 'Pre-License', status: 'draft', createdDate: '2026-02-20' },
  { id: 'hc-3', name: 'Cooperative License Form', category: 'Credit Union', formType: 'Pre-License', status: 'published', createdDate: '2026-03-01' },
  { id: 'hc-4', name: 'Broker Registration Form', category: 'Insurance Broker', formType: 'Pre-License', status: 'archived', createdDate: '2026-01-10' },
];

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  published: 'default',
  draft: 'secondary',
  archived: 'outline',
};

const statusOptions: Array<{ value: FormEntry['status']; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

function storedToEntry(f: StoredForm): FormEntry {
  return {
    id: f.id,
    name: f.name,
    category: f.category,
    formType: 'Pre-License',
    status: f.status,
    createdDate: f.createdDate,
  };
}

export default function PreLicenseForms() {
  const navigate = useNavigate();
  const [searchName, setSearchName] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [refreshKey, setRefreshKey] = useState(0);

  // Status change dialog state
  const [statusDialog, setStatusDialog] = useState<{ open: boolean; formId: string; formName: string; currentStatus: string; newStatus: FormEntry['status'] }>({
    open: false, formId: '', formName: '', currentStatus: '', newStatus: 'draft',
  });

  // Hardcoded form status overrides (stored in component state for session)
  const [hardcodedStatuses, setHardcodedStatuses] = useState<Record<string, FormEntry['status']>>({});

  const allForms = useMemo(() => {
    const dynamic = getStoredForms()
      .filter((f) => f.formType === 'pre_license')
      .map(storedToEntry);
    const hcWithOverrides = hardcodedForms.map((f) => ({
      ...f,
      status: hardcodedStatuses[f.id] || f.status,
    }));
    return [...hcWithOverrides, ...dynamic];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, hardcodedStatuses]);

  const filtered = useMemo(() => {
    return allForms.filter((f) => {
      if (searchName && !f.name.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (filterCategory !== 'all' && f.category !== filterCategory) return false;
      if (filterStatus !== 'all' && f.status !== filterStatus) return false;
      return true;
    });
  }, [allForms, searchName, filterCategory, filterStatus]);

  const uniqueCategories = [...new Set(allForms.map((f) => f.category).filter(Boolean))];

  const handleDelete = (id: string) => {
    if (id.startsWith('hc-')) {
      toast.error('Cannot delete sample forms.');
      return;
    }
    deleteForm(id);
    setRefreshKey((k) => k + 1);
    toast.success('Form deleted.');
  };

  const handleView = (formId: string) => {
    navigate(`/admin/forms/create?type=pre_license&id=${formId}&mode=view`);
  };

  const requestStatusChange = (form: FormEntry, newStatus: FormEntry['status']) => {
    if (newStatus === form.status) return;
    setStatusDialog({
      open: true,
      formId: form.id,
      formName: form.name,
      currentStatus: form.status,
      newStatus,
    });
  };

  const confirmStatusChange = () => {
    const { formId, newStatus } = statusDialog;
    if (formId.startsWith('hc-')) {
      setHardcodedStatuses((prev) => ({ ...prev, [formId]: newStatus }));
    } else {
      updateFormStatus(formId, newStatus);
      setRefreshKey((k) => k + 1);
    }
    toast.success(`Form status changed to "${newStatus}".`);
    setStatusDialog((prev) => ({ ...prev, open: false }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Pre-License Forms"
          description="Manage all pre-license application forms."
          actions={
            <Button onClick={() => navigate('/admin/forms/create?type=pre_license')}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Add Pre-License Form
            </Button>
          }
        />

        <Card>
          <CardContent className="pt-6">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by form name..." value={searchName} onChange={(e) => setSearchName(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {uniqueCategories.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Form Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Form Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No forms found.</TableCell>
                  </TableRow>
                ) : (
                  filtered.map((form) => (
                    <TableRow key={form.id}>
                      <TableCell className="font-medium">{form.name}</TableCell>
                      <TableCell>{form.category}</TableCell>
                      <TableCell>{form.formType}</TableCell>
                      <TableCell>
                        <Select
                          value={form.status}
                          onValueChange={(val) => requestStatusChange(form, val as FormEntry['status'])}
                        >
                          <SelectTrigger className="w-[130px] h-8 border-0 bg-transparent p-0 shadow-none focus:ring-0 [&>svg]:ml-1">
                            <Badge variant={statusVariant[form.status]} className="cursor-pointer capitalize">
                              {form.status}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>{form.createdDate}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="View" onClick={() => handleView(form.id)}><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Edit" onClick={() => navigate(`/admin/forms/create?type=pre_license&id=${form.id}`)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(form.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Status Change Confirmation Dialog */}
      <AlertDialog open={statusDialog.open} onOpenChange={(open) => setStatusDialog((prev) => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Form Status</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to change the status of <strong>"{statusDialog.formName}"</strong> from{' '}
              <Badge variant={statusVariant[statusDialog.currentStatus]} className="capitalize mx-1">{statusDialog.currentStatus}</Badge>
              to{' '}
              <Badge variant={statusVariant[statusDialog.newStatus]} className="capitalize mx-1">{statusDialog.newStatus}</Badge>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStatusChange}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
