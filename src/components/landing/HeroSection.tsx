import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { UserPlus, LogIn } from 'lucide-react';

export function HeroSection() {
  const navigate = useNavigate();

  return (
    <section className="bg-primary py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-primary-foreground leading-tight tracking-tight">
          Regulatory Licensing &amp; Compliance Portal
        </h1>
        <p className="mt-4 text-sm sm:text-base text-primary-foreground/65 max-w-xl mx-auto leading-relaxed">
          Apply for licenses, submit returns, track applications, and access regulatory services — all in one place.
        </p>

        {/* CTA area */}
        <div className="mt-8 space-y-3">
          <p className="text-xs font-medium text-primary-foreground/50 uppercase tracking-wider">
            New user? Start here
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" variant="secondary" className="w-full sm:w-auto text-base px-8" onClick={() => navigate('/register')}>
              <UserPlus className="mr-2 h-5 w-5" /> Register Now
            </Button>
            <Button size="lg" variant="hero-outline" className="w-full sm:w-auto" onClick={() => navigate('/login')}>
              <LogIn className="mr-2 h-4 w-4" /> Existing User? Login
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
