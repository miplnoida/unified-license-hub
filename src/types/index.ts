// User & Role Types
export type UserRole = 'pre_licensee' | 'post_licensee' | 'admin' | 'reviewer' | 'approver' | 'supervisor';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organizationName?: string;
  licenseNumber?: string;
  isLicensee?: boolean;
}

// Permission, Role, Sector, SubSector, Category, Service types

export interface Permission {
  id: string;
  name: string;
  description: string;
  module: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

// Sector & Category Types
export interface Sector {
  id: string;
  name: string;
  description: string;
  icon?: string;
}

export interface SubSector {
  id: string;
  sectorId: string;
  name: string;
  description: string;
}

export interface Category {
  id: string;
  subSectorId: string;
  name: string;
  description: string;
}

export interface Service {
  id: string;
  subSectorId: string;
  name: string;
  description: string;
  requiresLicense: boolean;
}

// Application Types
export type ApplicationStatus = 'draft' | 'in_progress' | 'submitted' | 'query_raised' | 'approved' | 'rejected' | 'cancelled' | 'resubmission_requested' | 'resubmission_required' | 'returned_for_correction' | 'info_requested';
export type FeeStatus = 'paid' | 'pending';

export interface Application {
  id: string;
  applicationNumber: string;
  userId: string;
  organizationName?: string;
  sectorId: string;
  sectorName?: string;
  subSectorId: string;
  subSectorName?: string;
  categoryId: string;
  categoryName?: string;
  formId: string;
  status: ApplicationStatus;
  feeStatus?: FeeStatus;
  feeApproved?: boolean;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
  data: Record<string, unknown>;
}

// Return Types
export type ReturnFrequency = 'monthly' | 'quarterly' | 'yearly';
export type ReturnStatus = 'pending' | 'draft' | 'submitted' | 'accepted' | 'rejected' | 'overdue';

export interface Return {
  id: string;
  returnNumber: string;
  userId: string;
  licenseId: string;
  serviceId: string;
  formId: string;
  frequency: ReturnFrequency;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  status: ReturnStatus;
  submittedAt?: string;
  createdAt: string;
  data: Record<string, unknown>;
}

// Form Types
export type FieldType = 'text' | 'number' | 'email' | 'phone' | 'date' | 'select' | 'multiselect' | 'checkbox' | 'radio' | 'file' | 'textarea';

export interface FormField {
  id: string;
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  conditionalOn?: {
    field: string;
    value: unknown;
  };
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
}

export interface DynamicForm {
  id: string;
  name: string;
  description: string;
  type: 'pre_license' | 'post_license' | 'return';
  categoryId?: string;
  serviceId?: string;
  sections: FormSection[];
  version: number;
  isActive: boolean;
}

// Dashboard Stats
export interface DashboardStats {
  totalApplications: number;
  pendingApplications: number;
  approvedApplications: number;
  rejectedApplications: number;
  totalReturns: number;
  pendingReturns: number;
  overdueReturns: number;
  submittedReturns: number;
}

// Notification
export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  read: boolean;
  createdAt: string;
}
