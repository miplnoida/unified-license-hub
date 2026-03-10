import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Layers, ArrowRight, Mail, Lock, Shield, FileText, ClipboardList, Building2, User, BarChart3, Eye, EyeOff } from 'lucide-react';

const features = [
  { icon: <FileText className="h-4 w-4" />, title: 'License Applications', desc: 'Dynamic forms with multi-stage approval workflows' },
  { icon: <ClipboardList className="h-4 w-4" />, title: 'Compliance Returns', desc: 'Periodic return filing with automated tracking' },
  { icon: <Shield className="h-4 w-4" />, title: 'Audit & Security', desc: 'Complete audit trail with role-based access' },
  { icon: <BarChart3 className="h-4 w-4" />, title: 'Analytics', desc: 'Real-time dashboards and compliance reports' },
];

export default function Index() {
  const navigate = useNavigate();
  const { isAuthenticated, login, signup } = useAuth();
  const [tab, setTab] = useState('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirm, setSignupConfirm] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);
  const [showSignupPw, setShowSignupPw] = useState(false);

  if (isAuthenticated) { navigate('/dashboard'); return null; }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) { toast.error('Please enter email and password'); return; }
    setLoginLoading(true);
    const result = await login(loginEmail, loginPassword);
    setLoginLoading(false);
    if (result.error) { toast.error(result.error); return; }
    toast.success('Login successful');
    navigate('/dashboard');
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupName || !signupEmail || !signupPassword) { toast.error('Please fill all fields'); return; }
    if (signupPassword !== signupConfirm) { toast.error('Passwords do not match'); return; }
    if (signupPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setSignupLoading(true);
    const result = await signup(signupEmail, signupPassword, signupName);
    setSignupLoading(false);
    if (result.error) { toast.error(result.error); return; }
    toast.success('Account created! Please check your email to confirm, then sign in.');
    setTab('login');
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left - Hero */}
      <div className="hero-gradient relative flex flex-col justify-between p-8 lg:p-12 lg:w-[48%] min-h-[260px] lg:min-h-screen overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }} />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-10">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary shadow-lg">
              <Layers className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-primary-foreground tracking-tight">RegPlatform</span>
          </div>
          <h1 className="text-3xl lg:text-4xl xl:text-[2.75rem] font-extrabold text-primary-foreground leading-[1.15] tracking-tight">
            Regulatory Licensing &<br />
            <span className="bg-gradient-to-r from-sidebar-primary to-emerald-300 bg-clip-text text-transparent">
              Compliance Platform
            </span>
          </h1>
          <p className="mt-5 text-primary-foreground/60 max-w-md text-[15px] leading-relaxed">
            Enterprise-grade platform for managing license applications, approval workflows,
            compliance returns, and regulatory oversight across multiple sectors.
          </p>
        </div>
        <div className="relative z-10 mt-8 lg:mt-0 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {features.map((f) => (
              <div key={f.title} className="flex items-start gap-3 rounded-xl bg-primary-foreground/[0.06] backdrop-blur-sm p-3.5 border border-primary-foreground/[0.08]">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/20 text-sidebar-primary">
                  {f.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-primary-foreground">{f.title}</p>
                  <p className="text-xs text-primary-foreground/50 mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-primary-foreground/30 pt-2">
            © {new Date().getFullYear()} Regulatory Platform. Secure & Scalable.
          </p>
        </div>
      </div>

      {/* Right - Auth */}
      <div className="flex flex-1 items-center justify-center p-6 lg:p-12 bg-background">
        <div className="w-full max-w-[420px] space-y-6">
          <div className="text-center lg:text-left">
            <h2 className="text-2xl font-bold tracking-tight">Get Started</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sign in or create an account to continue</p>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="login-email" type="email" placeholder="your.email@example.com" className="pl-10"
                      value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="login-password" type={showLoginPw ? 'text' : 'password'} placeholder="Enter your password" className="pl-10 pr-10"
                      value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
                    <button type="button" onClick={() => setShowLoginPw(!showLoginPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showLoginPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loginLoading}>
                  {loginLoading ? 'Signing in...' : 'Sign In'}
                  {!loginLoading && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
                <div className="text-center">
                  <button type="button" onClick={() => navigate('/forgot-password')} className="text-sm text-primary hover:underline">
                    Forgot your password?
                  </button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="signup-name" placeholder="John Doe" className="pl-10" value={signupName} onChange={(e) => setSignupName(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="signup-email" type="email" placeholder="your.email@example.com" className="pl-10" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="signup-password" type={showSignupPw ? 'text' : 'password'} placeholder="Min. 6 characters" className="pl-10 pr-10"
                      value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} />
                    <button type="button" onClick={() => setShowSignupPw(!showSignupPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showSignupPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="signup-confirm" type="password" placeholder="Confirm password" className="pl-10"
                      value={signupConfirm} onChange={(e) => setSignupConfirm(e.target.value)} />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={signupLoading}>
                  {signupLoading ? 'Creating account...' : 'Create Account'}
                  {!signupLoading && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  First registered user automatically becomes Super Admin
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
