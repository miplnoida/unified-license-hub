import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { useVersionSections } from '@/hooks/useFormTemplates';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  responseId: string | null;
}

export default function LicenseActionFormViewer({ open, onOpenChange, responseId }: Props) {
  const { data: response, isLoading } = useQuery({
    queryKey: ['form_response', responseId],
    enabled: open && !!responseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_responses')
        .select('id, template_id, version_id, response_data, submitted_at')
        .eq('id', responseId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: template } = useQuery({
    queryKey: ['form_template_name', response?.template_id],
    enabled: !!response?.template_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('form_templates')
        .select('name')
        .eq('id', response!.template_id)
        .maybeSingle();
      return data;
    },
  });

  const { data: sections = [] } = useVersionSections(response?.version_id || null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{template?.name || 'Submitted Internal Form'}</DialogTitle>
          <DialogDescription>
            {response?.submitted_at ? `Submitted ${new Date(response.submitted_at).toLocaleString()}` : ''}
          </DialogDescription>
        </DialogHeader>
        {isLoading || !response ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sections.length === 0 ? (
          <pre className="text-xs bg-muted p-3 rounded max-h-[60vh] overflow-auto">
            {JSON.stringify(response.response_data, null, 2)}
          </pre>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto border rounded-md p-3">
            <FormRenderer
              formName={template?.name || 'Submitted Form'}
              sections={sections}
              initialData={response.response_data || {}}
              onSaveDraft={() => undefined}
              onSubmit={() => undefined}
              readOnly
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
