import { useState } from 'react';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChangeHistoryDrawer } from './ChangeHistoryDrawer';

interface Props {
  entityType: string;
  entityId: string;
  title?: string;
  label?: string;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'ghost' | 'secondary';
}

/**
 * Small reusable trigger that opens the unified ChangeHistoryDrawer
 * (audit_logs + rule_overrides) for a single entity. Drop into the
 * `actions` slot of any detail page's PageHeader.
 */
export function HistoryButton({
  entityType, entityId,
  title, label = 'History',
  size = 'sm', variant = 'outline',
}: Props) {
  const [open, setOpen] = useState(false);
  if (!entityId) return null;
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        <History className="h-4 w-4 mr-2" />
        {label}
      </Button>
      <ChangeHistoryDrawer
        open={open}
        onOpenChange={setOpen}
        entityType={entityType}
        entityId={entityId}
        title={title}
      />
    </>
  );
}

export default HistoryButton;
