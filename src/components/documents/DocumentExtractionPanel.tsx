import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Brain, Loader2, RefreshCw, FileText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const PRESETS = [
  { value: 'generic', label: 'Generic extraction' },
  { value: 'financial_statement', label: 'Financial statement' },
  { value: 'id_document', label: 'ID / KYC document' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'invoice', label: 'Invoice / receipt' },
  { value: 'compliance_return', label: 'Compliance return' },
];

interface Props {
  fileUploadId: string;
  fileName?: string;
  sourceType?: string;
  sourceId?: string;
}

export function DocumentExtractionPanel({ fileUploadId, fileName, sourceType, sourceId }: Props) {
  const qc = useQueryClient();
  const [preset, setPreset] = useState('generic');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['document_extractions', fileUploadId],
    queryFn: async () => {
      const { data, error } = await (supabase.from('document_extractions') as any)
        .select('id, preset, status, extracted, error, model, created_at, updated_at')
        .eq('file_upload_id', fileUploadId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('document-extract', {
        body: { file_upload_id: fileUploadId, preset, source_type: sourceType, source_id: sourceId },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || 'extraction failed');
      return data;
    },
    onSuccess: () => {
      toast.success('Extraction complete');
      qc.invalidateQueries({ queryKey: ['document_extractions', fileUploadId] });
    },
    onError: (e: any) => toast.error(e.message || 'Extraction failed'),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="h-4 w-4" /> Document intelligence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {fileName && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <FileText className="h-3 w-3" /> {fileName}
          </div>
        )}
        <div className="flex gap-2">
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Extract
          </Button>
        </div>

        {isLoading ? (
          <div className="p-4 flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            No extractions yet. Pick a preset and click Extract.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r: any) => (
              <div key={r.id} className="border rounded p-3">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Badge variant="outline">{r.preset}</Badge>
                  <Badge variant={r.status === 'completed' ? 'default' : r.status === 'failed' ? 'destructive' : 'secondary'}>
                    {r.status}
                  </Badge>
                  {r.model && <Badge variant="outline" className="text-xs">{r.model}</Badge>}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </span>
                </div>
                {r.error && <div className="text-xs text-destructive mb-2">{r.error}</div>}
                {r.extracted && (
                  <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-96 whitespace-pre-wrap">
                    {JSON.stringify(r.extracted, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
