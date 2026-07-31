import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { CATEGORIES } from '@/pages/correspondence/seed';
import { useClassifyCorrespondence } from '@/hooks/useCorrespondence';

export function ClassificationPanel({
  threadId,
  category,
  priority,
  tags = [],
}: {
  threadId: string;
  category: string;
  priority: string;
  tags?: string[];
}) {
  const [cat, setCat] = useState(category);
  const [pri, setPri] = useState(priority);
  const [tagText, setTagText] = useState(tags.join(', '));
  const classify = useClassifyCorrespondence(threadId);

  const save = async () => {
    try {
      await classify.mutateAsync({
        thread_id: threadId,
        category: cat,
        priority: pri,
        tags: tagText.split(',').map((t) => t.trim()).filter(Boolean),
      });
      toast.success('Classification saved');
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not save classification');
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Category</Label>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              {!CATEGORIES.includes(cat) && <SelectItem value={cat}>{cat}</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Priority</Label>
          <Select value={pri} onValueChange={setPri}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs">Tags (comma separated)</Label>
        <Input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="prudential, extension" />
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline">Current: {category}</Badge>
        <Badge variant="outline">Priority: {priority}</Badge>
        <Button data-rbac="settings.edit" size="sm" variant="secondary" className="ml-auto" onClick={save} disabled={classify.isPending}>
          {classify.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Save classification
        </Button>
      </div>
    </div>
  );
}
