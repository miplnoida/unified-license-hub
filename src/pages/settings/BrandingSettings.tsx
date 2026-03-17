import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, ArrowLeft, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function BrandingSettings() {
  const navigate = useNavigate();
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title="Branding Settings"
          description="Customize the look and feel of the platform."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/settings')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
              <Button><Save className="h-4 w-4 mr-2" />Save Changes</Button>
            </div>
          }
        />

        <Card className="animate-slide-up delay-100">
          <CardHeader>
            <CardTitle className="text-lg">Logo & Identity</CardTitle>
            <CardDescription>Upload organization logos for the portal and documents.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label>Primary Logo</Label>
                <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50">
                  <Button variant="outline" size="sm"><Upload className="h-4 w-4 mr-2" />Upload Logo</Button>
                </div>
                <p className="text-xs text-muted-foreground">Recommended: 200×60px, PNG or SVG</p>
              </div>
              <div className="space-y-3">
                <Label>Favicon</Label>
                <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50">
                  <Button variant="outline" size="sm"><Upload className="h-4 w-4 mr-2" />Upload Favicon</Button>
                </div>
                <p className="text-xs text-muted-foreground">Recommended: 32×32px, ICO or PNG</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Platform Title</Label>
              <Input defaultValue="ARIAS Licensing Platform" />
            </div>
            <div className="space-y-2">
              <Label>Footer Text</Label>
              <Textarea defaultValue="© 2026 Authority for Financial Services Commission. All rights reserved." />
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-200">
          <CardHeader>
            <CardTitle className="text-lg">Theme Colors</CardTitle>
            <CardDescription>Customize the color scheme of the platform.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Primary', value: '#1e40af' },
                { label: 'Secondary', value: '#64748b' },
                { label: 'Accent', value: '#0ea5e9' },
                { label: 'Destructive', value: '#dc2626' },
              ].map(color => (
                <div key={color.label} className="space-y-2">
                  <Label>{color.label}</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" defaultValue={color.value} className="h-9 w-9 rounded border cursor-pointer" />
                    <Input defaultValue={color.value} className="flex-1 font-mono text-sm" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
