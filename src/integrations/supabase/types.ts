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
          regulator_id: string | null
          rejected_at: string | null
          search_vector: unknown
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
          regulator_id?: string | null
          rejected_at?: string | null
          search_vector?: unknown
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
          calculation_expression: string | null
          calculation_type: string
          category_id: string | null
          created_at: string
          currency: string
          fee_type: string
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
          created_at: string
          created_by: string | null
          description: string | null
          form_type: string
          id: string
          is_reusable: boolean
          name: string
          regulator_id: string | null
          return_template_id: string | null
          sector: string
          service: string
          sheet_name: string | null
          status: string
          sub_sector: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          form_type?: string
          id?: string
          is_reusable?: boolean
          name: string
          regulator_id?: string | null
          return_template_id?: string | null
          sector?: string
          service?: string
          sheet_name?: string | null
          status?: string
          sub_sector?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          form_type?: string
          id?: string
          is_reusable?: boolean
          name?: string
          regulator_id?: string | null
          return_template_id?: string | null
          sector?: string
          service?: string
          sheet_name?: string | null
          status?: string
          sub_sector?: string
          updated_at?: string
        }
        Relationships: [
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
        ]
      }
      form_versions: {
        Row: {
          change_notes: string | null
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          schema_snapshot: Json
          status: string
          template_id: string
          version: number
        }
        Insert: {
          change_notes?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          schema_snapshot?: Json
          status?: string
          template_id: string
          version?: number
        }
        Update: {
          change_notes?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          schema_snapshot?: Json
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
      profiles: {
        Row: {
          created_at: string
          email: string
          entity_name: string
          full_name: string
          id: string
          role: string
          search_vector: unknown
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
          search_vector?: unknown
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
          search_vector?: unknown
          status?: string
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_application_number: { Args: never; Returns: string }
      generate_complaint_number: { Args: never; Returns: string }
      generate_license_number: { Args: never; Returns: string }
      generate_receipt_number: { Args: never; Returns: string }
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
