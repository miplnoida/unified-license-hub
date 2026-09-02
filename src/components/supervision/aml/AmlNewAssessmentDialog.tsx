/**
 * Start a new AML/CFT risk assessment for a supervised entity.
 *
 * The entity list is the supervised portfolio the officer can already see, so
 * no entity is ever invented here; the assessment itself is created by the
 * governed supervisory operation on the active AML/CFT methodology.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AmlActionDialog } from '@/components/supervision/aml/AmlActionDialog';
import { useCreateAmlAssessment } from '@/hooks/useAmlLifecycle';
import { useAmlPortfolio } from '@/hooks/useAmlSupervision';

const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

interface Props {
  entityId?: string;
  label?: string;
  size?: 'sm' | 'default';
  variant?: 'default' | 'outline';
}

export function AmlNewAssessmentDialog({ entityId, label = 'New AML/CFT assessment', size = 'default', variant = 'default' }: Props) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const create = useCreateAmlAssessment();
  const { data: portfolio } = useAmlPortfolio(300);

  const entityOptions = useMemo(
    () =>
      (portfolio ?? [])
        .map((r) => ({ value: r.entity_id, label: r.entity_name || r.entity_id }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [portfolio],
  );

  const prior = useMemo(
    () => (portfolio ?? []).find((r) => r.entity_id === entityId)?.last_assessment_id ?? null,
    [portfolio, entityId],
  );

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <AmlActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Start an AML/CFT risk assessment"
        description="The assessment is created in draft against the active AML/CFT methodology, ready for its risk and control ratings."
        fields={[
          ...(entityId
            ? []
            : [
                {
                  name: 'entity_id',
                  label: 'Supervised entity',
                  kind: 'select' as const,
                  required: true,
                  options: entityOptions,
                },
              ]),
          {
            name: 'assessment_type',
            label: 'Assessment type',
            kind: 'select',
            required: true,
            defaultValue: 'PERIODIC',
            options: [
              { value: 'PERIODIC', label: 'Periodic' },
              { value: 'INITIAL_BASELINE', label: 'Initial baseline' },
              { value: 'FOLLOW_UP', label: 'Follow-up' },
              { value: 'EVENT_DRIVEN', label: 'Event driven' },
            ],
          },
          {
            name: 'trigger_type',
            label: 'Trigger',
            kind: 'select',
            defaultValue: 'PERIODIC',
            options: [
              { value: 'PERIODIC', label: 'Periodic cycle' },
              { value: 'REASSESSMENT', label: 'Reassessment requirement' },
              { value: 'EVENT', label: 'Event or intelligence' },
            ],
          },
          { name: 'period_start', label: 'Review period from', kind: 'date', required: true, defaultValue: isoDaysAgo(365) },
          { name: 'period_end', label: 'Review period to', kind: 'date', required: true, defaultValue: isoDaysAgo(1) },
          { name: 'summary', label: 'Scope and summary', kind: 'textarea', required: true },
        ]}
        submitLabel="Create assessment"
        onSubmit={async (v) => {
          const result: any = await create.mutateAsync({
            entityId: entityId ?? v.entity_id,
            assessmentType: v.assessment_type,
            triggerType: v.trigger_type,
            periodStart: v.period_start || null,
            periodEnd: v.period_end || null,
            summary: v.summary,
            supersedesId: v.assessment_type === 'FOLLOW_UP' ? prior : null,
          });
          const id = result?.id ?? null;
          toast.success('AML/CFT assessment created in draft.');
          if (id) navigate(`/supervision/aml/assessments/${id}`);
          return result;
        }}
      />
    </>
  );
}
