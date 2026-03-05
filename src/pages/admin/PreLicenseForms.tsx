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
import { categories } from '@/data/sectorData';

interface FormEntry {
  id: string;
  name: string;
  category: string;
  formType: string;
  status: 'draft' | 'published' | 'archived';
  createdDate: string;
}

const mockForms: FormEntry[] = [
  { id: '1', name: 'Life Insurance Application', category: 'Life Insurance', formType: 'Pre-License', status: 'published', createdDate: '2026-02-15' },
  { id: '2', name: 'General Insurance Registration', category: 'General Insurance', formType: 'Pre-License', status: 'draft', createdDate: '2026-02-20' },
  { id: '3', name: 'Cooperative License Form', category: 'Credit Union', formType: 'Pre-License', status: 'published', createdDate: '2026-03-01' },
  { id: '4', name: 'Broker Registration Form', category: 'Insurance Broker', formType: 'Pre-License', status: 'archived', createdDate: '2026-01-10' },
];

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  published: 'default',
  draft: 'secondary',
  archived: 'outline',
};

export default function PreLicenseForms() {
  const navigate = useNavigate();
  const [searchName, setSearchName] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const filtered = useMemo(() => {
    return mockForms.filter((f) => {
      if (searchName && !f.name.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (filterCategory !== 'all' && f.category !== filterCategory) return false;
      if (filterStatus !== 'all' && f.status !== filterStatus) return false;
      return true;
    });
  }, [searchName, filterCategory, filterStatus]);

  const uniqueCategories = [...new Set(mockForms.map((f) => f.category))];

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

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by form name..."
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {uniqueCategories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
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

        {/* Table */}
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
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No forms found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((form) => (
                    <TableRow key={form.id}>
                      <TableCell className="font-medium">{form.name}</TableCell>
                      <TableCell>{form.category}</TableCell>
                      <TableCell>{form.formType}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[form.status]}>{form.status}</Badge>
                      </TableCell>
                      <TableCell>{form.createdDate}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="View">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Edit"
                            onClick={() => navigate(`/admin/forms/create?type=pre_license&id=${form.id}`)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Delete">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
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
