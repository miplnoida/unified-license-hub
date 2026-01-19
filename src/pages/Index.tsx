import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types';
import {
  Layers,
  FileText,
  ClipboardList,
  Shield,
  ArrowRight,
  CheckCircle,
  Building2,
  Users,
  ChevronRight,
} from 'lucide-react';

const features = [
  {
    icon: <FileText className="h-6 w-6" />,
    title: 'License Applications',
    description: 'Apply for pre-license and post-license services with dynamic, configurable forms.',
  },
  {
    icon: <ClipboardList className="h-6 w-6" />,
    title: 'Return Management',
    description: 'Submit and track your periodic returns with automated due date tracking.',
  },
  {
    icon: <Shield className="h-6 w-6" />,
    title: 'Secure & Compliant',
    description: 'Enterprise-grade security with complete audit trails and role-based access.',
  },
  {
    icon: <Building2 className="h-6 w-6" />,
    title: 'Multi-Sector Support',
    description: 'Supports insurance, banking, capital markets, and other financial sectors.',
  },
];

const roleCards: { role: UserRole; title: string; description: string; icon: React.ReactNode }[] = [
  {
    role: 'public',
    title: 'Public User',
    description: 'Apply for licenses, manage returns, and track your applications',
    icon: <Users className="h-8 w-8" />,
  },
  {
    role: 'admin',
    title: 'AFSC Administrator',
    description: 'Full system access including configuration and user management',
    icon: <Shield className="h-8 w-8" />,
  },
  {
    role: 'reviewer',
    title: 'Reviewer',
    description: 'Review and process applications and returns',
    icon: <FileText className="h-8 w-8" />,
  },
  {
    role: 'approver',
    title: 'Approver',
    description: 'Approve or reject reviewed applications',
    icon: <CheckCircle className="h-8 w-8" />,
  },
];

export default function Index() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();

  const handleRoleSelect = (role: UserRole) => {
    login(role);
    navigate('/dashboard');
  };

  if (isAuthenticated) {
    navigate('/dashboard');
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="hero-gradient relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiIHN0cm9rZS13aWR0aD0iMiIvPjwvZz48L3N2Zz4=')] opacity-20" />
        
        <div className="container relative mx-auto px-4 py-24 lg:py-32">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-6 animate-slide-up">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
                <Layers className="h-7 w-7 text-secondary-foreground" />
              </div>
              <span className="text-xl font-semibold text-primary-foreground/90">ARIAS</span>
            </div>
            
            <h1 className="text-4xl lg:text-5xl font-bold text-primary-foreground leading-tight animate-slide-up">
              Automated Regulatory & 
              <br />
              <span className="text-secondary">Integrated Application System</span>
            </h1>
            
            <p className="mt-6 text-lg text-primary-foreground/80 max-w-2xl animate-slide-up delay-100">
              A unified platform for license management, regulatory compliance, and seamless 
              interaction between public users and AFSC regulatory authorities.
            </p>
            
            <div className="mt-10 flex flex-wrap gap-4 animate-slide-up delay-200">
              <Button
                size="xl"
                variant="hero"
                onClick={() => handleRoleSelect('public')}
              >
                Get Started
                <ArrowRight className="h-5 w-5" />
              </Button>
              <Button
                size="xl"
                variant="hero-outline"
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Learn More
              </Button>
            </div>
          </div>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1/3 h-2/3 bg-gradient-to-l from-secondary/20 to-transparent rounded-l-full blur-3xl" />
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground">
              Comprehensive Regulatory Platform
            </h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              Everything you need to manage licenses, applications, and regulatory compliance in one place.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className="card-elevated p-6 group hover:border-secondary/50 transition-colors animate-slide-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/10 text-secondary group-hover:bg-secondary group-hover:text-secondary-foreground transition-colors">
                  {feature.icon}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Role Selection Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground">
              Select Your Role to Continue
            </h2>
            <p className="mt-3 text-muted-foreground">
              Choose your user type to access the appropriate dashboard and features.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {roleCards.map((card, index) => (
              <button
                key={card.role}
                onClick={() => handleRoleSelect(card.role)}
                className="card-elevated p-6 text-left group hover:border-primary hover:shadow-lg transition-all animate-slide-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  {card.icon}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">{card.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{card.description}</p>
                <div className="mt-4 flex items-center text-sm font-medium text-primary">
                  Continue
                  <ChevronRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Layers className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-semibold text-foreground">ARIAS</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2024 AFSC. All rights reserved. Automated Regulatory & Integrated Application System.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
