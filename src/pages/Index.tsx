import { lazy, Suspense } from 'react';

const LandingPage = lazy(() => import('@/components/landing/LandingPage'));

export default function Index() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LandingPage />
    </Suspense>
  );
}
