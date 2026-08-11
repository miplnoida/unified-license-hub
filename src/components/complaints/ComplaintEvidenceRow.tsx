import { complaintPriorityLabel } from '@/lib/complaintStatus';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, FileText, ExternalLink, Printer, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { slaBucketFromRow, slaStatusLabel, slaStatusVariant } from '@/lib/complaintsSla';
import { formatDateTime } from '@/lib/datetime';

interface Props {
  complaint: any;
  refs: {
    types: Map<string, string>;
    categories: Map<string, string>;
    products: Map<string, string>;
    channels: Map<string, string>;
    licensees: Map<string, string>;
    profiles: Map<string, { full_name: string | null; email: string | null }>;
  };
  onReprintAck: () => void;
  onRetryTriage: () => void;
}

const Yes = () => <CheckCircle2 className="h-4 w-4 text-emerald-600 inline-block" />;
const No = () => <XCircle className="h-4 w-4 text-muted-foreground inline-block" />;

export function ComplaintEvidenceRow({ complaint: c, refs, onReprintAck, onRetryTriage }: Props) {
  const classificationComplete = !!(c.conduct_risk_category_id && c.product_id && c.channel_id && c.severity && c.priority);
  const routingAssigned = !!(c.assigned_team || c.investigator_id);
  const sla = slaBucketFromRow(c);
  const inv = c.investigator_id ? refs.profiles.get(c.investigator_id) : null;

  const Item = ({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) => (
    <div className="flex items-start gap-2 text-xs">
      {ok ? <Yes /> : <No />}
      <div>
        <div className="font-medium">{label}</div>
        {hint && <div className="text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );

  return (
    <div className="bg-muted/30 border-t border-border px-6 py-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Item label="Complaint record" ok hint={c.complaint_number} />
        <Item label="Acknowledgement available" ok hint={c.acknowledged_at ? formatDateTime(c.acknowledged_at) : 'Reprintable'} />
        <Item label="Classification complete" ok={classificationComplete} hint={classificationComplete ? 'All fields set' : 'Missing fields'} />
        <Item label="Priority assigned" ok={!!c.priority} hint={complaintPriorityLabel(c.priority)} />
        <Item label="Routing assigned" ok={routingAssigned} hint={c.assigned_team || inv?.full_name || inv?.email || 'Unassigned'} />
        <div className="text-xs">
          <div className="font-medium mb-1">SLA</div>
          <Badge variant={slaStatusVariant(sla)}>{slaStatusLabel(sla)}</Badge>
          {c.sla_due_at && <div className="text-muted-foreground mt-1">Due {new Date(c.sla_due_at).toLocaleDateString()}</div>}
        </div>
        <div className="text-xs">
          <div className="font-medium mb-1">Triage</div>
          <div className="text-muted-foreground">
            {c.triage_evaluated_at ? formatDateTime(c.triage_evaluated_at) : 'Not evaluated'}
          </div>
          <div className="text-muted-foreground">Source: {c.triage_source || '—'}</div>
          {c.triage_override_status && <Badge variant="outline" className="mt-1">Override: {c.triage_override_status}</Badge>}
        </div>
        <div className="text-xs space-y-1">
          <div className="font-medium mb-1">Intake / Channel</div>
          <div className="text-muted-foreground">Source: {c.intake_source || '—'}</div>
          <div className="text-muted-foreground">Channel: {c.channel_id ? refs.channels.get(c.channel_id) || '—' : '—'}</div>
          <div className="text-muted-foreground">Customer: {c.customer_type || '—'}{c.vulnerability_indicator ? ' · Vulnerable' : ''}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        <Button data-rbac="complaint_management.edit" size="sm" variant="outline" onClick={onReprintAck}><Printer className="h-3 w-3 mr-1" />Reprint acknowledgement</Button>
        <Button data-rbac="complaint_management.edit" size="sm" variant="outline" onClick={onRetryTriage}><RefreshCw className="h-3 w-3 mr-1" />Retry auto-triage</Button>
        <Button size="sm" variant="outline" asChild>
          <Link to={`/complaints/${c.id}`}><ExternalLink className="h-3 w-3 mr-1" />Open full detail & history</Link>
        </Button>
      </div>
    </div>
  );
}
