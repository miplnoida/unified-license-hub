import {
  LayoutDashboard, FileText, Shield, Users, Building2, FormInput, GitBranch,
  Bell, Settings, BarChart3, ClipboardList, AlertTriangle, FolderOpen,
  UserCircle, ScrollText, Layers, Boxes, ListOrdered,
  SlidersHorizontal, DollarSign, CreditCard, BookOpen, Briefcase,
  CalendarCheck, LayoutGrid, Mail, CalendarDays, Clock, Timer, FileBarChart,
  Activity, ClipboardEdit, Database, ClipboardCheck, Microscope, History, Gavel, ShieldCheck, Radar, Sparkles,
  ListChecks, GraduationCap, Network, Inbox,
} from 'lucide-react';
import { AppRole, INTERNAL_ROLES, LICENSEE_ROLES } from '@/types/platform';
import type { PermissionModule } from '@/lib/permissionModules';

export interface NavItem {
  /**
   * Stable identity from `sec_navigation_items.key`. Used for accordion
   * expansion state so renaming a label never loses/duplicates state.
   */
  key?: string;
  label: string;
  href?: string;
  icon: React.ReactNode;

  badge?: number;
  roles: AppRole[];
  /** If set, item is also gated by the dynamic role having access to this module */
  module?: PermissionModule;
  /**
   * When set, sidebar visibility uses `hasPermission(module, requiredAction)`
   * (exact action match) instead of `hasModuleAccess(module)` (any action on
   * the module). Required for diagnostic entries like Permission Coverage.
   */
  requiredAction?: string;
  /**
   * Admin-panel items (e.g. /admin/*). When true, the sidebar keeps enforcing
   * the static `roles` audience even in dynamic-permission mode so an external
   * user who is granted the same module does not see internal admin screens.
   */
  adminOnly?: boolean;
  /**
   * External-portal items that represent NEW regulated activity (post-licence
   * services, regulatory returns). They stay listed but are disabled until the
   * entity holds an eligible (approved / issued / in-grace) licence — the same
   * canonical entitlement the database enforces on every write.
   */
  requiresLicenceEntitlement?: boolean;
  /** Runtime-only: set by the sidebar when an entitlement gate blocks the item. */
  locked?: boolean;
  lockedReason?: string;
  children?: NavItem[];
}

export interface NavSection {
  label?: string;
  /** Domain icon rendered beside the section heading (level 1). */
  icon?: React.ReactNode;
  items: NavItem[];
}

const ALL_ROLES: AppRole[] = [
  'super_admin', 'admin', 'supervisor', 'licensing_officer', 'analyst',
  'applicant', 'developer', 'pre_licensee', 'licensee_primary', 'licensee_secondary',
];
const ALL_INTERNAL: AppRole[] = [...INTERNAL_ROLES];
const ADMIN_ROLES: AppRole[] = ['super_admin', 'admin'];
const LICENSEE_ALL: AppRole[] = [...LICENSEE_ROLES];
const PRE_LICENSEE: AppRole[] = ['pre_licensee'];

