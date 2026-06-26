import { useLocation } from 'react-router-dom';
import { SubmissionAcknowledgement } from '@/components/applications/SubmissionAcknowledgement';

export default function RegistrationSuccess() {
  const location = useLocation();
  const registrationReference =
    (location.state as any)?.registrationReference || 'REG-XXXX-XXXXXX';
  const submittedAt = (location.state as any)?.submittedAt || new Date().toISOString();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <SubmissionAcknowledgement
        title="Registration Completed"
        message="Your registration has been saved successfully. You will be able to log in once it is approved."
        referenceNumber={registrationReference}
        submittedAt={submittedAt}
        status="Pending Review"
        nextStep="Your registration will be reviewed by the regulator. You will receive an email once a decision is made."
        dashboardHref="/"
      />
    </div>
  );
}
