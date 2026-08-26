/**
 * MC-08 — Governance → AI Governance → Capabilities.
 *
 * The register of every AI capability the regulator has authorised, with its
 * purpose, classification, status, permitted roles, approved model and released
 * instruction version. Status changes go through the governed server operation.
 */
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useAiInstructions, useAiModels, useAiUseCases } from '@/hooks/useAiGovernance';
import {
  ADVISORY_CLASS_LABEL, LIFECYCLE_LABEL, LIFECYCLE_VARIANT, RISK_LABEL, label,
} from '@/lib/aiGovernanceLabels';
import { formatDate } from '@/lib/datetime';

export default function AiUseCases() {
  const { data: useCases = [], isLoading } = useAiUseCases();
  const { data: models = [] } = useAiModels();
  const { data: instructions = [] } = useAiInstructions();

  const modelName = (id: string | null) => {
    const m = models.find((x) => x.id === id);
    return m ? `${m.display_name}${m.model_version ? ` (${m.model_version})` : ''}` : 'Not bound';
  };
  const instructionName = (id: string | null) => {
    const i = instructions.find((x) => x.id === id);
    return i ? `${i.template_code} ${i.version}` : 'Not bound';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="AI Capabilities"
          description="Every AI capability authorised for supervisory use, with its business purpose, classification, status, permitted roles, approved model and released instruction version."
        />

        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Each capability is advisory and requires human review. No capability may change a risk rating,
            transition a case, or take a regulatory decision. A capability that is not approved for production
            cannot run, whatever the interface offers.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Register</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading capabilities…
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Capability</TableHead>
                      <TableHead>Owning area</TableHead>
                      <TableHead>Classification</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Approved model</TableHead>
                      <TableHead>Instruction version</TableHead>
                      <TableHead>Effective</TableHead>
                      <TableHead className="text-right">Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {useCases.map((u) => (
                      <TableRow key={u.code}>
                        <TableCell className="text-sm">
                          <p className="font-medium">{u.label}</p>
                          <p className="font-mono text-xs text-muted-foreground">{u.code}</p>
                        </TableCell>
                        <TableCell className="text-xs">{u.owning_module}</TableCell>
                        <TableCell className="text-xs">
                          <p>{label(ADVISORY_CLASS_LABEL, u.advisory_classification)}</p>
                          <p className="text-muted-foreground">{label(RISK_LABEL, u.risk_classification)}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={LIFECYCLE_VARIANT[u.lifecycle_state] ?? 'outline'}>
                            {label(LIFECYCLE_LABEL, u.lifecycle_state)}
                          </Badge>
                          {u.suspension_reason && (
                            <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">{u.suspension_reason}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{modelName(u.approved_model_id)}</TableCell>
                        <TableCell className="font-mono text-xs">{instructionName(u.approved_instruction_id)}</TableCell>
                        <TableCell className="text-xs">
                          {u.effective_from ? formatDate(u.effective_from) : 'Not set'}
                          {u.effective_to ? ` to ${formatDate(u.effective_to)}` : ''}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link to={`/governance/ai/capabilities/${u.code}`}>Open</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {useCases.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="p-6 text-sm text-muted-foreground">
                          No AI capability is registered.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
