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
      approval_actions: {
        Row: {
          action: string
          action_type: string
          actor_id: string
          application_id: string
          comments: string | null
          created_at: string
          delegated_from: string | null
          delegated_to: string | null
          id: string
          responded_at: string | null
          sla_deadline: string | null
          step_id: string | null
          workflow_instance_id: string | null
        }
        Insert: {
          action: string
          action_type?: string
          actor_id: string
          application_id: string
          comments?: string | null
          created_at?: string
          delegated_from?: string | null
          delegated_to?: string | null
          id?: string
          responded_at?: string | null
          sla_deadline?: string | null
          step_id?: string | null
          workflow_instance_id?: string | null
        }
        Update: {
          action?: string
          action_type?: string
          actor_id?: string
          application_id?: string
          comments?: string | null
          created_at?: string
          delegated_from?: string | null
          delegated_to?: string | null
          id?: string
          responded_at?: string | null
          sla_deadline?: string | null
          step_id?: string | null
          workflow_instance_id?: string | null
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
          {
            foreignKeyName: "approval_actions_workflow_instance_id_fkey"
            columns: ["workflow_instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_steps: {
        Row: {
          allowed_actions: Json
          approver_role: Database["public"]["Enums"]["app_role"]
          approver_role_id: string | null
          condition: Json | null
          created_at: string
          description: string | null
          escalation_after_hours: number | null
          escalation_role: string | null
          id: string
          is_required: boolean
          name: string
          sla_hours: number | null
          step_order: number
          step_type: string
          workflow_id: string
        }
        Insert: {
          allowed_actions?: Json
          approver_role: Database["public"]["Enums"]["app_role"]
          approver_role_id?: string | null
          condition?: Json | null
          created_at?: string
          description?: string | null
          escalation_after_hours?: number | null
          escalation_role?: string | null
          id?: string
          is_required?: boolean
          name: string
          sla_hours?: number | null
          step_order: number
          step_type?: string
          workflow_id: string
        }
        Update: {
          allowed_actions?: Json
          approver_role?: Database["public"]["Enums"]["app_role"]
          approver_role_id?: string | null
          condition?: Json | null
          created_at?: string
          description?: string | null
          escalation_after_hours?: number | null
          escalation_role?: string | null
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
      approval_workflows: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
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
          description?: string | null
          entity_type?: string
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
          description?: string | null
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
        ]
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
          metadata: Json | null
          record_count: number | null
          report_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          error_message?: string | null
          executed_by?: string | null
          execution_time_ms?: number | null
          export_format?: string | null
          id?: string
          metadata?: Json | null
          record_count?: number | null
          report_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          error_message?: string | null
          executed_by?: string | null
          execution_time_ms?: number | null
          export_format?: string | null
          id?: string
          metadata?: Json | null
          record_count?: number | null
          report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_logs_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_schedules: {
        Row: {
          created_at: string
          created_by: string
          cron_expression: string | null
          export_format: string
          id: string
          is_active: boolean
          last_run_at: string | null
          next_run_at: string | null
          recipients: Json
          report_id: string
          schedule_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          cron_expression?: string | null
          export_format?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          next_run_at?: string | null
          recipients?: Json
          report_id: string
          schedule_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          cron_expression?: string | null
          export_format?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          next_run_at?: string | null
          recipients?: Json
          report_id?: string
          schedule_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_schedules_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          category: string
          created_at: string
          created_by: string
          description: string | null
          expires_at: string | null
          generated_at: string | null
          id: string
          name: string
          query_config: Json
          regulator_id: string | null
          report_type: string
          result_count: number | null
          result_data: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by: string
          description?: string | null
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          name: string
          query_config?: Json
          regulator_id?: string | null
          report_type?: string
          result_count?: number | null
          result_data?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          name?: string
          query_config?: Json
          regulator_id?: string | null
          report_type?: string
          result_count?: number | null
          result_data?: Json | null
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
          action: Database["public"]["Enums"]["return_audit_action"]
          comments: string | null
          created_at: string
          id: string
          new_status: string | null
          performed_by: string | null
          previous_status: string | null
          return_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["return_audit_action"]
          comments?: string | null
          created_at?: string
          id?: string
          new_status?: string | null
          performed_by?: string | null
          previous_status?: string | null
          return_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["return_audit_action"]
          comments?: string | null
          created_at?: string
          id?: string
          new_status?: string | null
          performed_by?: string | null
          previous_status?: string | null
          return_id?: string
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
          workflow_status: Database["public"]["Enums"]["return_workflow_status"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
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
          workflow_status?: Database["public"]["Enums"]["return_workflow_status"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
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
          workflow_status?: Database["public"]["Enums"]["return_workflow_status"]
        }
        Relationships: [
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
          entity_id: string
          entity_type: string
          id: string
          started_at: string
          status: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step_id?: string | null
          entity_id: string
          entity_type: string
          id?: string
          started_at?: string
          status?: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step_id?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          started_at?: string
          status?: string
          updated_at?: string
          workflow_id?: string
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
      _resolve_application_workflow: {
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
      _resolve_effective_regulator: {
        Args: {
          _category_id: string
          _regulator_id: string
          _sector_id: string
        }
        Returns: string
      }
      cancel_application: {
        Args: { _application_id: string; _reason?: string }
        Returns: Json
      }
      check_applicant_name_exists: {
        Args: { p_name: string }
        Returns: boolean
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
      get_application_list_page: {
        Args: {
          _page?: number
          _page_size?: number
          _search?: string
          _search_mode?: string
          _sort_by?: string
          _sort_dir?: string
          _status?: string
          _version_id?: string
        }
        Returns: {
          action_count: number
          applicant_email: string
          applicant_id: string
          applicant_name: string
          application_number: string
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
          sector_name: string
          service_name: string
          status: string
          sub_sector_name: string
          submitted_at: string
          total_count: number
        }[]
      }
      get_application_list_stats: { Args: never; Returns: Json }
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
      reject_application_action: {
        Args: { _application_id: string; _comments: string }
        Returns: Json
      }
      request_resubmission_for_application: {
        Args: { _application_id: string; _comments: string }
        Returns: Json
      }
      reset_application_for_provisioning: {
        Args: { _application_id: string }
        Returns: Json
      }
      submit_application: {
        Args: { _ack_text?: string; _application_id: string }
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
      workflow_diagnostic_for_application: {
        Args: { _application_id: string }
        Returns: Json
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
      return_workflow_status: "TEMP" | "WIP" | "SUB" | "VAL" | "TBR"
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
        "pre_licensee",
        "licensee_primary",
        "licensee_secondary",
      ],
      cutoff_unit_enum: ["days", "weeks", "months"],
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
      return_workflow_status: ["TEMP", "WIP", "SUB", "VAL", "TBR"],
      user_type: ["primary", "secondary"],
    },
  },
} as const
