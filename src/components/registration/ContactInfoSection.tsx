import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  firstName: string;
  lastName: string;
  telephone: string;
  email: string;
  onChange: (field: string, value: string) => void;
  errors: Record<string, string>;
}

export function ContactInfoSection({ firstName, lastName, telephone, email, onChange, errors }: Props) {
  return (
    <div className="form-section">
      <h3 className="text-lg font-semibold text-foreground">Principal Point of Contact Information</h3>
      <p className="text-sm text-muted-foreground">Details of the primary contact person for this application.</p>

      <div className="grid md:grid-cols-2 gap-6 pt-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name *</Label>
          <Input
            id="firstName"
            value={firstName}
            onChange={e => onChange('firstName', e.target.value)}
            placeholder="Enter first name"
            className={errors.firstName ? 'border-destructive' : ''}
          />
          {errors.firstName && <p className="text-sm text-destructive">{errors.firstName}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last Name *</Label>
          <Input
            id="lastName"
            value={lastName}
            onChange={e => onChange('lastName', e.target.value)}
            placeholder="Enter last name"
            className={errors.lastName ? 'border-destructive' : ''}
          />
          {errors.lastName && <p className="text-sm text-destructive">{errors.lastName}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="telephone">Telephone *</Label>
          <Input
            id="telephone"
            type="tel"
            value={telephone}
            onChange={e => onChange('telephone', e.target.value)}
            placeholder="Enter phone number"
            className={errors.telephone ? 'border-destructive' : ''}
          />
          {errors.telephone && <p className="text-sm text-destructive">{errors.telephone}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={e => onChange('email', e.target.value)}
            placeholder="Enter email address"
            className={errors.email ? 'border-destructive' : ''}
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
        </div>
      </div>
    </div>
  );
}
