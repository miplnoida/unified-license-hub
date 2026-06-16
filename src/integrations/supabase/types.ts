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
      application_form_versions: {
        Row: {
          application_id: string
          assigned_at: string
          assigned_by: string | null
          assigned_reason: string
          created_at: string
          id: string
          locked_at: string | null
          status: string
          template_id: string
          updated_at: string
          version_id: string
        }
        Insert: {
          application_id: string
          assigned_at?: string
          assigned_by?: string | null
          assigned_reason: string
          created_at?: string
          id?: string
          locked_at?: string | null
          status?: string
          template_id: string
          updated_at?: string
          version_id: string
        }
        Update: {
          application_id?: string
          assigned_at?: string
          assigned_by?: string | null
          assigned_reason?: string
          created_at?: string
          id?: string
          locked_at?: string | null
          status?: string
          template_id?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_form_versions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_form_versions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "report_view_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_form_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_form_versions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          ack_at: string | null
          ack_by: string | null
          ack_text: string | null
          applicant_id: string
          application_number: string
          approved_at: string | null
          cancelled_at: string | null
          created_at: string
          current_step_id: string | null
          data: Json | null
          form_version_id: string | null
          id: string
          license_type: string
          regulator_id: string | null
          rejected_at: string | null
          search_vector: unknown
          status: string
          submitted_at: string | null
          updated_at: string
          workflow_id: string | null
        }
        Insert: {
          ack_at?: string | null
          ack_by?: string | null
          ack_text?: string | null
          applicant_id: string
          application_number?: string
          approved_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_step_id?: string | null
          data?: Json | null
          form_version_id?: string | null
          id?: string
          license_type: string
          regulator_id?: string | null
          rejected_at?: string | null
          search_vector?: unknown
          status?: string
          submitted_at?: string | null
          updated_at?: string
          workflow_id?: string | null
        }
        Update: {
          ack_at?: string | null
          ack_by?: string | null
          ack_text?: string | null
          applicant_id?: string
          application_number?: string
          approved_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_step_id?: string | null
          data?: Json | null
          form_version_id?: string | null
          id?: string
          license_type?: string
          regulator_id?: string | null
          rejected_at?: string | null
          search_vector?: unknown
          status?: string
          submitted_at?: string | null
          updated_at?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_form_version_id_fkey"
            columns: ["form_version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_action_notifications: {
        Row: {
          action_type: string
          created_at: string
          event_key: string
          id: string
          is_enabled: boolean
          recipient_config: Json
          recipient_type: Database["public"]["Enums"]["workflow_notification_recipient"]
          step_id: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          action_type: string
          created_at?: string
          event_key: string
          id?: string
          is_enabled?: boolean
          recipient_config?: Json
          recipient_type: Database["public"]["Enums"]["workflow_notification_recipient"]
          step_id: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          event_key?: string
          id?: string
          is_enabled?: boolean
          recipient_config?: Json
          recipient_type?: Database["public"]["Enums"]["workflow_notification_recipient"]
          step_id?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_action_notifications_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "approval_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_action_notifications_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_actions: {
        Row: {
          action: string
          action_type: string
          actor_id: string
          application_id: string | null
          comments: string | null
          created_at: string
          delegated_from: string | null
          delegated_to: string | null
          entity_id: string | null
          entity_type: string
          id: string
          responded_at: string | null
          sla_deadline: string | null
          step_id: string | null
          workflow_instance_id: string | null
          workflow_version_id: string | null
        }
        Insert: {
          action: string
          action_type?: string
          actor_id: string
          application_id?: string | null
          comments?: string | null
          created_at?: string
          delegated_from?: string | null
          delegated_to?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          responded_at?: string | null
          sla_deadline?: string | null
          step_id?: string | null
          workflow_instance_id?: string | null
          workflow_version_id?: string | null
        }
        Update: {
          action?: string
          action_type?: string
          actor_id?: string
          application_id?: string | null
          comments?: string | null
          created_at?: string
          delegated_from?: string | null
          delegated_to?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          responded_at?: string | null
          sla_deadline?: string | null
          step_id?: string | null
          workflow_instance_id?: string | null
          workflow_version_id?: string | null
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
            foreignKeyName: "approval_actions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "report_view_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_actions_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "approval_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_actions_workflow_instance_id_fkey"
            columns: ["workflow_instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_actions_workflow_version_id_fkey"
            columns: ["workflow_version_id"]
            isOneToOne: false
            referencedRelation: "approval_workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_step_actions: {
        Row: {
          action_type: string
          created_at: string
          end_state: string | null
          id: string
          is_enabled: boolean
          label: string | null
          next_step_id: string | null
          next_step_mode: string
          require_comments: boolean
          require_digital_signature: boolean
          result_status_override: string | null
          signature_data_url: string | null
          sort_order: number
          step_id: string
          updated_at: string
        }
        Insert: {
          action_type: string
          created_at?: string
          end_state?: string | null
          id?: string
          is_enabled?: boolean
          label?: string | null
          next_step_id?: string | null
          next_step_mode?: string
          require_comments?: boolean
          require_digital_signature?: boolean
          result_status_override?: string | null
          signature_data_url?: string | null
          sort_order?: number
          step_id: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          end_state?: string | null
          id?: string
          is_enabled?: boolean
          label?: string | null
          next_step_id?: string | null
          next_step_mode?: string
          require_comments?: boolean
          require_digital_signature?: boolean
          result_status_override?: string | null
          signature_data_url?: string | null
          sort_order?: number
          step_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_step_actions_next_step_id_fkey"
            columns: ["next_step_id"]
            isOneToOne: false
            referencedRelation: "approval_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_step_actions_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "approval_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_step_entry_notifications: {
        Row: {
          created_at: string
          event_key: string
          id: string
          is_enabled: boolean
          recipient_config: Json
          recipient_type: string
          step_id: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_key: string
          id?: string
          is_enabled?: boolean
          recipient_config?: Json
          recipient_type: string
          step_id: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_key?: string
          id?: string
          is_enabled?: boolean
          recipient_config?: Json
          recipient_type?: string
          step_id?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_step_entry_notifications_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "approval_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_step_entry_notifications_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_steps: {
        Row: {
          allowed_actions: Json
          approver_config: Json
          approver_role: Database["public"]["Enums"]["app_role"]
          approver_role_id: string | null
          approver_type: string
          auto_approve_on_timeout: boolean
          condition: Json | null
          created_at: string
          description: string | null
          escalation_after_hours: number | null
          escalation_role: string | null
          id: string
          is_required: boolean
          name: string
          sla_hours: number | null
          step_entry_notifications_enabled: boolean
          step_order: number
          step_type: string
          workflow_id: string
        }
        Insert: {
          allowed_actions?: Json
          approver_config?: Json
          approver_role: Database["public"]["Enums"]["app_role"]
          approver_role_id?: string | null
          approver_type?: string
          auto_approve_on_timeout?: boolean
          condition?: Json | null
          created_at?: string
          description?: string | null
          escalation_after_hours?: number | null
          escalation_role?: string | null
          id?: string
          is_required?: boolean
          name: string
          sla_hours?: number | null
          step_entry_notifications_enabled?: boolean
          step_order: number
          step_type?: string
          workflow_id: string
        }
        Update: {
          allowed_actions?: Json
          approver_config?: Json
          approver_role?: Database["public"]["Enums"]["app_role"]
          approver_role_id?: string | null
          approver_type?: string
          auto_approve_on_timeout?: boolean
          condition?: Json | null
          created_at?: string
          description?: string | null
          escalation_after_hours?: number | null
          escalation_role?: string | null
          id?: string
          is_required?: boolean
          name?: string
          sla_hours?: number | null
          step_entry_notifications_enabled?: boolean
          step_order?: number
          step_type?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_steps_approver_role_id_fkey"
            columns: ["approver_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "approval_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_workflow_types: {
        Row: {
          created_at: string
          description: string | null
          display_label: string
          is_active: boolean
          key: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_label: string
          is_active?: boolean
          key: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_label?: string
          is_active?: boolean
          key?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      approval_workflow_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          published_at: string | null
          snapshot: Json
          status: string
          version_number: number
          workflow_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          published_at?: string | null
          snapshot: Json
          status?: string
          version_number: number
          workflow_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          published_at?: string | null
          snapshot?: Json
          status?: string
          version_number?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_workflow_versions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "approval_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_workflows: {
        Row: {
          category_id: string | null
          created_at: string
          current_published_version_id: string | null
          description: string | null
          draft_version_id: string | null
          entity_type: string
          id: string
          is_active: boolean
          license_type: string
          name: string
          regulator_id: string | null
          sector_id: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          current_published_version_id?: string | null
          description?: string | null
          draft_version_id?: string | null
          entity_type: string
          id?: string
          is_active?: boolean
          license_type: string
          name: string
          regulator_id?: string | null
          sector_id?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          current_published_version_id?: string | null
          description?: string | null
          draft_version_id?: string | null
          entity_type?: string
          id?: string
          is_active?: boolean
          license_type?: string
          name?: string
          regulator_id?: string | null
          sector_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_workflows_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_workflows_current_published_version_id_fkey"
            columns: ["current_published_version_id"]
            isOneToOne: false
            referencedRelation: "approval_workflow_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_workflows_draft_version_id_fkey"
            columns: ["draft_version_id"]
            isOneToOne: false
            referencedRelation: "approval_workflow_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_workflows_entity_type_fkey"
            columns: ["entity_type"]
            isOneToOne: false
            referencedRelation: "approval_workflow_types"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "approval_workflows_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_workflows_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
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
      complaint_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      complaints: {
        Row: {
          complainant_id: string | null
          complaint_number: string
          complaint_type_id: string | null
          created_at: string
          description: string
          email: string | null
          id: string
          investigator_id: string | null
          license_holder_id: string | null
          regulator_id: string | null
          resolution: string | null
          search_vector: unknown
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          complainant_id?: string | null
          complaint_number?: string
          complaint_type_id?: string | null
          created_at?: string
          description: string
          email?: string | null
          id?: string
          investigator_id?: string | null
          license_holder_id?: string | null
          regulator_id?: string | null
          resolution?: string | null
          search_vector?: unknown
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          complainant_id?: string | null
          complaint_number?: string
          complaint_type_id?: string | null
          created_at?: string
          description?: string
          email?: string | null
          id?: string
          investigator_id?: string | null
          license_holder_id?: string | null
          regulator_id?: string | null
          resolution?: string | null
          search_vector?: unknown
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_complaint_type_id_fkey"
            columns: ["complaint_type_id"]
            isOneToOne: false
            referencedRelation: "complaint_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_returns: {
        Row: {
          ack_at: string | null
          ack_by: string | null
          ack_text: string | null
          created_at: string
          due_date: string
          form_data: Json | null
          id: string
          license_id: string | null
          on_behalf_of_licensee_id: string | null
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
          ack_at?: string | null
          ack_by?: string | null
          ack_text?: string | null
          created_at?: string
          due_date: string
          form_data?: Json | null
          id?: string
          license_id?: string | null
          on_behalf_of_licensee_id?: string | null
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
          ack_at?: string | null
          ack_by?: string | null
          ack_text?: string | null
          created_at?: string
          due_date?: string
          form_data?: Json | null
          id?: string
          license_id?: string | null
          on_behalf_of_licensee_id?: string | null
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
            foreignKeyName: "compliance_returns_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "report_view_licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_returns_on_behalf_of_licensee_id_fkey"
            columns: ["on_behalf_of_licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
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
      countries: {
        Row: {
          created_at: string
          id: string
          iso_code: string
          name: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          iso_code: string
          name: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          iso_code?: string
          name?: string
          status?: string
        }
        Relationships: []
      }
      delegation_rules: {
        Row: {
          condition: Json
          created_at: string
          delegate_from_user_id: string | null
          delegate_to_user_id: string | null
          description: string | null
          effective_from: string | null
          effective_until: string | null
          id: string
          is_active: boolean
          name: string
          target_role: Database["public"]["Enums"]["app_role"]
          target_user_id: string | null
        }
        Insert: {
          condition: Json
          created_at?: string
          delegate_from_user_id?: string | null
          delegate_to_user_id?: string | null
          description?: string | null
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          is_active?: boolean
          name: string
          target_role: Database["public"]["Enums"]["app_role"]
          target_user_id?: string | null
        }
        Update: {
          condition?: Json
          created_at?: string
          delegate_from_user_id?: string | null
          delegate_to_user_id?: string | null
          description?: string | null
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          is_active?: boolean
          name?: string
          target_role?: Database["public"]["Enums"]["app_role"]
          target_user_id?: string | null
        }
        Relationships: []
      }
      document_action_logs: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          details: Json | null
          group_id: string
          id: string
          version_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          details?: Json | null
          group_id: string
          id?: string
          version_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          details?: Json | null
          group_id?: string
          id?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_action_logs_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "document_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_action_logs_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_groups: {
        Row: {
          created_at: string
          current_version_id: string | null
          display_name: string | null
          document_type: string
          entity_id: string | null
          entity_type: string
          id: string
          is_deleted: boolean
          metadata: Json | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_version_id?: string | null
          display_name?: string | null
          document_type: string
          entity_id?: string | null
          entity_type: string
          id?: string
          is_deleted?: boolean
          metadata?: Json | null
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_version_id?: string | null
          display_name?: string | null
          document_type?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          is_deleted?: boolean
          metadata?: Json | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_groups_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          change_note: string | null
          created_at: string
          file_upload_id: string
          group_id: string
          id: string
          is_deleted: boolean
          uploaded_by: string
          version: number
        }
        Insert: {
          change_note?: string | null
          created_at?: string
          file_upload_id: string
          group_id: string
          id?: string
          is_deleted?: boolean
          uploaded_by: string
          version: number
        }
        Update: {
          change_note?: string | null
          created_at?: string
          file_upload_id?: string
          group_id?: string
          id?: string
          is_deleted?: boolean
          uploaded_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "document_groups"
            referencedColumns: ["id"]
          },
        ]
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
      enforcement_actions: {
        Row: {
          case_number: string
          created_at: string
          date_opened: string
          description: string | null
          enforcement_type: string
          entity_id: string
          findings: string | null
          id: string
          penalty_amount: number | null
          resolution_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          case_number?: string
          created_at?: string
          date_opened?: string
          description?: string | null
          enforcement_type?: string
          entity_id: string
          findings?: string | null
          id?: string
          penalty_amount?: number | null
          resolution_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          case_number?: string
          created_at?: string
          date_opened?: string
          description?: string | null
          enforcement_type?: string
          entity_id?: string
          findings?: string | null
          id?: string
          penalty_amount?: number | null
          resolution_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enforcement_actions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_relationships: {
        Row: {
          created_at: string
          effective_date: string | null
          entity_id: string
          id: string
          notes: string | null
          ownership_percentage: number | null
          related_entity_id: string | null
          related_entity_name: string
          relationship_type: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_date?: string | null
          entity_id: string
          id?: string
          notes?: string | null
          ownership_percentage?: number | null
          related_entity_id?: string | null
          related_entity_name: string
          relationship_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_date?: string | null
          entity_id?: string
          id?: string
          notes?: string | null
          ownership_percentage?: number | null
          related_entity_id?: string | null
          related_entity_name?: string
          relationship_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_relationships_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relationships_related_entity_id_fkey"
            columns: ["related_entity_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_user_access: {
        Row: {
          access_type: Database["public"]["Enums"]["entity_access_type"]
          created_at: string
          created_by: string | null
          end_date: string | null
          entity_id: string
          id: string
          is_active: boolean
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_type: Database["public"]["Enums"]["entity_access_type"]
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          entity_id: string
          id?: string
          is_active?: boolean
          start_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_type?: Database["public"]["Enums"]["entity_access_type"]
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          entity_id?: string
          id?: string
          is_active?: boolean
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_user_access_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_user_access_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_user_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_components: {
        Row: {
          amount: number
          application_id: string
          created_at: string
          description: string | null
          fee_type_id: string
          id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          application_id: string
          created_at?: string
          description?: string | null
          fee_type_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          application_id?: string
          created_at?: string
          description?: string | null
          fee_type_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_components_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_components_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "report_view_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_components_fee_type_id_fkey"
            columns: ["fee_type_id"]
            isOneToOne: false
            referencedRelation: "fee_types"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_configurations: {
        Row: {
          amount: number
          calculation_expression: string | null
          calculation_type: string
          category_id: string | null
          created_at: string
          currency: string
          fee_type: string
          group_id: string
          id: string
          is_active: boolean
          max_amount: number | null
          min_amount: number | null
          name: string
          regulator_id: string | null
          sector_id: string | null
          service_id: string | null
          sub_sector_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          calculation_expression?: string | null
          calculation_type?: string
          category_id?: string | null
          created_at?: string
          currency?: string
          fee_type?: string
          group_id?: string
          id?: string
          is_active?: boolean
          max_amount?: number | null
          min_amount?: number | null
          name: string
          regulator_id?: string | null
          sector_id?: string | null
          service_id?: string | null
          sub_sector_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          calculation_expression?: string | null
          calculation_type?: string
          category_id?: string | null
          created_at?: string
          currency?: string
          fee_type?: string
          group_id?: string
          id?: string
          is_active?: boolean
          max_amount?: number | null
          min_amount?: number | null
          name?: string
          regulator_id?: string | null
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
            foreignKeyName: "fee_configurations_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
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
      fee_rules: {
        Row: {
          condition: Json
          created_at: string
          description: string | null
          discount_amount: number | null
          discount_percent: number | null
          expression: string | null
          fee_configuration_id: string
          id: string
          is_active: boolean
          name: string
          priority: number
          rule_type: string
          updated_at: string
        }
        Insert: {
          condition?: Json
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          expression?: string | null
          fee_configuration_id: string
          id?: string
          is_active?: boolean
          name: string
          priority?: number
          rule_type?: string
          updated_at?: string
        }
        Update: {
          condition?: Json
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          expression?: string | null
          fee_configuration_id?: string
          id?: string
          is_active?: boolean
          name?: string
          priority?: number
          rule_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_rules_fee_configuration_id_fkey"
            columns: ["fee_configuration_id"]
            isOneToOne: false
            referencedRelation: "fee_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_types: {
        Row: {
          code: string | null
          created_at: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      field_conditions: {
        Row: {
          action: string
          created_at: string
          field_id: string
          id: string
          operator: string
          value: string | null
          watch_field_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          field_id: string
          id?: string
          operator?: string
          value?: string | null
          watch_field_id: string
        }
        Update: {
          action?: string
          created_at?: string
          field_id?: string
          id?: string
          operator?: string
          value?: string | null
          watch_field_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_conditions_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      file_uploads: {
        Row: {
          access_count: number
          bucket_name: string
          created_at: string
          entity_id: string | null
          entity_type: string
          expires_at: string | null
          file_extension: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          is_quarantined: boolean
          last_accessed_at: string | null
          metadata: Json | null
          mime_type: string
          scan_status: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          access_count?: number
          bucket_name?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          expires_at?: string | null
          file_extension: string
          file_name: string
          file_path: string
          file_size: number
          id?: string
          is_quarantined?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          mime_type: string
          scan_status?: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          access_count?: number
          bucket_name?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          expires_at?: string | null
          file_extension?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          is_quarantined?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          mime_type?: string
          scan_status?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      form_field_dependencies: {
        Row: {
          created_at: string
          dependent_field_id: string
          dependent_form_id: string
          formula_reference: string | null
          id: string
          source_field_id: string
          source_form_id: string
        }
        Insert: {
          created_at?: string
          dependent_field_id: string
          dependent_form_id: string
          formula_reference?: string | null
          id?: string
          source_field_id: string
          source_form_id: string
        }
        Update: {
          created_at?: string
          dependent_field_id?: string
          dependent_form_id?: string
          formula_reference?: string | null
          id?: string
          source_field_id?: string
          source_form_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_field_dependencies_dependent_form_id_fkey"
            columns: ["dependent_form_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_field_dependencies_source_form_id_fkey"
            columns: ["source_form_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          calculated_expression: string | null
          content: string | null
          created_at: string
          default_value: string | null
          field_name: string
          field_type: string
          help_text: string | null
          id: string
          label: string
          options: Json | null
          placeholder: string | null
          required: boolean
          section_description: string | null
          section_id: string
          section_is_repeatable: boolean
          section_order: number
          section_title: string
          sort_order: number
          table_columns: Json | null
          validation: Json | null
          version_id: string
        }
        Insert: {
          calculated_expression?: string | null
          content?: string | null
          created_at?: string
          default_value?: string | null
          field_name: string
          field_type?: string
          help_text?: string | null
          id?: string
          label: string
          options?: Json | null
          placeholder?: string | null
          required?: boolean
          section_description?: string | null
          section_id: string
          section_is_repeatable?: boolean
          section_order?: number
          section_title?: string
          sort_order?: number
          table_columns?: Json | null
          validation?: Json | null
          version_id: string
        }
        Update: {
          calculated_expression?: string | null
          content?: string | null
          created_at?: string
          default_value?: string | null
          field_name?: string
          field_type?: string
          help_text?: string | null
          id?: string
          label?: string
          options?: Json | null
          placeholder?: string | null
          required?: boolean
          section_description?: string | null
          section_id?: string
          section_is_repeatable?: boolean
          section_order?: number
          section_title?: string
          sort_order?: number
          table_columns?: Json | null
          validation?: Json | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_responses: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          response_data: Json
          status: string
          submitted_at: string | null
          template_id: string
          updated_at: string
          user_id: string
          version_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          response_data?: Json
          status?: string
          submitted_at?: string | null
          template_id: string
          updated_at?: string
          user_id: string
          version_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          response_data?: Json
          status?: string
          submitted_at?: string | null
          template_id?: string
          updated_at?: string
          user_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_responses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          category: string
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          form_order: number
          form_type: string
          id: string
          is_reusable: boolean
          name: string
          regulator_id: string | null
          return_template_id: string | null
          return_type_id: string | null
          sector: string
          sector_id: string | null
          service: string
          service_id: string | null
          sheet_name: string | null
          status: string
          sub_sector: string
          sub_sector_id: string | null
          tab_name: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          form_order?: number
          form_type?: string
          id?: string
          is_reusable?: boolean
          name: string
          regulator_id?: string | null
          return_template_id?: string | null
          return_type_id?: string | null
          sector?: string
          sector_id?: string | null
          service?: string
          service_id?: string | null
          sheet_name?: string | null
          status?: string
          sub_sector?: string
          sub_sector_id?: string | null
          tab_name?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          form_order?: number
          form_type?: string
          id?: string
          is_reusable?: boolean
          name?: string
          regulator_id?: string | null
          return_template_id?: string | null
          return_type_id?: string | null
          sector?: string
          sector_id?: string | null
          service?: string
          service_id?: string | null
          sheet_name?: string | null
          status?: string
          sub_sector?: string
          sub_sector_id?: string | null
          tab_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_return_template_id_fkey"
            columns: ["return_template_id"]
            isOneToOne: false
            referencedRelation: "return_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_return_type_id_fkey"
            columns: ["return_type_id"]
            isOneToOne: false
            referencedRelation: "return_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_sub_sector_id_fkey"
            columns: ["sub_sector_id"]
            isOneToOne: false
            referencedRelation: "sub_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      form_versions: {
        Row: {
          branched_from_version_id: string | null
          change_notes: string | null
          created_at: string
          created_by: string | null
          effective_from: string | null
          effective_until: string | null
          id: string
          notified_for_upcoming: boolean
          published_at: string | null
          schema_snapshot: Json
          semantic_version: string | null
          status: string
          template_id: string
          version: number
        }
        Insert: {
          branched_from_version_id?: string | null
          change_notes?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          notified_for_upcoming?: boolean
          published_at?: string | null
          schema_snapshot?: Json
          semantic_version?: string | null
          status?: string
          template_id: string
          version?: number
        }
        Update: {
          branched_from_version_id?: string | null
          change_notes?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          notified_for_upcoming?: boolean
          published_at?: string | null
          schema_snapshot?: Json
          semantic_version?: string | null
          status?: string
          template_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_versions_branched_from_version_id_fkey"
            columns: ["branched_from_version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
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
          regulator_id: string | null
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
          regulator_id?: string | null
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
          regulator_id?: string | null
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
          {
            foreignKeyName: "forms_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          compliance_rating: string | null
          created_at: string
          date_conducted: string
          entity_id: string
          findings_summary: string | null
          follow_up_actions: string | null
          id: string
          inspection_type: string
          inspector_id: string | null
          inspector_name: string | null
          report_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          compliance_rating?: string | null
          created_at?: string
          date_conducted?: string
          entity_id: string
          findings_summary?: string | null
          follow_up_actions?: string | null
          id?: string
          inspection_type?: string
          inspector_id?: string | null
          inspector_name?: string | null
          report_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          compliance_rating?: string | null
          created_at?: string
          date_conducted?: string
          entity_id?: string
          findings_summary?: string | null
          follow_up_actions?: string | null
          id?: string
          inspection_type?: string
          inspector_id?: string | null
          inspector_name?: string | null
          report_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
        ]
      }
      job_queue: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          max_attempts: number
          payload: Json
          priority: number
          started_at: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          started_at?: string | null
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          started_at?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      late_fee_penalty_tiers: {
        Row: {
          created_at: string
          days_from: number
          days_to: number
          id: string
          late_fee_structure_id: string
          penalty_percentage: number
          tier_label: string
        }
        Insert: {
          created_at?: string
          days_from: number
          days_to: number
          id?: string
          late_fee_structure_id: string
          penalty_percentage?: number
          tier_label: string
        }
        Update: {
          created_at?: string
          days_from?: number
          days_to?: number
          id?: string
          late_fee_structure_id?: string
          penalty_percentage?: number
          tier_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "late_fee_penalty_tiers_late_fee_structure_id_fkey"
            columns: ["late_fee_structure_id"]
            isOneToOne: false
            referencedRelation: "late_fee_structures"
            referencedColumns: ["id"]
          },
        ]
      }
      late_fee_structures: {
        Row: {
          base_amount: number
          created_at: string
          currency: string
          fee_name: string
          id: string
          return_type_id: string | null
          sector_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          base_amount?: number
          created_at?: string
          currency?: string
          fee_name: string
          id?: string
          return_type_id?: string | null
          sector_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          base_amount?: number
          created_at?: string
          currency?: string
          fee_name?: string
          id?: string
          return_type_id?: string | null
          sector_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "late_fee_structures_return_type_id_fkey"
            columns: ["return_type_id"]
            isOneToOne: false
            referencedRelation: "return_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_fee_structures_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
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
          {
            foreignKeyName: "license_actions_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "report_view_licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      licensees: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          license_id: string | null
          name: string
          sector_id: string | null
          status: string
          sub_sector_id: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          license_id?: string | null
          name: string
          sector_id?: string | null
          status?: string
          sub_sector_id?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          license_id?: string | null
          name?: string
          sector_id?: string | null
          status?: string
          sub_sector_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "licensees_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensees_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensees_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "report_view_licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensees_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensees_sub_sector_id_fkey"
            columns: ["sub_sector_id"]
            isOneToOne: false
            referencedRelation: "sub_sectors"
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
          regulator_id: string | null
          search_vector: unknown
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
          regulator_id?: string | null
          search_vector?: unknown
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
          regulator_id?: string | null
          search_vector?: unknown
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
            foreignKeyName: "licenses_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "report_view_applications"
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
            foreignKeyName: "licenses_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
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
      master_data_items: {
        Row: {
          code: string | null
          created_at: string
          id: string
          metadata: Json | null
          name: string
          parent_item_id: string | null
          sort_order: number
          status: string
          type_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          name: string
          parent_item_id?: string | null
          sort_order?: number
          status?: string
          type_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          name?: string
          parent_item_id?: string | null
          sort_order?: number
          status?: string
          type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_data_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "master_data_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_data_items_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "master_data_types"
            referencedColumns: ["id"]
          },
        ]
      }
      master_data_types: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_dispatch_log: {
        Row: {
          channel: string
          created_at: string
          dedupe_key: string
          entity_id: string | null
          entity_type: string | null
          error: string | null
          event_key: string
          id: string
          last_attempt_at: string | null
          payload: Json | null
          provider_message_id: string | null
          recipient_email: string | null
          recipient_user_id: string | null
          reminder_window: string | null
          retry_count: number
          sent_at: string | null
          status: string
          subject: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          dedupe_key: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          event_key: string
          id?: string
          last_attempt_at?: string | null
          payload?: Json | null
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_user_id?: string | null
          reminder_window?: string | null
          retry_count?: number
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          dedupe_key?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          event_key?: string
          id?: string
          last_attempt_at?: string | null
          payload?: Json | null
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_user_id?: string | null
          reminder_window?: string | null
          retry_count?: number
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: []
      }
      notification_event_configs: {
        Row: {
          channels: string[]
          created_at: string
          dedupe_window_seconds: number
          description: string | null
          email_body_template: string | null
          email_subject_template: string | null
          event_key: string
          id: string
          is_active: boolean
          message_template: string
          notification_type: string
          recipient_rules: Json
          title_template: string
          updated_at: string
        }
        Insert: {
          channels?: string[]
          created_at?: string
          dedupe_window_seconds?: number
          description?: string | null
          email_body_template?: string | null
          email_subject_template?: string | null
          event_key: string
          id?: string
          is_active?: boolean
          message_template: string
          notification_type?: string
          recipient_rules?: Json
          title_template: string
          updated_at?: string
        }
        Update: {
          channels?: string[]
          created_at?: string
          dedupe_window_seconds?: number
          description?: string | null
          email_body_template?: string | null
          email_subject_template?: string | null
          event_key?: string
          id?: string
          is_active?: boolean
          message_template?: string
          notification_type?: string
          recipient_rules?: Json
          title_template?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          is_active: boolean
          name: string
          regulator_id: string | null
          subject: string | null
          updated_at: string
          variables: Json
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          is_active?: boolean
          name: string
          regulator_id?: string | null
          subject?: string | null
          updated_at?: string
          variables?: Json
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          is_active?: boolean
          name?: string
          regulator_id?: string | null
          subject?: string | null
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: string
          created_at: string
          delivery_status: string
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
          channel?: string
          created_at?: string
          delivery_status?: string
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
          channel?: string
          created_at?: string
          delivery_status?: string
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
      otp_verifications: {
        Row: {
          attempts: number
          channel: string
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          max_attempts: number
          purpose: string
          user_email: string
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          channel?: string
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          max_attempts?: number
          purpose?: string
          user_email: string
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          channel?: string
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          max_attempts?: number
          purpose?: string
          user_email?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      payment_attachments: {
        Row: {
          bucket_name: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          mime_type: string
          payment_id: string
          uploaded_by: string
        }
        Insert: {
          bucket_name?: string
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number
          id?: string
          mime_type?: string
          payment_id: string
          uploaded_by: string
        }
        Update: {
          bucket_name?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          mime_type?: string
          payment_id?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      payment_receipts: {
        Row: {
          amount: number
          created_at: string
          currency: string
          fee_breakdown: Json
          id: string
          issued_at: string
          issued_to_email: string | null
          issued_to_name: string
          payment_id: string
          receipt_number: string
          voided_at: string | null
          voided_reason: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          fee_breakdown?: Json
          id?: string
          issued_at?: string
          issued_to_email?: string | null
          issued_to_name: string
          payment_id: string
          receipt_number?: string
          voided_at?: string | null
          voided_reason?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          fee_breakdown?: Json
          id?: string
          issued_at?: string
          issued_to_email?: string | null
          issued_to_name?: string
          payment_id?: string
          receipt_number?: string
          voided_at?: string | null
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "report_view_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_remarks: {
        Row: {
          author_id: string
          author_name: string | null
          author_role: string | null
          created_at: string
          id: string
          payment_id: string
          remark: string
          updated_at: string
        }
        Insert: {
          author_id: string
          author_name?: string | null
          author_role?: string | null
          created_at?: string
          id?: string
          payment_id: string
          remark: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          author_name?: string | null
          author_role?: string | null
          created_at?: string
          id?: string
          payment_id?: string
          remark?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_remarks_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_remarks_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "report_view_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          admin_remarks: string | null
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
          admin_remarks?: string | null
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
          admin_remarks?: string | null
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
            foreignKeyName: "payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "report_view_applications"
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
      permissions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          module: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          module: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          module?: string
          name?: string
        }
        Relationships: []
      }
      ppoc_entity_mappings: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          licensee_id: string
          ppoc_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          licensee_id: string
          ppoc_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          licensee_id?: string
          ppoc_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppoc_entity_mappings_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
        ]
      }
      ppoc_mapping_sectors: {
        Row: {
          created_at: string
          id: string
          mapping_id: string
          sector_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mapping_id: string
          sector_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mapping_id?: string
          sector_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppoc_mapping_sectors_mapping_id_fkey"
            columns: ["mapping_id"]
            isOneToOne: false
            referencedRelation: "ppoc_entity_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppoc_mapping_sectors_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_license_users: {
        Row: {
          avatar_url: string | null
          bio: string | null
          category_id: string | null
          created_at: string
          department: string | null
          email: string
          entity_name: string | null
          full_name: string
          id: string
          phone: string | null
          sector_id: string | null
          status: string
          sub_sector_id: string | null
          two_factor_enabled: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          category_id?: string | null
          created_at?: string
          department?: string | null
          email: string
          entity_name?: string | null
          full_name: string
          id: string
          phone?: string | null
          sector_id?: string | null
          status?: string
          sub_sector_id?: string | null
          two_factor_enabled?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          category_id?: string | null
          created_at?: string
          department?: string | null
          email?: string
          entity_name?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          sector_id?: string | null
          status?: string
          sub_sector_id?: string | null
          two_factor_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_license_users_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_license_users_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_license_users_sub_sector_id_fkey"
            columns: ["sub_sector_id"]
            isOneToOne: false
            referencedRelation: "sub_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          department: string | null
          email: string
          entity_name: string
          force_password_change: boolean
          full_name: string
          gender: string | null
          id: string
          licensee_id: string | null
          phone: string | null
          role: string
          role_id: string | null
          search_vector: unknown
          status: string
          two_factor_enabled: boolean
          updated_at: string
          user_type: Database["public"]["Enums"]["user_type"]
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          department?: string | null
          email: string
          entity_name?: string
          force_password_change?: boolean
          full_name: string
          gender?: string | null
          id: string
          licensee_id?: string | null
          phone?: string | null
          role?: string
          role_id?: string | null
          search_vector?: unknown
          status?: string
          two_factor_enabled?: boolean
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          department?: string | null
          email?: string
          entity_name?: string
          force_password_change?: boolean
          full_name?: string
          gender?: string | null
          id?: string
          licensee_id?: string | null
          phone?: string | null
          role?: string
          role_id?: string | null
          search_vector?: unknown
          status?: string
          two_factor_enabled?: boolean
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          approved_by: string | null
          created_at: string
          id: string
          notes: string | null
          payment_id: string
          processed_at: string | null
          reason: string
          refund_method: string | null
          refund_reference: string | null
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          approved_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          payment_id: string
          processed_at?: string | null
          reason: string
          refund_method?: string | null
          refund_reference?: string | null
          requested_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          payment_id?: string
          processed_at?: string | null
          reason?: string
          refund_method?: string | null
          refund_reference?: string | null
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "report_view_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_form_configs: {
        Row: {
          category_id: string | null
          created_at: string
          data_protection_url: string | null
          declarations: Json
          document_types: Json
          form_schema: Json
          form_template_id: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          privacy_url: string | null
          require_captcha: boolean
          require_documents: boolean
          require_otp: boolean
          sector_id: string | null
          sub_sector_id: string | null
          terms_url: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          data_protection_url?: string | null
          declarations?: Json
          document_types?: Json
          form_schema?: Json
          form_template_id?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          privacy_url?: string | null
          require_captcha?: boolean
          require_documents?: boolean
          require_otp?: boolean
          sector_id?: string | null
          sub_sector_id?: string | null
          terms_url?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          data_protection_url?: string | null
          declarations?: Json
          document_types?: Json
          form_schema?: Json
          form_template_id?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          privacy_url?: string | null
          require_captcha?: boolean
          require_documents?: boolean
          require_otp?: boolean
          sector_id?: string | null
          sub_sector_id?: string | null
          terms_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_form_configs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_form_configs_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_form_configs_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_form_configs_sub_sector_id_fkey"
            columns: ["sub_sector_id"]
            isOneToOne: false
            referencedRelation: "sub_sectors"
            referencedColumns: ["id"]
          },
        ]
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
          documents_metadata: Json | null
          email: string
          email_verified: boolean | null
          entity_specific_data: Json | null
          first_name: string
          id: string
          last_name: string
          mailing_address: Json
          physical_address: Json
          registration_number: string | null
          registration_reference: string | null
          same_as_mailing: boolean
          sector_id: string
          status: string
          sub_sector_id: string
          telephone: string
          terms_accepted: boolean | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          applicant_name: string
          applicant_name_alt?: string | null
          category_id: string
          created_at?: string
          documents_metadata?: Json | null
          email: string
          email_verified?: boolean | null
          entity_specific_data?: Json | null
          first_name: string
          id?: string
          last_name: string
          mailing_address?: Json
          physical_address?: Json
          registration_number?: string | null
          registration_reference?: string | null
          same_as_mailing?: boolean
          sector_id: string
          status?: string
          sub_sector_id: string
          telephone: string
          terms_accepted?: boolean | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          applicant_name?: string
          applicant_name_alt?: string | null
          category_id?: string
          created_at?: string
          documents_metadata?: Json | null
          email?: string
          email_verified?: boolean | null
          entity_specific_data?: Json | null
          first_name?: string
          id?: string
          last_name?: string
          mailing_address?: Json
          physical_address?: Json
          registration_number?: string | null
          registration_reference?: string | null
          same_as_mailing?: boolean
          sector_id?: string
          status?: string
          sub_sector_id?: string
          telephone?: string
          terms_accepted?: boolean | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      regulators: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          settings: Json
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          settings?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          settings?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      reinsurance_contracts: {
        Row: {
          contract_number: string | null
          coverage_amount: number | null
          coverage_type: string
          created_at: string
          effective_from: string | null
          effective_to: string | null
          entity_id: string
          id: string
          premium_amount: number | null
          reinsurer_name: string
          status: string
          terms: string | null
          updated_at: string
        }
        Insert: {
          contract_number?: string | null
          coverage_amount?: number | null
          coverage_type?: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          entity_id: string
          id?: string
          premium_amount?: number | null
          reinsurer_name: string
          status?: string
          terms?: string | null
          updated_at?: string
        }
        Update: {
          contract_number?: string | null
          coverage_amount?: number | null
          coverage_type?: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          entity_id?: string
          id?: string
          premium_amount?: number | null
          reinsurer_name?: string
          status?: string
          terms?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reinsurance_contracts_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
        ]
      }
      report_dashboard_layouts: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          layout_key: string
          module: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          layout_key: string
          module?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          layout_key?: string
          module?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_dashboard_widgets: {
        Row: {
          chart_config: Json
          created_at: string
          description: string | null
          drilldown_filters: Json
          drilldown_report_slug: string | null
          icon: string | null
          id: string
          is_active: boolean
          layout_key: string
          metric_config: Json
          query_config: Json
          sort_order: number
          source_key: string | null
          title: string
          updated_at: string
          variant: string | null
          widget_key: string
          widget_type: string
          width: string
        }
        Insert: {
          chart_config?: Json
          created_at?: string
          description?: string | null
          drilldown_filters?: Json
          drilldown_report_slug?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          layout_key: string
          metric_config?: Json
          query_config?: Json
          sort_order?: number
          source_key?: string | null
          title: string
          updated_at?: string
          variant?: string | null
          widget_key: string
          widget_type: string
          width?: string
        }
        Update: {
          chart_config?: Json
          created_at?: string
          description?: string | null
          drilldown_filters?: Json
          drilldown_report_slug?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          layout_key?: string
          metric_config?: Json
          query_config?: Json
          sort_order?: number
          source_key?: string | null
          title?: string
          updated_at?: string
          variant?: string | null
          widget_key?: string
          widget_type?: string
          width?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_dashboard_widgets_layout_key_fkey"
            columns: ["layout_key"]
            isOneToOne: false
            referencedRelation: "report_dashboard_layouts"
            referencedColumns: ["layout_key"]
          },
        ]
      }
      report_definitions: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          default_columns: string[] | null
          default_filters: Json | null
          default_group_by: string | null
          default_sort_by: string | null
          default_sort_dir: string | null
          definition_json: Json
          description: string | null
          export_formats: string[] | null
          filter_config: Json | null
          id: string
          is_active: boolean | null
          module: string
          name: string
          query_config: Json | null
          report_type: string | null
          required_computed_columns: string[] | null
          slug: string
          sort_order: number | null
          source: string
          source_key: string | null
          supports_preview: boolean | null
          supports_schedule: boolean | null
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          default_columns?: string[] | null
          default_filters?: Json | null
          default_group_by?: string | null
          default_sort_by?: string | null
          default_sort_dir?: string | null
          definition_json?: Json
          description?: string | null
          export_formats?: string[] | null
          filter_config?: Json | null
          id?: string
          is_active?: boolean | null
          module: string
          name: string
          query_config?: Json | null
          report_type?: string | null
          required_computed_columns?: string[] | null
          slug: string
          sort_order?: number | null
          source: string
          source_key?: string | null
          supports_preview?: boolean | null
          supports_schedule?: boolean | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          default_columns?: string[] | null
          default_filters?: Json | null
          default_group_by?: string | null
          default_sort_by?: string | null
          default_sort_dir?: string | null
          definition_json?: Json
          description?: string | null
          export_formats?: string[] | null
          filter_config?: Json | null
          id?: string
          is_active?: boolean | null
          module?: string
          name?: string
          query_config?: Json | null
          report_type?: string | null
          required_computed_columns?: string[] | null
          slug?: string
          sort_order?: number | null
          source?: string
          source_key?: string | null
          supports_preview?: boolean | null
          supports_schedule?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      report_favorites: {
        Row: {
          created_at: string | null
          id: string
          report_slug: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          report_slug: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          report_slug?: string
          user_id?: string
        }
        Relationships: []
      }
      report_filters: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          filter_config: Json
          id: string
          is_global: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          filter_config?: Json
          id?: string
          is_global?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          filter_config?: Json
          id?: string
          is_global?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_logs: {
        Row: {
          action: string
          created_at: string
          error_message: string | null
          executed_by: string | null
          execution_time_ms: number | null
          export_format: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          record_count: number | null
          report_id: string | null
          report_name: string | null
          report_run_id: string | null
          schedule_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          created_at?: string
          error_message?: string | null
          executed_by?: string | null
          execution_time_ms?: number | null
          export_format?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          record_count?: number | null
          report_id?: string | null
          report_name?: string | null
          report_run_id?: string | null
          schedule_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          error_message?: string | null
          executed_by?: string | null
          execution_time_ms?: number | null
          export_format?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          record_count?: number | null
          report_id?: string | null
          report_name?: string | null
          report_run_id?: string | null
          schedule_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_logs_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_logs_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_logs_report_run_id_fkey"
            columns: ["report_run_id"]
            isOneToOne: false
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_logs_report_run_id_fkey"
            columns: ["report_run_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_logs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "report_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      report_option_sets: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          metadata: Json
          option_set_key: string
          sort_order: number
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          metadata?: Json
          option_set_key: string
          sort_order?: number
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          metadata?: Json
          option_set_key?: string
          sort_order?: number
          value?: string
        }
        Relationships: []
      }
      report_run_files: {
        Row: {
          created_at: string | null
          expires_at: string | null
          file_size: number | null
          format: string
          id: string
          report_run_id: string
          storage_path: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          file_size?: number | null
          format: string
          id?: string
          report_run_id: string
          storage_path?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          file_size?: number | null
          format?: string
          id?: string
          report_run_id?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_run_files_report_run_id_fkey"
            columns: ["report_run_id"]
            isOneToOne: false
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_run_files_report_run_id_fkey"
            columns: ["report_run_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_run_rows: {
        Row: {
          created_at: string | null
          id: string
          report_run_id: string
          row_data: Json
          row_index: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          report_run_id: string
          row_data?: Json
          row_index: number
        }
        Update: {
          created_at?: string | null
          id?: string
          report_run_id?: string
          row_data?: Json
          row_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_run_rows_report_run_id_fkey"
            columns: ["report_run_id"]
            isOneToOne: false
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_run_rows_report_run_id_fkey"
            columns: ["report_run_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_runtime_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      report_schedules: {
        Row: {
          created_at: string
          created_by: string
          cron_expression: string | null
          export_format: string
          filters_json: Json | null
          group_by: string | null
          id: string
          is_active: boolean
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          next_run_at: string | null
          recipient_roles: string[] | null
          recipients: Json
          report_definition_id: string | null
          report_id: string | null
          report_name: string | null
          report_slug: string | null
          retry_count: number | null
          schedule_type: string
          selected_columns: string[] | null
          sort_by: string | null
          sort_dir: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          cron_expression?: string | null
          export_format?: string
          filters_json?: Json | null
          group_by?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          next_run_at?: string | null
          recipient_roles?: string[] | null
          recipients?: Json
          report_definition_id?: string | null
          report_id?: string | null
          report_name?: string | null
          report_slug?: string | null
          retry_count?: number | null
          schedule_type?: string
          selected_columns?: string[] | null
          sort_by?: string | null
          sort_dir?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          cron_expression?: string | null
          export_format?: string
          filters_json?: Json | null
          group_by?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          next_run_at?: string | null
          recipient_roles?: string[] | null
          recipients?: Json
          report_definition_id?: string | null
          report_id?: string | null
          report_name?: string | null
          report_slug?: string | null
          retry_count?: number | null
          schedule_type?: string
          selected_columns?: string[] | null
          sort_by?: string | null
          sort_dir?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_schedules_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_schedules_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_source_columns: {
        Row: {
          column_key: string
          created_at: string
          data_type: string | null
          format: string | null
          id: string
          is_active: boolean
          is_computed: boolean
          is_default: boolean
          is_enriched: boolean
          is_raw_id: boolean
          is_sensitive: boolean
          label: string
          sort_order: number
          source_key: string
          updated_at: string
        }
        Insert: {
          column_key: string
          created_at?: string
          data_type?: string | null
          format?: string | null
          id?: string
          is_active?: boolean
          is_computed?: boolean
          is_default?: boolean
          is_enriched?: boolean
          is_raw_id?: boolean
          is_sensitive?: boolean
          label: string
          sort_order?: number
          source_key: string
          updated_at?: string
        }
        Update: {
          column_key?: string
          created_at?: string
          data_type?: string | null
          format?: string | null
          id?: string
          is_active?: boolean
          is_computed?: boolean
          is_default?: boolean
          is_enriched?: boolean
          is_raw_id?: boolean
          is_sensitive?: boolean
          label?: string
          sort_order?: number
          source_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_source_filters: {
        Row: {
          column_name: string | null
          created_at: string
          depends_on_filter: string | null
          filter_key: string
          filter_type: string
          id: string
          is_active: boolean
          label: string
          operator: string
          options_label_column: string | null
          options_source: string | null
          options_static: Json
          options_table: string | null
          options_value_column: string | null
          sort_order: number
          source_key: string
          updated_at: string
        }
        Insert: {
          column_name?: string | null
          created_at?: string
          depends_on_filter?: string | null
          filter_key: string
          filter_type: string
          id?: string
          is_active?: boolean
          label: string
          operator?: string
          options_label_column?: string | null
          options_source?: string | null
          options_static?: Json
          options_table?: string | null
          options_value_column?: string | null
          sort_order?: number
          source_key: string
          updated_at?: string
        }
        Update: {
          column_name?: string | null
          created_at?: string
          depends_on_filter?: string | null
          filter_key?: string
          filter_type?: string
          id?: string
          is_active?: boolean
          label?: string
          operator?: string
          options_label_column?: string | null
          options_source?: string | null
          options_static?: Json
          options_table?: string | null
          options_value_column?: string | null
          sort_order?: number
          source_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_source_filters_source_key_fkey"
            columns: ["source_key"]
            isOneToOne: false
            referencedRelation: "report_sources"
            referencedColumns: ["source_key"]
          },
        ]
      }
      report_sources: {
        Row: {
          created_at: string
          default_columns: string[]
          default_date_column: string | null
          description: string | null
          id: string
          is_active: boolean
          label: string
          max_generate_rows: number
          max_preview_rows: number
          module: string
          safe_columns: string[]
          search_columns: string[]
          sensitive_columns: string[]
          sort_order: number
          source_key: string
          source_routes: Json
          supports_ad_hoc: boolean
          supports_scheduling: boolean
          table_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_columns?: string[]
          default_date_column?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
          max_generate_rows?: number
          max_preview_rows?: number
          module: string
          safe_columns?: string[]
          search_columns?: string[]
          sensitive_columns?: string[]
          sort_order?: number
          source_key: string
          source_routes?: Json
          supports_ad_hoc?: boolean
          supports_scheduling?: boolean
          table_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_columns?: string[]
          default_date_column?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
          max_generate_rows?: number
          max_preview_rows?: number
          module?: string
          safe_columns?: string[]
          search_columns?: string[]
          sensitive_columns?: string[]
          sort_order?: number
          source_key?: string
          source_routes?: Json
          supports_ad_hoc?: boolean
          supports_scheduling?: boolean
          table_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_status_options: {
        Row: {
          color: string | null
          created_at: string
          filter_key: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          source_key: string
          value: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          filter_key?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          source_key: string
          value: string
        }
        Update: {
          color?: string | null
          created_at?: string
          filter_key?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          source_key?: string
          value?: string
        }
        Relationships: []
      }
      report_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          filters_json: Json | null
          group_by: string | null
          id: string
          name: string
          selected_columns: string[] | null
          sort_by: string | null
          sort_dir: string | null
          source: string
          updated_at: string | null
          visibility: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          filters_json?: Json | null
          group_by?: string | null
          id?: string
          name: string
          selected_columns?: string[] | null
          sort_by?: string | null
          sort_dir?: string | null
          source: string
          updated_at?: string | null
          visibility?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          filters_json?: Json | null
          group_by?: string | null
          id?: string
          name?: string
          selected_columns?: string[] | null
          sort_by?: string | null
          sort_dir?: string | null
          source?: string
          updated_at?: string | null
          visibility?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          category: string
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          duration_ms: number | null
          error_message: string | null
          expires_at: string | null
          filters_json: Json | null
          generated_at: string | null
          group_by: string | null
          id: string
          name: string
          query_config: Json
          regulator_id: string | null
          report_definition_id: string | null
          report_slug: string | null
          report_type: string
          result_count: number | null
          result_data: Json | null
          result_summary: Json | null
          selected_columns: string[] | null
          sort_by: string | null
          sort_dir: string | null
          source: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          category?: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          duration_ms?: number | null
          error_message?: string | null
          expires_at?: string | null
          filters_json?: Json | null
          generated_at?: string | null
          group_by?: string | null
          id?: string
          name: string
          query_config?: Json
          regulator_id?: string | null
          report_definition_id?: string | null
          report_slug?: string | null
          report_type?: string
          result_count?: number | null
          result_data?: Json | null
          result_summary?: Json | null
          selected_columns?: string[] | null
          sort_by?: string | null
          sort_dir?: string | null
          source?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          duration_ms?: number | null
          error_message?: string | null
          expires_at?: string | null
          filters_json?: Json | null
          generated_at?: string | null
          group_by?: string | null
          id?: string
          name?: string
          query_config?: Json
          regulator_id?: string | null
          report_definition_id?: string | null
          report_slug?: string | null
          report_type?: string
          result_count?: number | null
          result_data?: Json | null
          result_summary?: Json | null
          selected_columns?: string[] | null
          sort_by?: string | null
          sort_dir?: string | null
          source?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
      }
      return_audit_log: {
        Row: {
          action: string
          actor_role: string | null
          comments: string | null
          created_at: string
          event_key: string | null
          id: string
          metadata: Json
          new_status: string | null
          new_step_id: string | null
          performed_by: string | null
          previous_status: string | null
          previous_step_id: string | null
          return_id: string
          source: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          comments?: string | null
          created_at?: string
          event_key?: string | null
          id?: string
          metadata?: Json
          new_status?: string | null
          new_step_id?: string | null
          performed_by?: string | null
          previous_status?: string | null
          previous_step_id?: string | null
          return_id: string
          source?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          comments?: string | null
          created_at?: string
          event_key?: string | null
          id?: string
          metadata?: Json
          new_status?: string | null
          new_step_id?: string | null
          performed_by?: string | null
          previous_status?: string | null
          previous_step_id?: string | null
          return_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_audit_log_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns_filed"
            referencedColumns: ["id"]
          },
        ]
      }
      return_comments: {
        Row: {
          comment_text: string
          commented_by: string | null
          created_at: string
          form_id: string | null
          id: string
          is_editable: boolean
          return_id: string
          tab_name: string | null
          updated_at: string
        }
        Insert: {
          comment_text: string
          commented_by?: string | null
          created_at?: string
          form_id?: string | null
          id?: string
          is_editable?: boolean
          return_id: string
          tab_name?: string | null
          updated_at?: string
        }
        Update: {
          comment_text?: string
          commented_by?: string | null
          created_at?: string
          form_id?: string | null
          id?: string
          is_editable?: boolean
          return_id?: string
          tab_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_comments_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_comments_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns_filed"
            referencedColumns: ["id"]
          },
        ]
      }
      return_config_forms: {
        Row: {
          created_at: string
          display_order: number
          form_id: string
          id: string
          return_configuration_id: string
          status: string
          tab_name: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          form_id: string
          id?: string
          return_configuration_id: string
          status?: string
          tab_name?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          form_id?: string
          id?: string
          return_configuration_id?: string
          status?: string
          tab_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_config_forms_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_config_forms_return_configuration_id_fkey"
            columns: ["return_configuration_id"]
            isOneToOne: false
            referencedRelation: "return_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      return_configs: {
        Row: {
          created_at: string
          id: string
          name: string
          return_type_id: string
          sector_id: string | null
          status: string
          subsector_id: string | null
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          return_type_id: string
          sector_id?: string | null
          status?: string
          subsector_id?: string | null
          updated_at?: string
          version?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          return_type_id?: string
          sector_id?: string | null
          status?: string
          subsector_id?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_configs_return_type_id_fkey"
            columns: ["return_type_id"]
            isOneToOne: false
            referencedRelation: "return_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_configs_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_configs_subsector_id_fkey"
            columns: ["subsector_id"]
            isOneToOne: false
            referencedRelation: "sub_sectors"
            referencedColumns: ["id"]
          },
        ]
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
          regulator_id: string | null
          return_template_id: string | null
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
          regulator_id?: string | null
          return_template_id?: string | null
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
          regulator_id?: string | null
          return_template_id?: string | null
          sector_id?: string | null
          sub_sector_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_configurations_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_configurations_return_template_id_fkey"
            columns: ["return_template_id"]
            isOneToOne: false
            referencedRelation: "return_templates"
            referencedColumns: ["id"]
          },
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
      return_cutoff_config: {
        Row: {
          created_at: string
          cutoff_days: number
          cutoff_unit: Database["public"]["Enums"]["cutoff_unit_enum"]
          id: string
          return_type_id: string
          sector_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cutoff_days?: number
          cutoff_unit?: Database["public"]["Enums"]["cutoff_unit_enum"]
          id?: string
          return_type_id: string
          sector_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cutoff_days?: number
          cutoff_unit?: Database["public"]["Enums"]["cutoff_unit_enum"]
          id?: string
          return_type_id?: string
          sector_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_cutoff_config_return_type_id_fkey"
            columns: ["return_type_id"]
            isOneToOne: false
            referencedRelation: "return_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_cutoff_config_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      return_documents: {
        Row: {
          created_at: string
          document_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          return_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          return_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          return_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_documents_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns_filed"
            referencedColumns: ["id"]
          },
        ]
      }
      return_due_dates: {
        Row: {
          created_at: string
          due_date: string
          entity_id: string | null
          id: string
          notification_date: string | null
          notification_sent: boolean
          reminder_count: number
          return_configuration_id: string
          return_period: string
          return_year: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_date: string
          entity_id?: string | null
          id?: string
          notification_date?: string | null
          notification_sent?: boolean
          reminder_count?: number
          return_configuration_id: string
          return_period: string
          return_year: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_date?: string
          entity_id?: string | null
          id?: string
          notification_date?: string | null
          notification_sent?: boolean
          reminder_count?: number
          return_configuration_id?: string
          return_period?: string
          return_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_due_dates_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_due_dates_return_configuration_id_fkey"
            columns: ["return_configuration_id"]
            isOneToOne: false
            referencedRelation: "return_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      return_form_data: {
        Row: {
          created_at: string
          field_id: string
          field_name: string
          field_value: string | null
          form_id: string
          form_version_id: string | null
          id: string
          return_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_id: string
          field_name: string
          field_value?: string | null
          form_id: string
          form_version_id?: string | null
          id?: string
          return_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_id?: string
          field_name?: string
          field_value?: string | null
          form_id?: string
          form_version_id?: string | null
          id?: string
          return_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_form_data_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_form_data_form_version_id_fkey"
            columns: ["form_version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_form_data_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns_filed"
            referencedColumns: ["id"]
          },
        ]
      }
      return_form_versions: {
        Row: {
          assigned_by: string | null
          assigned_reason: string
          created_at: string
          id: string
          locked_at: string
          return_id: string
          status: string
          template_id: string
          updated_at: string
          version_id: string
        }
        Insert: {
          assigned_by?: string | null
          assigned_reason?: string
          created_at?: string
          id?: string
          locked_at?: string
          return_id: string
          status?: string
          template_id: string
          updated_at?: string
          version_id: string
        }
        Update: {
          assigned_by?: string | null
          assigned_reason?: string
          created_at?: string
          id?: string
          locked_at?: string
          return_id?: string
          status?: string
          template_id?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_form_versions_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns_filed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_form_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_form_versions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      return_notification_templates: {
        Row: {
          body_template: string
          created_at: string
          id: string
          name: string
          status: string
          subject_template: string | null
          template_code: string
          updated_at: string
        }
        Insert: {
          body_template: string
          created_at?: string
          id?: string
          name: string
          status?: string
          subject_template?: string | null
          template_code: string
          updated_at?: string
        }
        Update: {
          body_template?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          subject_template?: string | null
          template_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      return_notifications_log: {
        Row: {
          body: string | null
          created_at: string
          error_message: string | null
          id: string
          recipient_email: string | null
          recipient_user_id: string | null
          return_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status_enum"]
          subject: string | null
          template_code: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_email?: string | null
          recipient_user_id?: string | null
          return_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status_enum"]
          subject?: string | null
          template_code?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_email?: string | null
          recipient_user_id?: string | null
          return_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status_enum"]
          subject?: string | null
          template_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_notifications_log_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns_filed"
            referencedColumns: ["id"]
          },
        ]
      }
      return_requests: {
        Row: {
          created_at: string
          id: string
          reasons: string
          requested_by: string | null
          resolved_at: string | null
          return_id: string
          status: Database["public"]["Enums"]["return_request_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          reasons: string
          requested_by?: string | null
          resolved_at?: string | null
          return_id: string
          status?: Database["public"]["Enums"]["return_request_status"]
        }
        Update: {
          created_at?: string
          id?: string
          reasons?: string
          requested_by?: string | null
          resolved_at?: string | null
          return_id?: string
          status?: Database["public"]["Enums"]["return_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "return_requests_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns_filed"
            referencedColumns: ["id"]
          },
        ]
      }
      return_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          regulator_id: string | null
          sheet_count: number
          source_file_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          regulator_id?: string | null
          sheet_count?: number
          source_file_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          regulator_id?: string | null
          sheet_count?: number
          source_file_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_templates_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
      }
      return_types: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      returns_filed: {
        Row: {
          created_at: string
          created_by: string | null
          current_step_id: string | null
          due_date: string | null
          entity_id: string | null
          id: string
          on_behalf_of_licensee_id: string | null
          ontime_status:
            | Database["public"]["Enums"]["ontime_status_enum"]
            | null
          period_end_date: string
          period_start_date: string
          return_configuration_id: string
          return_period: string
          return_year: number
          sector_id: string | null
          status: string
          submit_date: string | null
          subsector_id: string | null
          unique_id: string
          updated_at: string
          updated_by: string | null
          version: string | null
          workflow_id: string | null
          workflow_status: Database["public"]["Enums"]["return_workflow_status"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_step_id?: string | null
          due_date?: string | null
          entity_id?: string | null
          id?: string
          on_behalf_of_licensee_id?: string | null
          ontime_status?:
            | Database["public"]["Enums"]["ontime_status_enum"]
            | null
          period_end_date: string
          period_start_date: string
          return_configuration_id: string
          return_period: string
          return_year: number
          sector_id?: string | null
          status?: string
          submit_date?: string | null
          subsector_id?: string | null
          unique_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: string | null
          workflow_id?: string | null
          workflow_status?: Database["public"]["Enums"]["return_workflow_status"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_step_id?: string | null
          due_date?: string | null
          entity_id?: string | null
          id?: string
          on_behalf_of_licensee_id?: string | null
          ontime_status?:
            | Database["public"]["Enums"]["ontime_status_enum"]
            | null
          period_end_date?: string
          period_start_date?: string
          return_configuration_id?: string
          return_period?: string
          return_year?: number
          sector_id?: string | null
          status?: string
          submit_date?: string | null
          subsector_id?: string | null
          unique_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: string | null
          workflow_id?: string | null
          workflow_status?: Database["public"]["Enums"]["return_workflow_status"]
        }
        Relationships: [
          {
            foreignKeyName: "returns_filed_current_step_id_fkey"
            columns: ["current_step_id"]
            isOneToOne: false
            referencedRelation: "approval_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_filed_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_filed_on_behalf_of_licensee_id_fkey"
            columns: ["on_behalf_of_licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_filed_return_configuration_id_fkey"
            columns: ["return_configuration_id"]
            isOneToOne: false
            referencedRelation: "return_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_filed_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_filed_subsector_id_fkey"
            columns: ["subsector_id"]
            isOneToOne: false
            referencedRelation: "sub_sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_filed_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "approval_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_ratings: {
        Row: {
          assessment_date: string
          assessor_id: string | null
          created_at: string
          entity_id: string
          id: string
          mitigation_measures: string | null
          notes: string | null
          overall_rating: string
          risk_factors: Json | null
          risk_score: number
          updated_at: string
        }
        Insert: {
          assessment_date?: string
          assessor_id?: string | null
          created_at?: string
          entity_id: string
          id?: string
          mitigation_measures?: string | null
          notes?: string | null
          overall_rating?: string
          risk_factors?: Json | null
          risk_score?: number
          updated_at?: string
        }
        Update: {
          assessment_date?: string
          assessor_id?: string | null
          created_at?: string
          entity_id?: string
          id?: string
          mitigation_measures?: string | null
          notes?: string | null
          overall_rating?: string
          risk_factors?: Json | null
          risk_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_ratings_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          system_role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          system_role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          system_role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sectors: {
        Row: {
          created_at: string
          id: string
          name: string
          regulator_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          regulator_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          regulator_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sectors_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
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
      site_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      states: {
        Row: {
          country_id: string
          created_at: string
          id: string
          name: string
          status: string
        }
        Insert: {
          country_id: string
          created_at?: string
          id?: string
          name: string
          status?: string
        }
        Update: {
          country_id?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "states_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
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
      user_dynamic_roles: {
        Row: {
          created_at: string
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_dynamic_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
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
      workflow_instances: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step_id: string | null
          current_step_key: string | null
          entity_id: string
          entity_type: string
          id: string
          started_at: string
          status: string
          updated_at: string
          version_snapshot: Json | null
          workflow_id: string
          workflow_version_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step_id?: string | null
          current_step_key?: string | null
          entity_id: string
          entity_type: string
          id?: string
          started_at?: string
          status?: string
          updated_at?: string
          version_snapshot?: Json | null
          workflow_id: string
          workflow_version_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step_id?: string | null
          current_step_key?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          started_at?: string
          status?: string
          updated_at?: string
          version_snapshot?: Json | null
          workflow_id?: string
          workflow_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_instances_current_step_id_fkey"
            columns: ["current_step_id"]
            isOneToOne: false
            referencedRelation: "approval_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instances_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "approval_workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instances_workflow_version_id_fkey"
            columns: ["workflow_version_id"]
            isOneToOne: false
            referencedRelation: "approval_workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          entity_type: string
          id: string
          name: string
          steps: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_type?: string
          id?: string
          name: string
          steps?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_type?: string
          id?: string
          name?: string
          steps?: Json
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      report_runs: {
        Row: {
          category: string | null
          completed_at: string | null
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          filters_json: Json | null
          generated_at: string | null
          generated_by: string | null
          group_by: string | null
          id: string | null
          report_definition_id: string | null
          report_name: string | null
          report_slug: string | null
          result_summary: Json | null
          row_count: number | null
          selected_columns: string[] | null
          sort_by: string | null
          sort_dir: string | null
          source: string | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          filters_json?: never
          generated_at?: string | null
          generated_by?: string | null
          group_by?: string | null
          id?: string | null
          report_definition_id?: string | null
          report_name?: string | null
          report_slug?: string | null
          result_summary?: Json | null
          row_count?: never
          selected_columns?: string[] | null
          sort_by?: string | null
          sort_dir?: string | null
          source?: string | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          filters_json?: never
          generated_at?: string | null
          generated_by?: string | null
          group_by?: string | null
          id?: string | null
          report_definition_id?: string | null
          report_name?: string | null
          report_slug?: string | null
          result_summary?: Json | null
          row_count?: never
          selected_columns?: string[] | null
          sort_by?: string | null
          sort_dir?: string | null
          source?: string | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      report_view_applications: {
        Row: {
          aging_days: number | null
          applicant_entity_name: string | null
          applicant_id: string | null
          applicant_name: string | null
          application_number: string | null
          approved_at: string | null
          assigned_officer_id: string | null
          assigned_officer_name: string | null
          created_at: string | null
          entity_name: string | null
          id: string | null
          license_type: string | null
          regulator_id: string | null
          regulator_name: string | null
          rejected_at: string | null
          status: string | null
          submitted_at: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
      }
      report_view_complaints: {
        Row: {
          applicant_entity_name: string | null
          assigned_officer_id: string | null
          assigned_officer_name: string | null
          category_id: string | null
          category_name: string | null
          complainant_id: string | null
          complainant_name: string | null
          complaint_number: string | null
          complaint_type: string | null
          created_at: string | null
          id: string | null
          regulator_id: string | null
          regulator_name: string | null
          resolution_days: number | null
          status: string | null
          subject: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complaints_complaint_type_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "complaint_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
      }
      report_view_compliance_returns: {
        Row: {
          applicant_entity_name: string | null
          created_at: string | null
          days_overdue: number | null
          due_date: string | null
          id: string | null
          license_id: string | null
          license_number: string | null
          licensee_id: string | null
          licensee_name: string | null
          period_end: string | null
          period_start: string | null
          regulator_id: string | null
          regulator_name: string | null
          return_period: string | null
          sector_id: string | null
          sector_name: string | null
          status: string | null
          submitted_at: string | null
          updated_at: string | null
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
            foreignKeyName: "compliance_returns_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "report_view_licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
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
            foreignKeyName: "profiles_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
        ]
      }
      report_view_licenses: {
        Row: {
          applicant_entity_name: string | null
          applicant_id: string | null
          applicant_name: string | null
          application_id: string | null
          application_number: string | null
          created_at: string | null
          days_to_expiry: number | null
          entity_name: string | null
          expiry_date: string | null
          holder_id: string | null
          holder_name: string | null
          id: string | null
          issued_at: string | null
          license_number: string | null
          license_type: string | null
          licensee_id: string | null
          licensee_name: string | null
          regulator_id: string | null
          regulator_name: string | null
          sector_id: string | null
          sector_name: string | null
          status: string | null
          sub_sector_id: string | null
          sub_sector_name: string | null
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
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
            foreignKeyName: "licenses_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "report_view_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
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
          {
            foreignKeyName: "profiles_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
        ]
      }
      report_view_payments: {
        Row: {
          amount: number | null
          applicant_entity_name: string | null
          application_id: string | null
          application_number: string | null
          created_at: string | null
          currency: string | null
          id: string | null
          payer_id: string | null
          payer_name: string | null
          payment_date: string | null
          payment_reference: string | null
          regulator_id: string | null
          regulator_name: string | null
          status: string | null
          transaction_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "report_view_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps_legacy_role_report: {
        Row: {
          approver_role_id: string | null
          legacy_approver_role: string | null
          resolved_role_name: string | null
          status: string | null
          step_name: string | null
          step_order: number | null
          workflow_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_steps_approver_role_id_fkey"
            columns: ["approver_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _resolve_application_workflow:
        | {
            Args: {
              _category_id: string
              _license_type: string
              _regulator_id: string
              _sector_id: string
            }
            Returns: {
              first_step_id: string
              workflow_id: string
            }[]
          }
        | {
            Args: {
              _category_id: string
              _is_post_license?: boolean
              _license_type: string
              _regulator_id: string
              _sector_id: string
            }
            Returns: {
              first_step_id: string
              workflow_id: string
            }[]
          }
      _resolve_effective_regulator: {
        Args: {
          _category_id: string
          _regulator_id: string
          _sector_id: string
        }
        Returns: string
      }
      activate_form_version_as_current: {
        Args: { _activation_date?: string; _version_id: string }
        Returns: Json
      }
      admin_override_form_version_assignment: {
        Args: {
          _application_id: string
          _reason: string
          _template_id: string
          _version_id: string
        }
        Returns: Json
      }
      application_ids_for_licensee: {
        Args: { _licensee_id: string }
        Returns: string[]
      }
      apply_application_guard: {
        Args: {
          _category_id: string
          _sector_id: string
          _service_id?: string
          _sub_sector_id: string
        }
        Returns: Json
      }
      assign_primary_user: {
        Args: { _entity_id: string; _user_id: string }
        Returns: Json
      }
      audit_document_reason: { Args: { _metadata: Json }; Returns: string }
      audit_document_review_status: {
        Args: { _metadata: Json }
        Returns: string
      }
      audit_step_assignee_label: { Args: { _step_id: string }; Returns: string }
      build_workflow_snapshot: { Args: { _workflow_id: string }; Returns: Json }
      can_current_user_access_licensee: {
        Args: { target_licensee_id: string; target_sector_id?: string }
        Returns: boolean
      }
      can_user_access_licensee: {
        Args: {
          _target_licensee_id: string
          _target_sector_id?: string
          _user_id: string
        }
        Returns: boolean
      }
      cancel_application: {
        Args: { _application_id: string; _reason?: string }
        Returns: Json
      }
      check_applicant_name_exists: {
        Args: { p_name: string }
        Returns: boolean
      }
      check_primary_user_email_exists: {
        Args: { p_email: string }
        Returns: boolean
      }
      complete_or_get_application_payment: {
        Args: { _amount?: number; _application_id: string }
        Returns: Json
      }
      create_approval_workflow_with_steps: {
        Args: { _steps: Json; _workflow: Json }
        Returns: Json
      }
      create_audit_log: {
        Args: {
          _action: string
          _entity_id?: string
          _entity_type: string
          _metadata?: Json
          _new_value?: Json
          _old_value?: Json
          _user_id: string
        }
        Returns: string
      }
      create_document_version: {
        Args: {
          _action?: string
          _change_note?: string
          _file_upload_id: string
          _group_id: string
        }
        Returns: {
          version: number
          version_id: string
        }[]
      }
      create_notification: {
        Args: {
          _entity_id?: string
          _entity_type?: string
          _message: string
          _title: string
          _type?: string
          _user_id: string
        }
        Returns: string
      }
      create_or_get_application_payment: {
        Args: { _amount?: number; _application_id: string }
        Returns: Json
      }
      delete_ppoc_mapping: { Args: { _mapping_id: string }; Returns: Json }
      expire_delegation_rules: { Args: never; Returns: number }
      generate_application_number: { Args: never; Returns: string }
      generate_complaint_number: { Args: never; Returns: string }
      generate_license_number: { Args: never; Returns: string }
      generate_receipt_number: { Args: never; Returns: string }
      generate_registration_reference: { Args: never; Returns: string }
      generate_return_unique_id: { Args: never; Returns: string }
      get_application_actions: {
        Args: { _application_id: string }
        Returns: {
          action: string
          actor_email: string
          actor_id: string
          actor_name: string
          application_id: string
          comments: string
          created_at: string
          id: string
        }[]
      }
      get_application_list_page:
        | {
            Args: {
              _licensee_id?: string
              _page: number
              _page_size: number
              _search: string
              _search_mode: string
              _sector_id?: string
              _sla?: string
              _sort_by: string
              _sort_dir: string
              _status: string
              _version_id: string
            }
            Returns: {
              action_count: number
              applicant_email: string
              applicant_id: string
              applicant_name: string
              application_number: string
              category_id: string
              category_name: string
              created_at: string
              data: Json
              form_version_id: string
              id: string
              license_type: string
              payment_amount: number
              payment_currency: string
              payment_id: string
              payment_method: string
              payment_paid_at: string
              payment_status: string
              resolved_sector_id: string
              sector_id: string
              sector_name: string
              service_id: string
              service_name: string
              status: string
              sub_sector_id: string
              sub_sector_name: string
              submitted_at: string
              total_count: number
            }[]
          }
        | {
            Args: {
              _licensee_id?: string
              _page: number
              _page_size: number
              _search: string
              _search_mode: string
              _sector_id?: string
              _sla?: string
              _sort_by: string
              _sort_dir: string
              _status: string
              _status_group?: string
              _version_id: string
            }
            Returns: {
              action_count: number
              applicant_email: string
              applicant_id: string
              applicant_name: string
              application_number: string
              category_id: string
              category_name: string
              created_at: string
              data: Json
              form_version_id: string
              id: string
              license_type: string
              payment_amount: number
              payment_currency: string
              payment_id: string
              payment_method: string
              payment_paid_at: string
              payment_status: string
              resolved_sector_id: string
              sector_id: string
              sector_name: string
              service_id: string
              service_name: string
              status: string
              sub_sector_id: string
              sub_sector_name: string
              submitted_at: string
              total_count: number
            }[]
          }
      get_application_list_stats: {
        Args: { _licensee_id?: string; _sector_id?: string }
        Returns: Json
      }
      get_form_version_usage_counts: {
        Args: { _template_id: string }
        Returns: {
          in_progress_count: number
          submitted_response_count: number
          version_id: string
        }[]
      }
      get_my_licenses_page: {
        Args: {
          _licensee_id?: string
          _page: number
          _page_size: number
          _search?: string
          _sector_id?: string
          _sort_by?: string
          _sort_dir?: string
          _status?: string
        }
        Returns: {
          application_id: string
          conditions: string
          created_at: string
          holder_id: string
          id: string
          issued_at: string
          license_number: string
          license_type: string
          resolved_sector_id: string
          sector_id: string
          status: string
          total_count: number
          valid_from: string
          valid_until: string
        }[]
      }
      get_my_ppoc_mapped_entities: {
        Args: never
        Returns: {
          application_id: string
          created_at: string
          entity_name: string
          license_number: string
          licensee_id: string
          mapping_id: string
          resolved_sector_id: string
          sector_id: string
        }[]
      }
      get_registration_reviewer_remarks: {
        Args: { _registration_id: string }
        Returns: string
      }
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
      is_doc_staff: { Args: { _user_id: string }; Returns: boolean }
      is_eligible_ppoc_user: {
        Args: { _existing_mapping_id?: string; _user_id: string }
        Returns: boolean
      }
      is_internal_staff_user: { Args: { _user_id: string }; Returns: boolean }
      is_primary_user_of: {
        Args: { _entity_id: string; _user_id: string }
        Returns: boolean
      }
      license_ids_for_licensee: {
        Args: { _licensee_id: string }
        Returns: string[]
      }
      license_recipients_for_holder: {
        Args: { _license_id: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      licensee_ids_for_license: {
        Args: { _license_id: string }
        Returns: string[]
      }
      log_self_audit: {
        Args: {
          _action: string
          _entity_id?: string
          _entity_type: string
          _metadata?: Json
          _new_value?: Json
          _old_value?: Json
        }
        Returns: string
      }
      mark_application_in_progress: {
        Args: { _application_id: string }
        Returns: Json
      }
      notification_recipients_for_role: {
        Args: { _role: string }
        Returns: string[]
      }
      perform_final_workflow_approval: {
        Args: {
          _actor_id: string
          _application_id: string
          _comments: string
          _instance_id: string
          _step_id: string
        }
        Returns: Json
      }
      perform_registration_workflow_transition: {
        Args: {
          _action_type: string
          _actor_id: string
          _comments: string
          _instance_id: string
          _registration_id: string
          _step_id: string
        }
        Returns: Json
      }
      perform_return_workflow_transition: {
        Args: {
          _action_type: string
          _actor_id: string
          _comments: string
          _instance_id: string
          _return_id: string
          _step_id: string
        }
        Returns: Json
      }
      perform_workflow_transition: {
        Args: {
          _action_type: string
          _actor_id: string
          _application_id: string
          _comments: string
          _instance_id: string
          _step_id: string
        }
        Returns: Json
      }
      ppoc_accessible_license_ids: {
        Args: { _user_id: string }
        Returns: string[]
      }
      ppoc_mapped_licensee_ids: {
        Args: { _user_id: string }
        Returns: string[]
      }
      provision_application_entity: {
        Args: { _application_id: string }
        Returns: Json
      }
      publish_workflow_version: {
        Args: { _notes?: string; _workflow_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          published_at: string | null
          snapshot: Json
          status: string
          version_number: number
          workflow_id: string
        }
        SetofOptions: {
          from: "*"
          to: "approval_workflow_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_application_action: {
        Args: { _application_id: string; _comments: string }
        Returns: Json
      }
      reorder_approval_steps: {
        Args: { _orders: Json; _workflow_id: string }
        Returns: undefined
      }
      request_resubmission_for_application: {
        Args: { _application_id: string; _comments: string }
        Returns: Json
      }
      reset_application_for_provisioning: {
        Args: { _application_id: string }
        Returns: Json
      }
      resolve_application_form_version: {
        Args: { _application_id: string; _template_id: string }
        Returns: Json
      }
      resolve_registration_workflow: {
        Args: { _sector_id: string }
        Returns: string
      }
      resolve_return_form_version: {
        Args: { _return_submission_id: string; _template_id: string }
        Returns: Json
      }
      resolve_return_workflow: { Args: { _return_id: string }; Returns: string }
      resubmit_return: {
        Args: { _actor_id: string; _comments: string; _return_id: string }
        Returns: Json
      }
      resume_registration_workflow: {
        Args: {
          _actor_id: string
          _comments?: string
          _registration_id: string
        }
        Returns: Json
      }
      save_ppoc_mapping: {
        Args: {
          _licensee_id: string
          _mapping_id: string
          _ppoc_user_id: string
          _sector_ids: string[]
        }
        Returns: Json
      }
      start_registration_workflow: {
        Args: { _registration_id: string }
        Returns: string
      }
      start_return_workflow: { Args: { _return_id: string }; Returns: Json }
      submit_application: {
        Args: { _ack_text?: string; _application_id: string }
        Returns: Json
      }
      toggle_ppoc_mapping_status: {
        Args: { _is_active: boolean; _mapping_id: string }
        Returns: Json
      }
      user_can_access_document_object: {
        Args: { _object_name: string }
        Returns: boolean
      }
      user_can_act_on_workflow_step: {
        Args: { _step_id: string; _user_id: string }
        Returns: Json
      }
      user_can_upload_document_object: {
        Args: { _object_name: string }
        Returns: boolean
      }
      user_licensee_id: { Args: { _user_id: string }; Returns: string }
      workflow_diagnostic_for_application: {
        Args: { _application_id: string }
        Returns: Json
      }
      write_audit: {
        Args: {
          _action: string
          _dedupe_seconds?: number
          _entity_id: string
          _entity_type: string
          _metadata?: Json
          _new_value?: Json
          _old_value?: Json
          _user_id: string
        }
        Returns: string
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
        | "pre_licensee"
        | "licensee_primary"
        | "licensee_secondary"
      cutoff_unit_enum: "days" | "weeks" | "months"
      entity_access_type: "primary_user" | "employee" | "secondary_contact"
      notification_status_enum: "pending" | "sent" | "failed"
      ontime_status_enum: "ON_TIME" | "LATE"
      return_audit_action:
        | "created"
        | "draft_saved"
        | "submitted"
        | "validated"
        | "rejected"
        | "resubmitted"
        | "comment_added"
        | "comment_edited"
        | "comment_deleted"
      return_request_status: "active" | "resolved"
      return_workflow_status: "TEMP" | "WIP" | "SUB" | "VAL" | "TBR" | "REJ"
      user_type: "primary" | "secondary" | "employee"
      workflow_notification_recipient:
        | "applicant"
        | "current_approver"
        | "previous_actor"
        | "role"
        | "admin"
        | "custom_email"
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
        "pre_licensee",
        "licensee_primary",
        "licensee_secondary",
      ],
      cutoff_unit_enum: ["days", "weeks", "months"],
      entity_access_type: ["primary_user", "employee", "secondary_contact"],
      notification_status_enum: ["pending", "sent", "failed"],
      ontime_status_enum: ["ON_TIME", "LATE"],
      return_audit_action: [
        "created",
        "draft_saved",
        "submitted",
        "validated",
        "rejected",
        "resubmitted",
        "comment_added",
        "comment_edited",
        "comment_deleted",
      ],
      return_request_status: ["active", "resolved"],
      return_workflow_status: ["TEMP", "WIP", "SUB", "VAL", "TBR", "REJ"],
      user_type: ["primary", "secondary", "employee"],
      workflow_notification_recipient: [
        "applicant",
        "current_approver",
        "previous_actor",
        "role",
        "admin",
        "custom_email",
      ],
    },
  },
} as const
