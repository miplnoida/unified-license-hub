/**
 * Header action for methodology metadata authoring.
 *
 * Authority comes only from `supervisory_methodology_studio_capabilities`. When
 * the server refuses, the control stays visible but disabled and carries the
 * server's own sentence, so an officer learns why instead of losing the button.
 * Code, version, origin, ownership and approval status are not editable here.
 */
import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSupervisoryMethodologyStudioCapabilities } from '@/hooks/useSupervisoryMethodologyAdmin';
import { MetadataEditorDialog } from './MetadataEditorDialog';

export function MethodologyMetadataAction({ detail }: { detail: Record<string, any> }) {
  const caps = useSupervisoryMethodologyStudioCapabilities(detail?.id);
  const [open, setOpen] = useState(false);
  const capability = caps.data?.can_edit_metadata;
  const allowed = capability?.allowed === true;

  const button = (
    <Button size="sm" variant="outline" className="gap-1.5" disabled={!allowed} aria-disabled={!allowed}
            onClick={allowed ? () => setOpen(true) : undefined} data-rbac="aml_supervision.manage_config">
      <Pencil className="h-4 w-4" aria-hidden />
      Edit details
    </Button>
  );

  return (
    <>
      {allowed || !capability?.reason ? button : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild><span tabIndex={0}>{button}</span></TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{capability.reason}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {allowed ? (
        <MetadataEditorDialog methodologyId={detail.id} detail={detail} open={open} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
