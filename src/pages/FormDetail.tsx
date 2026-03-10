import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useForm as useFormDetail } from '@/hooks/useForms';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import type { FormSection } from '@/types/formBuilder';

export default function FormDetail() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const { data: dbForm, isLoading } = useFormDetail(formId || null);

  const sections = useMemo(() => {
    if (!dbForm?.rows) return [];
    return dbForm.rows as unknown as FormSection[];
  }, [dbForm]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!dbForm) {
    return (
      <DashboardLayout>
        <div className="space-y-6 max-w-3xl">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Form Not Found</h1>
              <p className="text-muted-foreground">This form does not exist.</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{dbForm.name}</h1>
            <p className="text-sm text-muted-foreground">{dbForm.sector} · {dbForm.sub_sector}</p>
          </div>
        </div>

        <FormRenderer
          formName={dbForm.name}
          sections={sections}
          onSaveDraft={(data) => {
            toast.success('Draft saved!');
          }}
          onSubmit={(data) => {
            toast.success('Form submitted!');
            navigate(-1);
          }}
        />
      </div>
    </DashboardLayout>
  );
}
