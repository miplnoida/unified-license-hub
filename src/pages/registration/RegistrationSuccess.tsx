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
        title="Registration Submitted"
        message="Your registration has been received and is awaiting approval."
        referenceNumber={registrationReference}
        submittedAt={submittedAt}
        status="Pending approval"
        nextStep="The regulator will review your registration. Once approved, you will receive an email with a link to log in."
        dashboardHref="/"
        dashboardLabel="Back to Home"
        trackHref={null}
      />
    </div>
  );
}
