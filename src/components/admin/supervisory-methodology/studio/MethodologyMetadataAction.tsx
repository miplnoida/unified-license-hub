/**
 * Header action for methodology metadata authoring. Appears only when
 * `supervisory_methodology_studio_capabilities` allows metadata editing;
 * otherwise the server's refusal is available on the Validation tab.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSupervisoryMethodologyStudioCapabilities } from '@/hooks/useSupervisoryMethodologyAdmin';
import { MetadataEditorDialog } from './MetadataEditorDialog';

export function MethodologyMetadataAction({ detail }: { detail: Record<string, any> }) {
  const caps = useSupervisoryMethodologyStudioCapabilities(detail?.id);
  const [open, setOpen] = useState(false);
  if (!caps.data?.can_edit_metadata?.allowed) return null;

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-rbac="aml_supervision.manage_config">
        Edit details
      </Button>
      <MetadataEditorDialog methodologyId={detail.id} detail={detail} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
