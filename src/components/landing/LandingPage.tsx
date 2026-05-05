import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { LandingNav } from './LandingNav';
import { HeroSection } from './HeroSection';
import { FeaturesSection } from './FeaturesSection';
import { CapabilitiesSection } from './CapabilitiesSection';
import { AnalyticsSection } from './AnalyticsSection';
import { TrustSection } from './TrustSection';
import { LandingFooter } from './LandingFooter';

export default function LandingPage() {
  const { isFullyAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isFullyAuthenticated) navigate('/dashboard', { replace: true });
  }, [isFullyAuthenticated, navigate]);

  if (isFullyAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav />
      <HeroSection />
      <FeaturesSection />
      <CapabilitiesSection />
      <AnalyticsSection />
      <TrustSection />
      <LandingFooter />
    </div>
  );
}
