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
import { PlusCircle, Eye, Pencil, Trash2, Search } from 'lucide-react';
import { getStoredForms, deleteForm, type StoredForm } from '@/lib/formStorage';
import { toast } from 'sonner';

interface FormEntry {
  id: string;
  name: string;
  service: string;
  formType: string;
  status: 'draft' | 'published' | 'archived';
  createdDate: string;
}

const hardcodedForms: FormEntry[] = [
  { id: 'hc-1', name: 'Annual Return Filing', service: 'Annual Returns', formType: 'Post-License', status: 'published', createdDate: '2026-02-10' },
  { id: 'hc-2', name: 'License Renewal Form', service: 'License Renewal', formType: 'Post-License', status: 'draft', createdDate: '2026-02-18' },
  { id: 'hc-3', name: 'Ownership Change Request', service: 'Change of Ownership', formType: 'Post-License', status: 'published', createdDate: '2026-03-02' },
  { id: 'hc-4', name: 'Name Amendment Application', service: 'Name Change', formType: 'Post-License', status: 'archived', createdDate: '2026-01-22' },
];

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  published: 'default',
  draft: 'secondary',
  archived: 'outline',
};

function storedToEntry(f: StoredForm): FormEntry {
  return {
    id: f.id,
    name: f.name,
    service: f.service,
    formType: 'Post-License',
    status: f.status,
    createdDate: f.createdDate,
  };
}

export default function PostLicenseForms() {
  const navigate = useNavigate();
  const [searchName, setSearchName] = useState('');
  const [filterService, setFilterService] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [refreshKey, setRefreshKey] = useState(0);

  const allForms = useMemo(() => {
    const dynamic = getStoredForms()
      .filter((f) => f.formType === 'post_license')
      .map(storedToEntry);
    return [...hardcodedForms, ...dynamic];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const filtered = useMemo(() => {
    return allForms.filter((f) => {
      if (searchName && !f.name.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (filterService !== 'all' && f.service !== filterService) return false;
      if (filterStatus !== 'all' && f.status !== filterStatus) return false;
      return true;
    });
  }, [allForms, searchName, filterService, filterStatus]);

  const uniqueServices = [...new Set(allForms.map((f) => f.service).filter(Boolean))];

  const handleDelete = (id: string) => {
    if (id.startsWith('hc-')) {
      toast.error('Cannot delete sample forms.');
      return;
    }
    deleteForm(id);
    setRefreshKey((k) => k + 1);
    toast.success('Form deleted.');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Post-License Forms"
          description="Manage all post-license service forms."
          backHref="/dashboard"
          backLabel="Dashboard"
          actions={
            <Button onClick={() => navigate('/admin/forms/create?type=post_license')}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Add Post-License Form
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
              <Select value={filterService} onValueChange={setFilterService}>
                <SelectTrigger><SelectValue placeholder="All Services" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Services</SelectItem>
                  {uniqueServices.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
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
                  <TableHead>Service</TableHead>
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
                      <TableCell>{form.service}</TableCell>
                      <TableCell>{form.formType}</TableCell>
                      <TableCell><Badge variant={statusVariant[form.status]}>{form.status}</Badge></TableCell>
                      <TableCell>{form.createdDate}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="View"><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Edit" onClick={() => navigate(`/admin/forms/create?type=post_license&id=${form.id}`)}><Pencil className="h-4 w-4" /></Button>
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
    </DashboardLayout>
  );
}
