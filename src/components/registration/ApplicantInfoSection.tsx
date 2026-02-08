import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  applicantName: string;
  applicantNameAlt: string;
  onChange: (field: string, value: string) => void;
  errors: Record<string, string>;
}

export function ApplicantInfoSection({ applicantName, applicantNameAlt, onChange, errors }: Props) {
  return (
    <div className="form-section">
      <h3 className="text-lg font-semibold text-foreground">Applicant Information</h3>
      <p className="text-sm text-muted-foreground">Provide the legal name of the applicant entity.</p>

      <div className="grid md:grid-cols-2 gap-6 pt-2">
        <div className="space-y-2">
          <Label htmlFor="applicantName">Applicant Name *</Label>
          <Input
            id="applicantName"
            value={applicantName}
            onChange={e => onChange('applicantName', e.target.value)}
            placeholder="Enter applicant legal name"
            className={errors.applicantName ? 'border-destructive' : ''}
          />
          {errors.applicantName && <p className="text-sm text-destructive">{errors.applicantName}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="applicantNameAlt">Applicant Name (if available)</Label>
          <Input
            id="applicantNameAlt"
            value={applicantNameAlt}
            onChange={e => onChange('applicantNameAlt', e.target.value)}
            placeholder="Alternate or trading name"
          />
        </div>
      </div>
    </div>
  );
}
