import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface Props {
  applicantName: string;
  applicantNameAlt: string;
  onChange: (field: string, value: string) => void;
  errors: Record<string, string>;
  applicantNameStatus?: 'idle' | 'checking' | 'available' | 'taken';
}

export function ApplicantInfoSection({ applicantName, applicantNameAlt, onChange, errors, applicantNameStatus = 'idle' }: Props) {
  return (
    <div className="form-section">
      <h3 className="text-lg font-semibold text-foreground">Applicant Information</h3>
      <p className="text-sm text-muted-foreground">Provide the legal name of the applicant entity.</p>

      <div className="grid md:grid-cols-2 gap-6 pt-2">
        <div className="space-y-2">
          <Label htmlFor="applicantName">Applicant Name *</Label>
          <div className="relative">
            <Input
              id="applicantName"
              value={applicantName}
              onChange={e => onChange('applicantName', e.target.value)}
              placeholder="Enter applicant legal name"
              className={(errors.applicantName || applicantNameStatus === 'taken') ? 'border-destructive pr-10' : 'pr-10'}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {applicantNameStatus === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {applicantNameStatus === 'available' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
              {applicantNameStatus === 'taken' && <XCircle className="h-4 w-4 text-destructive" />}
            </div>
          </div>
          {applicantNameStatus === 'taken' && (
            <p className="text-sm text-destructive">This applicant name is already registered</p>
          )}
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

