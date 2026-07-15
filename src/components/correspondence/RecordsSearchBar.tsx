import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';
import { CATEGORIES } from '@/pages/correspondence/seed';

export interface RecordsFilters {
  query: string;
  category: string;
  status: string;
  channel: string;
}

export function RecordsSearchBar({ value, onChange }: { value: RecordsFilters; onChange: (v: RecordsFilters) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[240px]">
        <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search subject, reference, sender, tags…"
          value={value.query}
          onChange={(e) => onChange({ ...value, query: e.target.value })}
        />
      </div>
      <Select value={value.category} onValueChange={(v) => onChange({ ...value, category: v })}>
        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Category" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={value.status} onValueChange={(v) => onChange({ ...value, status: v })}>
        <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="received">Received</SelectItem>
          <SelectItem value="classified">Classified</SelectItem>
          <SelectItem value="assigned">Assigned</SelectItem>
          <SelectItem value="in_review">In review</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="responded">Responded</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
        </SelectContent>
      </Select>
      <Select value={value.channel} onValueChange={(v) => onChange({ ...value, channel: v })}>
        <SelectTrigger className="w-[140px]"><SelectValue placeholder="Channel" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All channels</SelectItem>
          <SelectItem value="email">Email</SelectItem>
          <SelectItem value="letter">Letter</SelectItem>
          <SelectItem value="portal">Portal</SelectItem>
          <SelectItem value="fax">Fax</SelectItem>
          <SelectItem value="sms">SMS</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
