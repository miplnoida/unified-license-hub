export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      applications: {
        Row: {
          applicant_id: string
          application_number: string
          approved_at: string | null
          created_at: string
          current_step_id: string | null
          data: Json | null
          id: string
          license_type: string
          rejected_at: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          workflow_id: string | null
        }
        Insert: {
          applicant_id: string
          application_number?: string
          approved_at?: string | null
          created_at?: string
          current_step_id?: string | null
          data?: Json | null
          id?: string
          license_type: string
          rejected_at?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          workflow_id?: string | null
        }
        Update: {
          applicant_id?: string
          application_number?: string
          approved_at?: string | null
          created_at?: string
          current_step_id?: string | null
          data?: Json | null
          id?: string
          license_type?: string
          rejected_at?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          workflow_id?: string | null
        }
        Relationships: []
      }
      approval_actions: {
        Row: {
          action: string
          actor_id: string
          application_id: string
          comments: string | null
          created_at: string
          delegated_to: string | null
          id: string
          step_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          application_id: string
          comments?: string | null
          created_at?: string
          delegated_to?: string | null
          id?: string
          step_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          application_id?: string
          comments?: string | null
          created_at?: string
          delegated_to?: string | null
          id?: string
          step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_actions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_actions_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "approval_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_steps: {
        Row: {
          approver_role: Database["public"]["Enums"]["app_role"]
          condition: Json | null
          created_at: string
          description: string | null
          id: string
          is_required: boolean
          name: string
          sla_hours: number | null
          step_order: number
          step_type: string
          workflow_id: string
        }
        Insert: {
          approver_role: Database["public"]["Enums"]["app_role"]
          condition?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean
          name: string
          sla_hours?: number | null
          step_order: number
          step_type?: string
          workflow_id: string
        }
        Update: {
          approver_role?: Database["public"]["Enums"]["app_role"]
          condition?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean
          name?: string
          sla_hours?: number | null
          step_order?: number
          step_type?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "approval_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_workflows: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          license_type: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          license_type: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          license_type?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sector_id: string
          status: string
          sub_sector_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sector_id: string
          status?: string
          sub_sector_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sector_id?: string
          status?: string
          sub_sector_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_sub_sector_id_fkey"
            columns: ["sub_sector_id"]
            isOneToOne: false
            referencedRelation: "sub_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          complainant_id: string | null
          complaint_number: string
          created_at: string
          description: string
          id: string
          investigator_id: string | null
          license_holder_id: string | null
          resolution: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          complainant_id?: string | null
          complaint_number?: string
          created_at?: string
          description: string
          id?: string
          investigator_id?: string | null
          license_holder_id?: string | null
          resolution?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          complainant_id?: string | null
          complaint_number?: string
          created_at?: string
          description?: string
          id?: string
          investigator_id?: string | null
          license_holder_id?: string | null
          resolution?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      compliance_returns: {
        Row: {
          created_at: string
          due_date: string
          form_data: Json | null
          id: string
          license_id: string | null
          period_end: string
          period_start: string
          return_config_id: string | null
          reviewed_at: string | null
          reviewer_comments: string | null
          reviewer_id: string | null
          status: string
          submitted_at: string | null
          submitter_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_date: string
          form_data?: Json | null
          id?: string
          license_id?: string | null
          period_end: string
          period_start: string
          return_config_id?: string | null
          reviewed_at?: string | null
          reviewer_comments?: string | null
          reviewer_id?: string | null
          status?: string
          submitted_at?: string | null
          submitter_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_date?: string
          form_data?: Json | null
          id?: string
          license_id?: string | null
          period_end?: string
          period_start?: string
          return_config_id?: string | null
          reviewed_at?: string | null
          reviewer_comments?: string | null
          reviewer_id?: string | null
          status?: string
          submitted_at?: string | null
          submitter_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_returns_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_returns_return_config_id_fkey"
            columns: ["return_config_id"]
            isOneToOne: false
            referencedRelation: "return_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      delegation_rules: {
        Row: {
          condition: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          target_role: Database["public"]["Enums"]["app_role"]
          target_user_id: string | null
        }
        Insert: {
          condition: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          target_role: Database["public"]["Enums"]["app_role"]
          target_user_id?: string | null
        }
        Update: {
          condition?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          target_role?: Database["public"]["Enums"]["app_role"]
          target_user_id?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          uploaded_by?: string
        }
        Relationships: []
      }
      fee_configurations: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          currency: string
          fee_type: string
          id: string
          is_active: boolean
          name: string
          sector_id: string | null
          service_id: string | null
          sub_sector_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          fee_type?: string
          id?: string
          is_active?: boolean
          name: string
          sector_id?: string | null
          service_id?: string | null
          sub_sector_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          fee_type?: string
          id?: string
          is_active?: boolean
          name?: string
          sector_id?: string | null
          service_id?: string | null
          sub_sector_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_configurations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_configurations_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_configurations_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_configurations_sub_sector_id_fkey"
            columns: ["sub_sector_id"]
            isOneToOne: false
            referencedRelation: "sub_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          category: string
          created_at: string
          description: string | null
          form_type: string
          id: string
          name: string
          parent_form_id: string | null
          rows: Json
          sector: string
          service: string
          status: string
          sub_sector: string
          updated_at: string
          version: number
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          form_type: string
          id?: string
          name: string
          parent_form_id?: string | null
          rows?: Json
          sector?: string
          service?: string
          status?: string
          sub_sector?: string
          updated_at?: string
          version?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          form_type?: string
          id?: string
          name?: string
          parent_form_id?: string | null
          rows?: Json
          sector?: string
          service?: string
          status?: string
          sub_sector?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "forms_parent_form_id_fkey"
            columns: ["parent_form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      license_actions: {
        Row: {
          action_type: string
          actor_id: string
          created_at: string
          id: string
          license_id: string
          metadata: Json | null
          new_status: string | null
          old_status: string | null
          reason: string | null
        }
        Insert: {
          action_type: string
          actor_id: string
          created_at?: string
          id?: string
          license_id: string
          metadata?: Json | null
          new_status?: string | null
          old_status?: string | null
          reason?: string | null
        }
        Update: {
          action_type?: string
          actor_id?: string
          created_at?: string
          id?: string
          license_id?: string
          metadata?: Json | null
          new_status?: string | null
          old_status?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "license_actions_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          application_id: string | null
          category_id: string | null
          compliance_requirements: Json | null
          conditions: string | null
          created_at: string
          holder_id: string
          id: string
          issued_at: string
          license_number: string
          license_type: string
          sector_id: string | null
          status: string
          sub_sector_id: string | null
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          application_id?: string | null
          category_id?: string | null
          compliance_requirements?: Json | null
          conditions?: string | null
          created_at?: string
          holder_id: string
          id?: string
          issued_at?: string
          license_number?: string
          license_type: string
          sector_id?: string | null
          status?: string
          sub_sector_id?: string | null
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          application_id?: string | null
          category_id?: string | null
          compliance_requirements?: Json | null
          conditions?: string | null
          created_at?: string
          holder_id?: string
          id?: string
          issued_at?: string
          license_number?: string
          license_type?: string
          sector_id?: string | null
          status?: string
          sub_sector_id?: string | null
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licenses_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_sub_sector_id_fkey"
            columns: ["sub_sector_id"]
            isOneToOne: false
            referencedRelation: "sub_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          application_id: string | null
          created_at: string
          currency: string
          fee_configuration_id: string | null
          id: string
          paid_at: string | null
          payment_method: string | null
          receipt_number: string | null
          status: string
          transaction_ref: string | null
          user_id: string
        }
        Insert: {
          amount: number
          application_id?: string | null
          created_at?: string
          currency?: string
          fee_configuration_id?: string | null
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          receipt_number?: string | null
          status?: string
          transaction_ref?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          application_id?: string | null
          created_at?: string
          currency?: string
          fee_configuration_id?: string | null
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          receipt_number?: string | null
          status?: string
          transaction_ref?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_fee_configuration_id_fkey"
            columns: ["fee_configuration_id"]
            isOneToOne: false
            referencedRelation: "fee_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          entity_name: string
          full_name: string
          id: string
          role: string
          status: string
          updated_at: string
          user_type: Database["public"]["Enums"]["user_type"]
        }
        Insert: {
          created_at?: string
          email: string
          entity_name?: string
          full_name: string
          id: string
          role?: string
          status?: string
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Update: {
          created_at?: string
          email?: string
          entity_name?: string
          full_name?: string
          id?: string
          role?: string
          status?: string
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Relationships: []
      }
      registration_form_submissions: {
        Row: {
          created_at: string
          form_data: Json
          form_id: string
          id: string
          registration_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          form_data?: Json
          form_id: string
          id?: string
          registration_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          form_data?: Json
          form_id?: string
          id?: string
          registration_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_form_submissions_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          applicant_name: string
          applicant_name_alt: string | null
          category_id: string
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          mailing_address: Json
          physical_address: Json
          same_as_mailing: boolean
          sector_id: string
          status: string
          sub_sector_id: string
          telephone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applicant_name: string
          applicant_name_alt?: string | null
          category_id: string
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name: string
          mailing_address?: Json
          physical_address?: Json
          same_as_mailing?: boolean
          sector_id: string
          status?: string
          sub_sector_id: string
          telephone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applicant_name?: string
          applicant_name_alt?: string | null
          category_id?: string
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          mailing_address?: Json
          physical_address?: Json
          same_as_mailing?: boolean
          sector_id?: string
          status?: string
          sub_sector_id?: string
          telephone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      return_configurations: {
        Row: {
          created_at: string
          due_day: number
          form_id: string | null
          frequency: string
          id: string
          is_active: boolean
          name: string
          sector_id: string | null
          sub_sector_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_day?: number
          form_id?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          name: string
          sector_id?: string | null
          sub_sector_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_day?: number
          form_id?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          name?: string
          sector_id?: string | null
          sub_sector_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_configurations_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_configurations_sub_sector_id_fkey"
            columns: ["sub_sector_id"]
            isOneToOne: false
            referencedRelation: "sub_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      sectors: {
        Row: {
          created_at: string
          id: string
          name: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          created_at: string
          id: string
          name: string
          sector_id: string
          status: string
          sub_sector_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sector_id: string
          status?: string
          sub_sector_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sector_id?: string
          status?: string
          sub_sector_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_sub_sector_id_fkey"
            columns: ["sub_sector_id"]
            isOneToOne: false
            referencedRelation: "sub_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_sectors: {
        Row: {
          created_at: string
          id: string
          name: string
          sector_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sector_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sector_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_sectors_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_application_number: { Args: never; Returns: string }
      generate_complaint_number: { Args: never; Returns: string }
      generate_license_number: { Args: never; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "supervisor"
        | "licensing_officer"
        | "analyst"
        | "applicant"
        | "developer"
      user_type: "primary" | "secondary"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "admin",
        "supervisor",
        "licensing_officer",
        "analyst",
        "applicant",
        "developer",
      ],
      user_type: ["primary", "secondary"],
    },
  },
} as const
