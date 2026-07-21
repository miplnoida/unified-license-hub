import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { CATEGORIES } from '@/pages/correspondence/seed';
import type { CorrespondencePriority } from '@/pages/correspondence/types';

export function ClassificationPanel({
  category,
  priority,
  autoConfidence = 0.92,
}: {
  category: string;
  priority: CorrespondencePriority;
  autoConfidence?: number;
}) {
  const [cat, setCat] = useState(category);
  const [pri, setPri] = useState<CorrespondencePriority>(priority);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Auto-classified with {(autoConfidence * 100).toFixed(0)}% confidence. You may override below.
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Category</Label>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Priority</Label>
          <Select value={pri} onValueChange={(v) => setPri(v as CorrespondencePriority)}>
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
      <div className="flex items-center gap-2">
        <Badge variant="outline">Original: {category}</Badge>
        <Badge variant="outline">Priority: {priority}</Badge>
        <Button data-rbac="settings.edit" size="sm" variant="secondary" className="ml-auto">Save override</Button>
      </div>
    </div>
  );
}