export const mainNavSections: NavSection[] = [
  {
    label: 'Main',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" />, roles: ALL_ROLES },
      // My Work is a read-only aggregation of the signed-in person's module work.
      { label: 'My Work', href: '/my-work', icon: <Inbox className="h-5 w-5" />, roles: ALL_ROLES },
      // Documentation only — mirrors sec_navigation_items key `nav_help_user_manual`.
      { key: 'nav_help_user_manual', label: 'Help & User Manual', href: '/help/user-manual', icon: <BookOpen className="h-5 w-5" />, roles: ALL_ROLES },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Admin Control Panel', href: '/admin', icon: <LayoutGrid className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'admin_dashboard', adminOnly: true },
      { label: 'PPOC Mappings', href: '/admin/ppoc-mappings', icon: <UserCircle className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'license_management' },
      { label: 'Notification Templates', href: '/admin/notification-templates', icon: <Mail className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'notification_management' as PermissionModule },
      { label: 'SLA Manager', href: '/admin/sla-manager', icon: <Clock className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'settings' },
      { label: 'Escalation & Alerts', href: '/admin/escalations', icon: <AlertTriangle className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'escalation_management' as PermissionModule },
      { label: 'Notification Events', href: '/admin/notification-events', icon: <Bell className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'notification_management' as PermissionModule },
      { label: 'Notification History', href: '/admin/notification-history', icon: <Bell className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'notification_management' as PermissionModule },
      { label: 'Channel Health', href: '/admin/notification-channel-health', icon: <Activity className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'notification_management' as PermissionModule },
      { label: 'Activity Logs', href: '/admin/audit-logs', icon: <ScrollText className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'settings' },
      { label: 'Audit Logs', href: '/admin/compliance-audit-logs', icon: <Shield className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'settings' },
      { label: 'Settings', href: '/settings', icon: <Settings className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'settings' },
    ],
  },
  {
    // Internal Access Control = employees + dynamic role/module permissions for admin/internal staff.
    // Never add external portal items here — those live under "External User Access".
    label: 'Internal Access Control',
    items: [
      { label: 'Employee Management', href: '/admin/users', icon: <Users className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'user_management', adminOnly: true },
      { label: 'Role Management', href: '/admin/roles', icon: <Shield className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'role_management', adminOnly: true },
      // Permission Coverage is a diagnostic surface — gated on the EXACT
      // `role_management.view_coverage` action so a role that can view Role
      // Management does not implicitly get access to the coverage matrix.
      { label: 'Permission Coverage', href: '/admin/permission-coverage', icon: <Shield className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'role_management', requiredAction: 'view_coverage', adminOnly: true },
      { label: 'Operating Structure', href: '/admin/operating-structure', icon: <Shield className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'user_management', adminOnly: true },
      // Read-only aggregation of existing access truth (Checkpoint F).
      { label: 'People & Access', href: '/admin/people-access', icon: <Users className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'user_management', adminOnly: true },
    ],
  },
  {
    label: 'Licenses',
    items: [
      { label: 'My Licenses', href: '/licenses', icon: <Shield className="h-5 w-5" />, roles: [...LICENSEE_ALL, ...PRE_LICENSEE, 'applicant'] },
      
    ],
  },
  {
    label: 'License Requests',
    items: [
      { label: 'Pre Licensing Applications', href: '/applications?type=pre', icon: <FileText className="h-5 w-5" />, roles: [...PRE_LICENSEE, ...LICENSEE_ALL, 'applicant'] },
      { label: 'Post Licensing Applications', href: '/applications?type=post', icon: <FileText className="h-5 w-5" />, roles: LICENSEE_ALL, requiresLicenceEntitlement: true },
      { label: 'Licence Requests Queue', href: '/applications/queue', icon: <ClipboardList className="h-5 w-5" />, roles: ['super_admin', 'admin', 'supervisor', 'licensing_officer', 'analyst'], module: 'application_management' },
      { label: 'Licensee Entities', href: '/admin/licensees', icon: <Briefcase className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'license_management' },
      { label: 'License Action Forms', href: '/admin/license-action-forms', icon: <Shield className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'license_management' },
      { label: 'Licensing Appeals', href: '/admin/license-appeals', icon: <Gavel className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'license_appeals' as PermissionModule },
      { label: 'Appeal Panels', href: '/admin/appeal-panels', icon: <Users className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'license_appeals' as PermissionModule, adminOnly: true },
      { label: 'My Appeals', href: '/appeals', icon: <Gavel className="h-5 w-5" />, roles: [...PRE_LICENSEE, ...LICENSEE_ALL, 'applicant'] },
      { label: 'Registration Review', href: '/admin/registration-review', icon: <ClipboardEdit className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'registration_management' },
    ],
  },
  {
    label: 'Returns Management',
    items: [
      {
        label: 'Returns Admin', icon: <CalendarCheck className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'returns_management',
        children: [
          { label: 'Return Types', href: '/admin/returns/types', icon: <Layers className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'returns_management' },
          { label: 'Configurations', href: '/admin/returns/configurations', icon: <Settings className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'returns_management' },
          { label: 'Cutoff Config', href: '/admin/returns/cutoff', icon: <Timer className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'returns_management' },
          { label: 'Due Dates', href: '/admin/returns/due-dates', icon: <CalendarDays className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'returns_management' },
          { label: 'Late Fees', href: '/admin/returns/late-fees', icon: <DollarSign className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'returns_management' },
         { label: 'Schedule Calendar', href: '/admin/returns/schedule', icon: <CalendarDays className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'returns_management' },
        ],
      },
      { label: 'Returns Queue', href: '/returns/queue', icon: <ClipboardList className="h-5 w-5" />, roles: ['super_admin', 'admin', 'supervisor', 'analyst'], module: 'returns_management' },
      { label: 'Returns Dashboard', href: '/entity/returns/dashboard', icon: <LayoutDashboard className="h-5 w-5" />, roles: LICENSEE_ALL, requiresLicenceEntitlement: true },
      { label: 'My Returns', href: '/entity/returns', icon: <CalendarCheck className="h-5 w-5" />, roles: LICENSEE_ALL, requiresLicenceEntitlement: true },
    ],
  },
  {
    label: 'Payments',
    items: [
      { label: 'Payment History', href: '/payments', icon: <CreditCard className="h-5 w-5" />, roles: ['licensee_primary', 'licensee_secondary', 'pre_licensee', 'applicant', ...ADMIN_ROLES], module: 'application_management' },
    ],
  },
  {
    label: 'Market Conduct',
    items: [
      { label: 'Complaints', href: '/complaints', icon: <AlertTriangle className="h-5 w-5" />, roles: [...ALL_INTERNAL], module: 'complaint_management' },
      { label: 'Duplicate Detection', href: '/complaints/duplicates', icon: <Layers className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'complaint_management' },
      { label: 'Auto-Escalation', href: '/complaints/escalations', icon: <AlertTriangle className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'complaint_management' },
      { label: 'RFI Approvals', href: '/complaints/rfi-approvals', icon: <ClipboardCheck className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'complaint_management' },
      { label: 'Complaint Types', href: '/admin/complaint-types', icon: <Layers className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'complaint_type', adminOnly: true },
      { label: 'Conduct Dashboard', href: '/conduct', icon: <BarChart3 className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'market_conduct' },
      { label: 'Supervision Loop', href: '/conduct/supervision-loop', icon: <GitBranch className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'market_conduct' },
      { label: 'Market Surveillance', href: '/conduct/surveillance', icon: <Radar className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'market_conduct' },
      { label: 'Conduct Signals', href: '/conduct/signals', icon: <Radar className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'market_conduct' },
      { label: 'Pattern Detection', href: '/conduct/patterns', icon: <Network className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'market_conduct' },
      { label: 'Supervisory Intelligence', href: '/conduct/supervisory-intelligence', icon: <Microscope className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'market_conduct' },
      { label: 'Emerging Conduct Risks', href: '/conduct/emerging-risks', icon: <AlertTriangle className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'market_conduct' },
      { label: 'Supervisory Attention', href: '/conduct/attention', icon: <ClipboardCheck className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'market_conduct' },
      { label: 'Supervisory Prioritisation', href: '/conduct/prioritisation', icon: <BarChart3 className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'market_conduct' },
      { label: 'Supervisory Interventions', href: '/conduct/interventions', icon: <ClipboardCheck className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'market_conduct' },


      { label: 'Conduct Alerts', href: '/conduct/alerts', icon: <AlertTriangle className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'market_conduct' },
      { label: 'Conduct Actions', href: '/conduct/actions', icon: <ClipboardCheck className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'market_conduct' },
      { label: 'Conduct Entities', href: '/conduct/entities', icon: <Building2 className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'market_conduct' },
      { label: 'Investigations', href: '/conduct/investigations', icon: <FolderOpen className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'market_conduct' },
      { label: 'Investigation Closure Approvals', href: '/conduct/closure-approvals', icon: <Gavel className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'market_conduct' },
      { label: 'Enforcement Cases', href: '/enforcement', icon: <Gavel className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'license_management' },

      { label: 'Thematic Reviews', href: '/supervision/thematic-reviews', icon: <Microscope className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'market_conduct' },
      { label: 'Thematic Closure Approvals', href: '/supervision/thematic-closure-approvals', icon: <ClipboardCheck className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'market_conduct' },
      { label: 'Risk Taxonomy', href: '/admin/conduct/risk-taxonomy', icon: <Layers className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'market_conduct', adminOnly: true },
      { label: 'Products & Channels', href: '/admin/conduct/products-channels', icon: <Boxes className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'market_conduct', adminOnly: true },
      { label: 'Triage Rules', href: '/admin/conduct/triage-rules', icon: <SlidersHorizontal className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'market_conduct', adminOnly: true },
      { label: 'Monitoring Rules', href: '/admin/conduct/monitoring-rules', icon: <SlidersHorizontal className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'market_conduct', adminOnly: true },


    ],
  },
  {
    label: 'Governance',
    items: [
      { label: 'AI Governance', href: '/governance/ai', icon: <ShieldCheck className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'ai_management' as PermissionModule },
      { label: 'AI Use Cases', href: '/governance/ai/use-cases', icon: <ShieldCheck className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'ai_management' as PermissionModule },
      { label: 'AI Models', href: '/governance/ai/models', icon: <ShieldCheck className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'ai_management' as PermissionModule },
      { label: 'AI Instructions', href: '/governance/ai/instructions', icon: <ShieldCheck className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'ai_management' as PermissionModule },
      { label: 'AI Surfaces', href: '/governance/ai/surfaces', icon: <ShieldCheck className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'ai_management' as PermissionModule },
      { label: 'AI Assurance', href: '/governance/ai/assurance', icon: <ShieldCheck className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'ai_management' as PermissionModule },
      { label: 'AI Exceptions', href: '/governance/ai/exceptions', icon: <ShieldCheck className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'ai_management' as PermissionModule },
      { label: 'AI Activity Register', href: '/governance/ai/activity', icon: <ScrollText className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'ai_management' as PermissionModule },

    ],
  },
  {
    label: 'Fit & Proper',
    items: [
      // Ordered to read as the 17-step F&P process itself: overview, then
      // policy/initiation (1-2), declaration/evidence (3-4), verification/
      // assessment (5-6), committee/determination (7-8; 9-10 are satisfied
      // by the same determination — this app runs one team end-to-end, see
      // the F&P user guide), conditions/monitoring (11-13), appeals/
      // notifications (14-15), reporting/training (16-17).
      { label: 'Process List', href: '/fpa/processes', icon: <ListChecks className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
      { label: 'Assessment Hub', href: '/fpa', icon: <LayoutGrid className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
      {
        label: 'Policy & Initiation', icon: <FileText className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule,
        children: [
          { label: 'Sector Rules', href: '/fpa/sector-rules', icon: <SlidersHorizontal className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
          { label: 'Initiation Paths', href: '/fpa/initiation', icon: <FormInput className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
          { label: 'Individual Register', href: '/fpa/individuals', icon: <Users className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
          { label: 'Initiation Log', href: '/fpa/initiation-log', icon: <ListOrdered className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
        ],
      },
      {
        label: 'Declaration & Evidence', icon: <ScrollText className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule,
        children: [
          { label: 'Declarations', href: '/fpa/declarations', icon: <Mail className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
          { label: 'Invitation Tracker', href: '/fpa/invitations', icon: <ClipboardEdit className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
        ],
      },
      {
        label: 'Verification & Assessment', icon: <ShieldCheck className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule,
        children: [
          { label: 'Screening Hub', href: '/fpa/screening', icon: <Shield className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
          { label: 'Manual Review Queue', href: '/fpa/manual-tasks', icon: <ClipboardList className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
          { label: 'Findings Console', href: '/fpa/findings', icon: <AlertTriangle className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
          { label: 'AI Analysis', href: '/fpa/ai-analysis', icon: <Microscope className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
        ],
      },
      {
        label: 'Committee & Determination', icon: <Timer className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule,
        children: [
          { label: 'Committee Voting', href: '/fpa/committee', icon: <Users className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
          { label: 'Determinations', href: '/fpa/determinations', icon: <FileText className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
        ],
      },
      {
        label: 'Conditions & Monitoring', icon: <Timer className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule,
        children: [
          { label: 'Conditions & SLA', href: '/fpa/conditions', icon: <Timer className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
          { label: 'Reassessment Scheduler', href: '/fpa/scheduler', icon: <CalendarCheck className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
          { label: 'Monitoring & Audit', href: '/fpa/monitoring', icon: <Bell className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
        ],
      },
      {
        label: 'Appeals & Notifications', icon: <BookOpen className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule,
        children: [
          { label: 'Appeals', href: '/fpa/appeals', icon: <ScrollText className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
          { label: 'Notification Log', href: '/fpa/notifications', icon: <History className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
        ],
      },
      {
        label: 'Reporting & Training', icon: <BarChart3 className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule,
        children: [
          { label: 'Trends & History', href: '/fpa/trends', icon: <BarChart3 className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
          { label: 'Training & Awareness', href: '/fpa/training', icon: <GraduationCap className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
        ],
      },
    ],
  },
  // {
  //   label: 'Fit & Proper',
  //   items: [
  //     { label: 'Assessment Hub', href: '/fpa', icon: <LayoutGrid className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
  //     {
  //       label: 'Initiation', icon: <FileText className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule,
  //       children: [
  //         { label: 'Initiation Paths', href: '/fpa/initiation', icon: <FormInput className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
  //         { label: 'Individual Register', href: '/fpa/individuals', icon: <Users className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
  //         { label: 'Initiation Log', href: '/fpa/initiation-log', icon: <ListOrdered className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
  //       ],
  //     },
  //     {
  //       label: 'Declarations', icon: <ScrollText className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule,
  //       children: [
  //         { label: 'Declarations', href: '/fpa/declarations', icon: <Mail className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
  //         { label: 'Invitation Tracker', href: '/fpa/invitations', icon: <ClipboardEdit className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
  //         { label: 'Screening Hub', href: '/fpa/screening', icon: <Shield className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
  //         { label: 'Manual Review Queue', href: '/fpa/manual-tasks', icon: <ClipboardList className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
  //       ],
  //     },
  //     {
  //       label: 'Findings', icon: <AlertTriangle className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule,
  //       children: [
  //         { label: 'Findings Console', href: '/fpa/findings', icon: <AlertTriangle className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
  //         { label: 'Trends & History', href: '/fpa/trends', icon: <BarChart3 className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
  //       ],
  //     },
  //     {
  //       label: 'Decisioning', icon: <ClipboardCheck className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule,
  //       children: [
  //         { label: 'AI Analysis', href: '/fpa/ai-analysis', icon: <Microscope className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
  //         { label: 'Sector Rules', href: '/fpa/sector-rules', icon: <SlidersHorizontal className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
  //         { label: 'Determinations', href: '/fpa/determinations', icon: <FileText className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
  //         { label: 'Committee Voting', href: '/fpa/committee', icon: <Users className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
  //         { label: 'Conditions & SLA', href: '/fpa/conditions', icon: <Timer className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
  //       ],
  //     },
  //     {
  //       label: 'Appeals', icon: <BookOpen className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule,
  //       children: [
  //         { label: 'Appeals', href: '/fpa/appeals', icon: <ScrollText className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
  //         { label: 'Monitoring & Audit', href: '/fpa/monitoring', icon: <Bell className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
  //         { label: 'Reassessment Scheduler', href: '/fpa/scheduler', icon: <CalendarCheck className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
  //         { label: 'Notification Log', href: '/fpa/notifications', icon: <History className="h-4 w-4" />, roles: ALL_INTERNAL, module: 'fit_and_proper' as PermissionModule },
  //       ],
  //     },
  //   ],
  // },
  // Twin Peaks Coordination is hidden from the sidebar for now (routes/pages retained):
  // {
  //   label: 'Twin Peaks Coordination',
  //   items: [
  //     { label: 'Coordination Cases', href: '/coordination', icon: <GitBranch className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'coordination' },
  //   ],
  // },
  {
    // EPR-02 — one process entry point ("Prudential Work"), then the registers,
    // then engine/config surfaces which are admin-only operations.
    label: 'Prudential Supervision',
    items: [
      // Canonical enterprise destination (single across every domain — the DB-driven
      // menu exposes it once under Supervision; domain shortcuts are search-only).
      { key: 'nav_sup_portfolio', label: 'Portfolio & Sector Supervision', href: '/supervision/portfolio', icon: <Building2 className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'prudential_supervision' },
      { label: 'Prudential Work', href: '/prudential/work', icon: <ClipboardList className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'prudential_supervision' },
      { label: 'Prudential Dashboard', href: '/prudential/dashboard', icon: <LayoutDashboard className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'prudential_supervision' },
      { label: 'Supervised Entities', href: '/prudential/entities', icon: <Building2 className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'prudential_supervision' },
      { label: 'Financial Groups', href: '/prudential/groups', icon: <Building2 className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'prudential_supervision' },
      { label: 'Assessments', href: '/prudential/assessments', icon: <ClipboardCheck className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'prudential_supervision' },
      { label: 'Onsite Examinations', href: '/prudential/examinations', icon: <ClipboardCheck className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'prudential_supervision' },
      { label: 'Actions Ledger', href: '/prudential/actions', icon: <ClipboardList className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'prudential_supervision' },
      { label: 'Escalations', href: '/prudential/escalations', icon: <AlertTriangle className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'prudential_supervision' },
      { key: 'nav_prudential_supervision_payment_systems', label: 'Payment Systems & FMI Oversight', href: '/prudential/payment-systems', icon: <Database className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'prudential_supervision' },
      { label: 'Engine Operations', href: '/admin/prudential/operations', icon: <SlidersHorizontal className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'prudential_supervision', adminOnly: true },
      { label: 'Stress Indicators', href: '/prudential/stress-indicators', icon: <SlidersHorizontal className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'prudential_supervision', adminOnly: true },
      { label: 'Risk Taxonomy', href: '/admin/prudential-taxonomy', icon: <Layers className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'prudential_supervision', adminOnly: true },
      { label: 'Prudential Thresholds', href: '/admin/returns/prudential/thresholds', icon: <Settings className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'prudential_supervision', adminOnly: true },
      { label: 'Prudential Ratios', href: '/admin/returns/prudential/ratios', icon: <Settings className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'prudential_supervision', adminOnly: true },
      { key: 'nav_prudential_supervision_prudential_analytics', label: 'Prudential Analysis', href: '/admin/returns/prudential/analytics', icon: <FileBarChart className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'prudential_supervision', adminOnly: true },
      { label: 'Validations', href: '/admin/returns/validations', icon: <Settings className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'returns_management', adminOnly: true },
      { label: 'Notif Templates', href: '/admin/returns/notifications/templates', icon: <Mail className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'returns_management', adminOnly: true },
      { label: 'Notif Log', href: '/admin/returns/notifications/log', icon: <FileBarChart className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'returns_management', adminOnly: true },
    ],
  },

  {
    // Epic 3 — AML/CFT supervision workspace. Every surface reads the canonical
    // supervisory spine filtered to the AML_CFT domain; no AML-private stores.
    label: 'AML/CFT Supervision',
    items: [
      { label: 'AML/CFT Overview', href: '/supervision/aml', icon: <LayoutDashboard className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'aml_supervision' },
      { label: 'AML/CFT Work Queue', href: '/supervision/aml/work-queue', icon: <ClipboardList className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'aml_supervision' },
      { label: 'Supervised Entities', href: '/supervision/aml/entities', icon: <Building2 className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'aml_supervision' },
      { label: 'Risk Assessments', href: '/supervision/aml/assessments', icon: <ClipboardCheck className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'aml_supervision' },
      { label: 'Risk Heatmap', href: '/supervision/aml/heatmap', icon: <FileBarChart className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'aml_supervision' },
      { label: 'Portfolio Risk Report', href: '/supervision/aml/portfolio', icon: <FileBarChart className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'aml_supervision' },
      { label: 'Examinations', href: '/supervision/aml/examinations', icon: <ClipboardCheck className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'aml_supervision' },
      { label: 'Findings & Remediation', href: '/supervision/aml/findings', icon: <AlertTriangle className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'aml_supervision' },
    ],
  },



  {
    label: 'Workflows',
    items: [
      { label: 'Approval Workflows', href: '/workflows', icon: <GitBranch className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'workflow_management' },
      
      { label: 'Delegation Rules', href: '/delegation-rules', icon: <Layers className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'workflow_management' },
    ],
  },
  {
    label: 'Form Management',
    items: [
      { label: 'Form Management', href: '/admin/forms', icon: <FormInput className="h-5 w-5" />, roles: ['super_admin', 'admin', 'developer'], module: 'form_management' },
      { label: 'Registration Forms', href: '/admin/registration-forms', icon: <ClipboardEdit className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'form_management' },
    ],
  },
  {
    label: 'Configuration',
    items: [
      {
        label: 'Master Configuration', icon: <Building2 className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'settings',
        children: [
          { label: 'Sectors', href: '/admin/masters/sectors', icon: <Layers className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'settings' },
          { label: 'Sub-Sectors', href: '/admin/masters/sub-sectors', icon: <Boxes className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'settings' },
          { label: 'Categories', href: '/admin/masters/categories', icon: <ListOrdered className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'settings' },
          { label: 'Services', href: '/admin/masters/services', icon: <SlidersHorizontal className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'settings' },
        ],
      },
      { label: 'Master Data', href: '/admin/master-data', icon: <Database className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'settings' },
      { label: 'Fee Management', href: '/admin/fees', icon: <DollarSign className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'fee_management' },
    ],
  },
  {
    label: 'Correspondence',
    items: [
      { label: 'Dashboard', href: '/correspondence/dashboard', icon: <BarChart3 className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'settings' },
      { label: 'Work Queue', href: '/correspondence/inbox', icon: <Mail className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'settings' },
      { label: 'Inbox', href: '/correspondence/inbox', icon: <Mail className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'settings' },

      { label: 'Records', href: '/correspondence/records', icon: <FolderOpen className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'settings' },
      { label: 'Routing Rules', href: '/admin/correspondence-routing', icon: <SlidersHorizontal className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'settings', adminOnly: true },
      { label: 'My Institution', href: '/entity/profile', icon: <Building2 className="h-5 w-5" />, roles: [...LICENSEE_ALL] },
      { label: 'My Correspondence', href: '/entity/correspondence', icon: <Mail className="h-5 w-5" />, roles: [...LICENSEE_ALL, ...PRE_LICENSEE] },
      { label: 'Information Requests', href: '/entity/complaint-rfis', icon: <Mail className="h-5 w-5" />, roles: [...LICENSEE_ALL] },
      { label: 'Supervisory Actions', href: '/entity/supervisory-actions', icon: <ShieldCheck className="h-5 w-5" />, roles: [...LICENSEE_ALL] },
    ],
  },
  {
    label: 'Documents',
    items: [
      { label: 'Document Register', href: '/documents/registry', icon: <FolderOpen className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'document_management' },
    ],
  },
  {
    label: 'Analytics & Reports',
    items: [
      { label: 'Analytics', href: '/analytics', icon: <BarChart3 className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'report_management' },
      { label: 'Supervisory AI Reports', href: '/analytics/ai-reports', icon: <Sparkles className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'report_management' },
      { label: 'Reports', href: '/reports', icon: <BookOpen className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'report_management' },

    ],
  },
];

export const bottomNavItems: NavItem[] = [];
