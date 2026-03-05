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

interface FormEntry {
  id: string;
  name: string;
  service: string;
  formType: string;
  status: 'draft' | 'published' | 'archived';
  createdDate: string;
}

const mockForms: FormEntry[] = [
  { id: '1', name: 'Annual Return Filing', service: 'Annual Returns', formType: 'Post-License', status: 'published', createdDate: '2026-02-10' },
  { id: '2', name: 'License Renewal Form', service: 'License Renewal', formType: 'Post-License', status: 'draft', createdDate: '2026-02-18' },
  { id: '3', name: 'Ownership Change Request', service: 'Change of Ownership', formType: 'Post-License', status: 'published', createdDate: '2026-03-02' },
  { id: '4', name: 'Name Amendment Application', service: 'Name Change', formType: 'Post-License', status: 'archived', createdDate: '2026-01-22' },
];

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  published: 'default',
  draft: 'secondary',
  archived: 'outline',
};

export default function PostLicenseForms() {
  const navigate = useNavigate();
  const [searchName, setSearchName] = useState('');
  const [filterService, setFilterService] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const filtered = useMemo(() => {
    return mockForms.filter((f) => {
      if (searchName && !f.name.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (filterService !== 'all' && f.service !== filterService) return false;
      if (filterStatus !== 'all' && f.status !== filterStatus) return false;
      return true;
    });
  }, [searchName, filterService, filterStatus]);

  const uniqueServices = [...new Set(mockForms.map((f) => f.service))];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Post-License Forms"
          description="Manage all post-license service forms."
          actions={
            <Button onClick={() => navigate('/admin/forms/create?type=post_license')}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Add Post-License Form
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
              <Select value={filterService} onValueChange={setFilterService}>
                <SelectTrigger>
                  <SelectValue placeholder="All Services" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Services</SelectItem>
                  {uniqueServices.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
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
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No forms found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((form) => (
                    <TableRow key={form.id}>
                      <TableCell className="font-medium">{form.name}</TableCell>
                      <TableCell>{form.service}</TableCell>
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
                            onClick={() => navigate(`/admin/forms/create?type=post_license&id=${form.id}`)}>
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
