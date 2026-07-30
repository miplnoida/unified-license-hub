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
      api_key_usage: {
        Row: {
          api_key_id: string | null
          created_at: string
          id: string
          ip: string | null
          latency_ms: number | null
          method: string
          path: string
          status_code: number
          user_agent: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          latency_ms?: number | null
          method?: string
          path: string
          status_code: number
          user_agent?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          latency_ms?: number | null
          method?: string
          path?: string
          status_code?: number
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_key_usage_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          last_used_ip: string | null
          name: string
          revoked: boolean
          scopes: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          last_used_ip?: string | null
          name: string
          revoked?: boolean
          scopes?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          last_used_ip?: string | null
          name?: string
          revoked?: boolean
          scopes?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      application_ai_assessments: {
        Row: {
          analyst_decision: string | null
          analyst_decision_action: string | null
          analyst_decision_at: string | null
          analyst_decision_by: string | null
          analyst_justification: string | null
          application_id: string
          confidence_score: number | null
          created_at: string
          decision_report: Json
          error_message: string | null
          findings: Json
          generated_at: string | null
          id: string
          missing_information: Json
          model_name: string | null
          model_provider: string | null
          prompt_version: string
          proposed_routing_rationale: string | null
          proposed_routing_step_id: string | null
          risks: Json
          routing_decision: string | null
          routing_decision_at: string | null
          routing_decision_by: string | null
          routing_decision_reason: string | null
          routing_recommendation: Json
          rule_check_snapshot: Json
          sections: Json
          source_payload_hash: string | null
          status: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          analyst_decision?: string | null
          analyst_decision_action?: string | null
          analyst_decision_at?: string | null
          analyst_decision_by?: string | null
          analyst_justification?: string | null
          application_id: string
          confidence_score?: number | null
          created_at?: string
          decision_report?: Json
          error_message?: string | null
          findings?: Json
          generated_at?: string | null
          id?: string
          missing_information?: Json
          model_name?: string | null
          model_provider?: string | null
          prompt_version?: string
          proposed_routing_rationale?: string | null
          proposed_routing_step_id?: string | null
          risks?: Json
          routing_decision?: string | null
          routing_decision_at?: string | null
          routing_decision_by?: string | null
          routing_decision_reason?: string | null
          routing_recommendation?: Json
          rule_check_snapshot?: Json
          sections?: Json
          source_payload_hash?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          analyst_decision?: string | null
          analyst_decision_action?: string | null
          analyst_decision_at?: string | null
          analyst_decision_by?: string | null
          analyst_justification?: string | null
          application_id?: string
          confidence_score?: number | null
          created_at?: string
          decision_report?: Json
          error_message?: string | null
          findings?: Json
          generated_at?: string | null
          id?: string
          missing_information?: Json
          model_name?: string | null
          model_provider?: string | null
          prompt_version?: string
          proposed_routing_rationale?: string | null
          proposed_routing_step_id?: string | null
          risks?: Json
          routing_decision?: string | null
          routing_decision_at?: string | null
          routing_decision_by?: string | null
          routing_decision_reason?: string | null
          routing_recommendation?: Json
          rule_check_snapshot?: Json
          sections?: Json
          source_payload_hash?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_ai_assessments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_ai_assessments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "report_view_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_ai_assessments_proposed_routing_step_id_fkey"
            columns: ["proposed_routing_step_id"]
            isOneToOne: false
            referencedRelation: "approval_steps"
            referencedColumns: ["id"]
          },
        ]
      }
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
      application_legal_notes: {
        Row: {
          actor_id: string
          application_id: string
          concern_severity: string | null
          created_at: string
          has_legal_concern: boolean
          id: string
          note_text: string
          recommendation: string
          recommended_conditions: string | null
          restricted: boolean
          step_id: string | null
          updated_at: string
          workflow_instance_id: string | null
        }
        Insert: {
          actor_id: string
          application_id: string
          concern_severity?: string | null
          created_at?: string
          has_legal_concern?: boolean
          id?: string
          note_text: string
          recommendation: string
          recommended_conditions?: string | null
          restricted?: boolean
          step_id?: string | null
          updated_at?: string
          workflow_instance_id?: string | null
        }
        Update: {
          actor_id?: string
          application_id?: string
          concern_severity?: string | null
          created_at?: string
          has_legal_concern?: boolean
          id?: string
          note_text?: string
          recommendation?: string
          recommended_conditions?: string | null
          restricted?: boolean
          step_id?: string | null
          updated_at?: string
          workflow_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_legal_notes_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "approval_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      application_rfi_auto_rules: {
        Row: {
          active: boolean
          condition: Json
          created_at: string
          created_by: string | null
          default_due_days: number
          description: string | null
          id: string
          name: string
          prompt_template: string
          question_type: string
          required: boolean
          sector_id: string | null
          updated_at: string
          workflow_type_key: string | null
        }
        Insert: {
          active?: boolean
          condition?: Json
          created_at?: string
          created_by?: string | null
          default_due_days?: number
          description?: string | null
          id?: string
          name: string
          prompt_template: string
          question_type?: string
          required?: boolean
          sector_id?: string | null
          updated_at?: string
          workflow_type_key?: string | null
        }
        Update: {
          active?: boolean
          condition?: Json
          created_at?: string
          created_by?: string | null
          default_due_days?: number
          description?: string | null
          id?: string
          name?: string
          prompt_template?: string
          question_type?: string
          required?: boolean
          sector_id?: string | null
          updated_at?: string
          workflow_type_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_rfi_auto_rules_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_rfi_auto_rules_workflow_type_key_fkey"
            columns: ["workflow_type_key"]
            isOneToOne: false
            referencedRelation: "approval_workflow_types"
            referencedColumns: ["key"]
          },
        ]
      }
      application_rfi_items: {
        Row: {
          created_at: string
          id: string
          item_due_at: string | null
          ordinal: number
          prompt: string
          question_type: string
          required: boolean
          response_status: string
          rfi_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_due_at?: string | null
          ordinal?: number
          prompt: string
          question_type?: string
          required?: boolean
          response_status?: string
          rfi_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_due_at?: string | null
          ordinal?: number
          prompt?: string
          question_type?: string
          required?: boolean
          response_status?: string
          rfi_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_rfi_items_rfi_id_fkey"
            columns: ["rfi_id"]
            isOneToOne: false
            referencedRelation: "application_rfis"
            referencedColumns: ["id"]
          },
        ]
      }
      application_rfi_responses: {
        Row: {
          created_at: string
          file_upload_ids: string[]
          id: string
          response_text: string | null
          rfi_item_id: string
          submitted_at: string
          submitted_by: string
        }
        Insert: {
          created_at?: string
          file_upload_ids?: string[]
          id?: string
          response_text?: string | null
          rfi_item_id: string
          submitted_at?: string
          submitted_by: string
        }
        Update: {
          created_at?: string
          file_upload_ids?: string[]
          id?: string
          response_text?: string | null
          rfi_item_id?: string
          submitted_at?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_rfi_responses_rfi_item_id_fkey"
            columns: ["rfi_item_id"]
            isOneToOne: false
            referencedRelation: "application_rfi_items"
            referencedColumns: ["id"]
          },
        ]
      }
      application_rfis: {
        Row: {
          application_id: string
          approval_step_action_id: string | null
          closed_at: string | null
          closed_by: string | null
          closure_notes: string | null
          created_at: string
          due_at: string | null
          id: string
          near_due_notified_at: string | null
          overdue_notified_at: string | null
          pauses_sla: boolean
          raised_at: string
          raised_by: string
          status: string
          sufficiency_evaluation_id: string | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          application_id: string
          approval_step_action_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_notes?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          near_due_notified_at?: string | null
          overdue_notified_at?: string | null
          pauses_sla?: boolean
          raised_at?: string
          raised_by: string
          status?: string
          sufficiency_evaluation_id?: string | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          approval_step_action_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_notes?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          near_due_notified_at?: string | null
          overdue_notified_at?: string | null
          pauses_sla?: boolean
          raised_at?: string
          raised_by?: string
          status?: string
          sufficiency_evaluation_id?: string | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_rfis_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_rfis_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "report_view_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_rfis_approval_step_action_id_fkey"
            columns: ["approval_step_action_id"]
            isOneToOne: false
            referencedRelation: "approval_step_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_rfis_sufficiency_evaluation_id_fkey"
            columns: ["sufficiency_evaluation_id"]
            isOneToOne: false
            referencedRelation: "sufficiency_evaluations"
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
          assessment_notes: string | null
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          cancelled_at: string | null
          created_at: string
          current_step_id: string | null
          data: Json | null
          decision_rationale: string | null
          form_version_id: string | null
          id: string
          last_sufficiency_evaluation_id: string | null
          license_type: string
          priority: number
          priority_reason: string | null
          priority_set_at: string | null
          priority_set_by: string | null
          regulator_id: string | null
          rejected_at: string | null
          review_notes: string | null
          search_vector: unknown
          status: string
          submitted_at: string | null
          sufficiency_status: string | null
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
          assessment_notes?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_step_id?: string | null
          data?: Json | null
          decision_rationale?: string | null
          form_version_id?: string | null
          id?: string
          last_sufficiency_evaluation_id?: string | null
          license_type: string
          priority?: number
          priority_reason?: string | null
          priority_set_at?: string | null
          priority_set_by?: string | null
          regulator_id?: string | null
          rejected_at?: string | null
          review_notes?: string | null
          search_vector?: unknown
          status?: string
          submitted_at?: string | null
          sufficiency_status?: string | null
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
          assessment_notes?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_step_id?: string | null
          data?: Json | null
          decision_rationale?: string | null
          form_version_id?: string | null
          id?: string
          last_sufficiency_evaluation_id?: string | null
          license_type?: string
          priority?: number
          priority_reason?: string | null
          priority_set_at?: string | null
          priority_set_by?: string | null
          regulator_id?: string | null
          rejected_at?: string | null
          review_notes?: string | null
          search_vector?: unknown
          status?: string
          submitted_at?: string | null
          sufficiency_status?: string | null
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
            foreignKeyName: "applications_last_sufficiency_evaluation_id_fkey"
            columns: ["last_sufficiency_evaluation_id"]
            isOneToOne: false
            referencedRelation: "sufficiency_evaluations"
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
          signature_data_url: string | null
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
          signature_data_url?: string | null
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
          signature_data_url?: string | null
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
          action_key: string | null
          action_type: string
          allowed_role_slugs: string[]
          complainant_visible: boolean
          created_at: string
          end_state: string | null
          id: string
          is_enabled: boolean
          label: string | null
          licensee_visible: boolean
          mutation_spec: Json
          next_assignee_rule: Json
          next_step_id: string | null
          next_step_mode: string
          notification_event_key: string | null
          paused_at: string | null
          paused_reason: string | null
          require_comments: boolean
          require_digital_signature: boolean
          required_fields: Json
          result_status_override: string | null
          resumed_at: string | null
          signature_data_url: string | null
          sort_order: number
          step_id: string
          updated_at: string
        }
        Insert: {
          action_key?: string | null
          action_type: string
          allowed_role_slugs?: string[]
          complainant_visible?: boolean
          created_at?: string
          end_state?: string | null
          id?: string
          is_enabled?: boolean
          label?: string | null
          licensee_visible?: boolean
          mutation_spec?: Json
          next_assignee_rule?: Json
          next_step_id?: string | null
          next_step_mode?: string
          notification_event_key?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          require_comments?: boolean
          require_digital_signature?: boolean
          required_fields?: Json
          result_status_override?: string | null
          resumed_at?: string | null
          signature_data_url?: string | null
          sort_order?: number
          step_id: string
          updated_at?: string
        }
        Update: {
          action_key?: string | null
          action_type?: string
          allowed_role_slugs?: string[]
          complainant_visible?: boolean
          created_at?: string
          end_state?: string | null
          id?: string
          is_enabled?: boolean
          label?: string | null
          licensee_visible?: boolean
          mutation_spec?: Json
          next_assignee_rule?: Json
          next_step_id?: string | null
          next_step_mode?: string
          notification_event_key?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          require_comments?: boolean
          require_digital_signature?: boolean
          required_fields?: Json
          result_status_override?: string | null
          resumed_at?: string | null
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
          assignment_rule: Json
          auto_approve_on_timeout: boolean
          complainant_visible: boolean
          condition: Json | null
          created_at: string
          description: string | null
          escalation_after_hours: number | null
          escalation_role: string | null
          id: string
          is_legal_compliance_stage: boolean
          is_required: boolean
          is_start: boolean
          is_terminal: boolean
          licensee_visible: boolean
          name: string
          public_label: string | null
          require_digital_signature: boolean
          sla_breach_template_id: string | null
          sla_hours: number | null
          sla_pause_on_rfi: boolean
          sla_warning_template_id: string | null
          sla_warning_threshold_percent: number | null
          step_entry_notifications_enabled: boolean
          step_key: string | null
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
          assignment_rule?: Json
          auto_approve_on_timeout?: boolean
          complainant_visible?: boolean
          condition?: Json | null
          created_at?: string
          description?: string | null
          escalation_after_hours?: number | null
          escalation_role?: string | null
          id?: string
          is_legal_compliance_stage?: boolean
          is_required?: boolean
          is_start?: boolean
          is_terminal?: boolean
          licensee_visible?: boolean
          name: string
          public_label?: string | null
          require_digital_signature?: boolean
          sla_breach_template_id?: string | null
          sla_hours?: number | null
          sla_pause_on_rfi?: boolean
          sla_warning_template_id?: string | null
          sla_warning_threshold_percent?: number | null
          step_entry_notifications_enabled?: boolean
          step_key?: string | null
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
          assignment_rule?: Json
          auto_approve_on_timeout?: boolean
          complainant_visible?: boolean
          condition?: Json | null
          created_at?: string
          description?: string | null
          escalation_after_hours?: number | null
          escalation_role?: string | null
          id?: string
          is_legal_compliance_stage?: boolean
          is_required?: boolean
          is_start?: boolean
          is_terminal?: boolean
          licensee_visible?: boolean
          name?: string
          public_label?: string | null
          require_digital_signature?: boolean
          sla_breach_template_id?: string | null
          sla_hours?: number | null
          sla_pause_on_rfi?: boolean
          sla_warning_template_id?: string | null
          sla_warning_threshold_percent?: number | null
          step_entry_notifications_enabled?: boolean
          step_key?: string | null
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
            foreignKeyName: "approval_steps_sla_breach_template_id_fkey"
            columns: ["sla_breach_template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_steps_sla_warning_template_id_fkey"
            columns: ["sla_warning_template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
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
          bulk_intake_enabled: boolean
          created_at: string
          description: string | null
          display_label: string
          is_active: boolean
          key: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          bulk_intake_enabled?: boolean
          created_at?: string
          description?: string | null
          display_label: string
          is_active?: boolean
          key: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          bulk_intake_enabled?: boolean
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
          service_id: string | null
          sub_sector_id: string | null
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
          service_id?: string | null
          sub_sector_id?: string | null
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
          service_id?: string | null
          sub_sector_id?: string | null
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
          {
            foreignKeyName: "approval_workflows_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_workflows_sub_sector_id_fkey"
            columns: ["sub_sector_id"]
            isOneToOne: false
            referencedRelation: "sub_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_export_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          export_format: string | null
          file_hash: string | null
          file_path: string | null
          filters: Json | null
          from_date: string | null
          id: string
          module_filter: string | null
          requested_by: string | null
          row_count: number | null
          source: string
          status: string
          to_date: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          export_format?: string | null
          file_hash?: string | null
          file_path?: string | null
          filters?: Json | null
          from_date?: string | null
          id?: string
          module_filter?: string | null
          requested_by?: string | null
          row_count?: number | null
          source?: string
          status?: string
          to_date?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          export_format?: string | null
          file_hash?: string | null
          file_path?: string | null
          filters?: Json | null
          from_date?: string | null
          id?: string
          module_filter?: string | null
          requested_by?: string | null
          row_count?: number | null
          source?: string
          status?: string
          to_date?: string | null
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
          user_role: string | null
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
          user_role?: string | null
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
          user_role?: string | null
        }
        Relationships: []
      }
      business_calendar_holidays: {
        Row: {
          created_at: string
          created_by: string | null
          holiday_date: string
          id: string
          name: string
          profile_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          holiday_date: string
          id?: string
          name: string
          profile_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          holiday_date?: string
          id?: string
          name?: string
          profile_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_calendar_holidays_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "business_calendar_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_calendar_process_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          process_type: string
          profile_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          process_type: string
          profile_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          process_type?: string
          profile_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_calendar_process_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "business_calendar_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_calendar_profiles: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          timezone: string
          updated_at: string
          updated_by: string | null
          working_days: number[]
          working_end_time: string
          working_start_time: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          working_days?: number[]
          working_end_time?: string
          working_start_time?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          working_days?: number[]
          working_end_time?: string
          working_start_time?: string
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
      complaint_correspondence: {
        Row: {
          attachments: Json
          author_id: string | null
          body: string
          complaint_id: string
          created_at: string
          direction: string
          id: string
          subject: string | null
        }
        Insert: {
          attachments?: Json
          author_id?: string | null
          body: string
          complaint_id: string
          created_at?: string
          direction: string
          id?: string
          subject?: string | null
        }
        Update: {
          attachments?: Json
          author_id?: string | null
          body?: string
          complaint_id?: string
          created_at?: string
          direction?: string
          id?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complaint_correspondence_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_correspondence_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "report_view_complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_duplicate_clusters: {
        Row: {
          cluster_key: string
          created_at: string
          dimension: string
          id: string
          member_ids: string[]
          summary: string | null
          updated_at: string
        }
        Insert: {
          cluster_key: string
          created_at?: string
          dimension: string
          id?: string
          member_ids?: string[]
          summary?: string | null
          updated_at?: string
        }
        Update: {
          cluster_key?: string
          created_at?: string
          dimension?: string
          id?: string
          member_ids?: string[]
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      complaint_duplicate_pairs: {
        Row: {
          candidate_complaint_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          detected_at: string
          id: string
          matched: Json
          primary_complaint_id: string
          recommendation: string | null
          similarity_score: number
          status: string
          updated_at: string
        }
        Insert: {
          candidate_complaint_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          detected_at?: string
          id?: string
          matched?: Json
          primary_complaint_id: string
          recommendation?: string | null
          similarity_score?: number
          status?: string
          updated_at?: string
        }
        Update: {
          candidate_complaint_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          detected_at?: string
          id?: string
          matched?: Json
          primary_complaint_id?: string
          recommendation?: string | null
          similarity_score?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaint_duplicate_pairs_candidate_complaint_id_fkey"
            columns: ["candidate_complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_duplicate_pairs_candidate_complaint_id_fkey"
            columns: ["candidate_complaint_id"]
            isOneToOne: false
            referencedRelation: "report_view_complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_duplicate_pairs_primary_complaint_id_fkey"
            columns: ["primary_complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_duplicate_pairs_primary_complaint_id_fkey"
            columns: ["primary_complaint_id"]
            isOneToOne: false
            referencedRelation: "report_view_complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_duplicate_rules: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          name: string
          updated_at: string
          weight: number
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          name: string
          updated_at?: string
          weight?: number
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          name?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      complaint_duplicate_scoring_config: {
        Row: {
          active: boolean
          created_at: string
          id: string
          min_score: number
          time_window_days: number
          updated_at: string
          weight_description_trgm: number
          weight_email: number
          weight_licensee: number
          weight_subject_trgm: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          min_score?: number
          time_window_days?: number
          updated_at?: string
          weight_description_trgm?: number
          weight_email?: number
          weight_licensee?: number
          weight_subject_trgm?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          min_score?: number
          time_window_days?: number
          updated_at?: string
          weight_description_trgm?: number
          weight_email?: number
          weight_licensee?: number
          weight_subject_trgm?: number
        }
        Relationships: []
      }
      complaint_escalation_cases: {
        Row: {
          assigned_to: string | null
          complaint_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          notes: string | null
          rule_id: string | null
          rule_key: string
          rule_label: string
          severity: string
          status: string
          target_tier: string
          trigger_reason: string | null
          triggered_at: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          complaint_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          notes?: string | null
          rule_id?: string | null
          rule_key: string
          rule_label: string
          severity?: string
          status?: string
          target_tier?: string
          trigger_reason?: string | null
          triggered_at?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          complaint_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          notes?: string | null
          rule_id?: string | null
          rule_key?: string
          rule_label?: string
          severity?: string
          status?: string
          target_tier?: string
          trigger_reason?: string | null
          triggered_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaint_escalation_cases_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_escalation_cases_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "report_view_complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_escalation_cases_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "complaint_escalation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_escalation_log: {
        Row: {
          complaint_id: string | null
          created_at: string
          id: string
          note: string | null
          outcome: string
          rule_key: string
          rule_label: string | null
          severity: string | null
          snapshot: Json
          triggered_at: string
        }
        Insert: {
          complaint_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          outcome?: string
          rule_key: string
          rule_label?: string | null
          severity?: string | null
          snapshot?: Json
          triggered_at?: string
        }
        Update: {
          complaint_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          outcome?: string
          rule_key?: string
          rule_label?: string | null
          severity?: string | null
          snapshot?: Json
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaint_escalation_log_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_escalation_log_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "report_view_complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_escalation_rules: {
        Row: {
          created_at: string
          created_by: string | null
          criterion: string
          description: string | null
          enabled: boolean
          id: string
          key: string
          label: string
          notify: Json
          priority: number
          target_tier: string
          thresholds: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          criterion: string
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          label: string
          notify?: Json
          priority?: number
          target_tier?: string
          thresholds?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          criterion?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          label?: string
          notify?: Json
          priority?: number
          target_tier?: string
          thresholds?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      complaint_evidence: {
        Row: {
          complaint_id: string
          created_at: string
          description: string | null
          file_upload_id: string | null
          finalized_at: string | null
          id: string
          label: string
          staged_at: string
          uploaded_by: string | null
        }
        Insert: {
          complaint_id: string
          created_at?: string
          description?: string | null
          file_upload_id?: string | null
          finalized_at?: string | null
          id?: string
          label: string
          staged_at?: string
          uploaded_by?: string | null
        }
        Update: {
          complaint_id?: string
          created_at?: string
          description?: string | null
          file_upload_id?: string | null
          finalized_at?: string | null
          id?: string
          label?: string
          staged_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complaint_evidence_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_evidence_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "report_view_complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_evidence_file_upload_id_fkey"
            columns: ["file_upload_id"]
            isOneToOne: false
            referencedRelation: "file_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_intake_rules: {
        Row: {
          allow_anonymous: boolean
          created_at: string
          id: string
          max_attachments: number
          notes: string | null
          regulator_id: string | null
          required_fields: string[]
          updated_at: string
          variant: string
        }
        Insert: {
          allow_anonymous?: boolean
          created_at?: string
          id?: string
          max_attachments?: number
          notes?: string | null
          regulator_id?: string | null
          required_fields?: string[]
          updated_at?: string
          variant: string
        }
        Update: {
          allow_anonymous?: boolean
          created_at?: string
          id?: string
          max_attachments?: number
          notes?: string | null
          regulator_id?: string | null
          required_fields?: string[]
          updated_at?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaint_intake_rules_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_investigation_tasks: {
        Row: {
          complaint_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          owner_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          complaint_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          owner_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          complaint_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          owner_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaint_investigation_tasks_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_investigation_tasks_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "report_view_complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_status_catalogue: {
        Row: {
          code: string
          created_at: string
          description: string | null
          is_open: boolean
          is_terminal: boolean
          label: string
          public_description: string | null
          public_label: string
          sort_order: number
          updated_at: string
          variant: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          is_open?: boolean
          is_terminal?: boolean
          label: string
          public_description?: string | null
          public_label: string
          sort_order?: number
          updated_at?: string
          variant?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          is_open?: boolean
          is_terminal?: boolean
          label?: string
          public_description?: string | null
          public_label?: string
          sort_order?: number
          updated_at?: string
          variant?: string
        }
        Relationships: []
      }
      complaint_storage_cleanup_deadletter: {
        Row: {
          attempts: number
          bucket_name: string | null
          created_at: string
          evidence_id: string | null
          file_path: string | null
          file_upload_id: string | null
          id: string
          last_error: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          bucket_name?: string | null
          created_at?: string
          evidence_id?: string | null
          file_path?: string | null
          file_upload_id?: string | null
          id?: string
          last_error?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          bucket_name?: string | null
          created_at?: string
          evidence_id?: string | null
          file_path?: string | null
          file_upload_id?: string | null
          id?: string
          last_error?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      complaint_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sla_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sla_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sla_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      complaints: {
        Row: {
          acknowledged_at: string | null
          assigned_team: string | null
          channel_id: string | null
          closed_at: string | null
          closed_by: string | null
          closure_category: string | null
          closure_reason: string | null
          complainant_id: string | null
          complaint_number: string
          complaint_type_id: string | null
          conduct_risk_category_id: string | null
          created_at: string
          customer_type: string | null
          description: string
          email: string | null
          enforcement_action_id: string | null
          findings: string | null
          id: string
          idempotency_key: string | null
          intake_source: string | null
          internal_created_by: string | null
          investigation_notes: string | null
          investigator_id: string | null
          license_holder_id: string | null
          licensee_id: string | null
          parent_complaint_id: string | null
          priority: string | null
          product_id: string | null
          regulator_id: string | null
          repeat_complaint_count: number
          resolution: string | null
          resolution_notes: string | null
          resolved_at: string | null
          search_vector: unknown
          severity: string
          severity_overridden_at: string | null
          severity_overridden_by: string | null
          severity_override_reason: string | null
          sla_days: number | null
          sla_due_at: string | null
          status: string
          subject: string
          triage_evaluated_at: string | null
          triage_last_error: string | null
          triage_original_values: Json | null
          triage_override_status: string
          triage_result_snapshot: Json | null
          triage_rule_id: string | null
          triage_source: string | null
          updated_at: string
          vulnerability_category: string | null
          vulnerability_indicator: boolean
          vulnerability_notes: string | null
          vulnerability_review_state: Database["public"]["Enums"]["complaint_vulnerability_review_state"]
        }
        Insert: {
          acknowledged_at?: string | null
          assigned_team?: string | null
          channel_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_category?: string | null
          closure_reason?: string | null
          complainant_id?: string | null
          complaint_number?: string
          complaint_type_id?: string | null
          conduct_risk_category_id?: string | null
          created_at?: string
          customer_type?: string | null
          description: string
          email?: string | null
          enforcement_action_id?: string | null
          findings?: string | null
          id?: string
          idempotency_key?: string | null
          intake_source?: string | null
          internal_created_by?: string | null
          investigation_notes?: string | null
          investigator_id?: string | null
          license_holder_id?: string | null
          licensee_id?: string | null
          parent_complaint_id?: string | null
          priority?: string | null
          product_id?: string | null
          regulator_id?: string | null
          repeat_complaint_count?: number
          resolution?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          search_vector?: unknown
          severity?: string
          severity_overridden_at?: string | null
          severity_overridden_by?: string | null
          severity_override_reason?: string | null
          sla_days?: number | null
          sla_due_at?: string | null
          status?: string
          subject: string
          triage_evaluated_at?: string | null
          triage_last_error?: string | null
          triage_original_values?: Json | null
          triage_override_status?: string
          triage_result_snapshot?: Json | null
          triage_rule_id?: string | null
          triage_source?: string | null
          updated_at?: string
          vulnerability_category?: string | null
          vulnerability_indicator?: boolean
          vulnerability_notes?: string | null
          vulnerability_review_state?: Database["public"]["Enums"]["complaint_vulnerability_review_state"]
        }
        Update: {
          acknowledged_at?: string | null
          assigned_team?: string | null
          channel_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_category?: string | null
          closure_reason?: string | null
          complainant_id?: string | null
          complaint_number?: string
          complaint_type_id?: string | null
          conduct_risk_category_id?: string | null
          created_at?: string
          customer_type?: string | null
          description?: string
          email?: string | null
          enforcement_action_id?: string | null
          findings?: string | null
          id?: string
          idempotency_key?: string | null
          intake_source?: string | null
          internal_created_by?: string | null
          investigation_notes?: string | null
          investigator_id?: string | null
          license_holder_id?: string | null
          licensee_id?: string | null
          parent_complaint_id?: string | null
          priority?: string | null
          product_id?: string | null
          regulator_id?: string | null
          repeat_complaint_count?: number
          resolution?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          search_vector?: unknown
          severity?: string
          severity_overridden_at?: string | null
          severity_overridden_by?: string | null
          severity_override_reason?: string | null
          sla_days?: number | null
          sla_due_at?: string | null
          status?: string
          subject?: string
          triage_evaluated_at?: string | null
          triage_last_error?: string | null
          triage_original_values?: Json | null
          triage_override_status?: string
          triage_result_snapshot?: Json | null
          triage_rule_id?: string | null
          triage_source?: string | null
          updated_at?: string
          vulnerability_category?: string | null
          vulnerability_indicator?: boolean
          vulnerability_notes?: string | null
          vulnerability_review_state?: Database["public"]["Enums"]["complaint_vulnerability_review_state"]
        }
        Relationships: [
          {
            foreignKeyName: "complaints_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "conduct_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_complaint_type_id_fkey"
            columns: ["complaint_type_id"]
            isOneToOne: false
            referencedRelation: "complaint_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_conduct_risk_category_id_fkey"
            columns: ["conduct_risk_category_id"]
            isOneToOne: false
            referencedRelation: "conduct_risk_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_enforcement_action_id_fkey"
            columns: ["enforcement_action_id"]
            isOneToOne: false
            referencedRelation: "enforcement_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
          {
            foreignKeyName: "complaints_parent_complaint_id_fkey"
            columns: ["parent_complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_parent_complaint_id_fkey"
            columns: ["parent_complaint_id"]
            isOneToOne: false
            referencedRelation: "report_view_complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "conduct_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "complaint_status_catalogue"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "complaints_triage_rule_id_fkey"
            columns: ["triage_rule_id"]
            isOneToOne: false
            referencedRelation: "conduct_triage_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_audit_logs: {
        Row: {
          action_type: Database["public"]["Enums"]["compliance_audit_action"]
          after_value: Json | null
          ai_model_version: string | null
          before_value: Json | null
          created_at: string
          entry_id: string
          ip_address: unknown
          justification: string | null
          metadata: Json | null
          object_id: string | null
          object_type: string
          timestamp: string
          user_agent: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          action_type: Database["public"]["Enums"]["compliance_audit_action"]
          after_value?: Json | null
          ai_model_version?: string | null
          before_value?: Json | null
          created_at?: string
          entry_id?: string
          ip_address?: unknown
          justification?: string | null
          metadata?: Json | null
          object_id?: string | null
          object_type: string
          timestamp?: string
          user_agent?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["compliance_audit_action"]
          after_value?: Json | null
          ai_model_version?: string | null
          before_value?: Json | null
          created_at?: string
          entry_id?: string
          ip_address?: unknown
          justification?: string | null
          metadata?: Json | null
          object_id?: string | null
          object_type?: string
          timestamp?: string
          user_agent?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: []
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
            foreignKeyName: "compliance_returns_on_behalf_of_licensee_id_fkey"
            columns: ["on_behalf_of_licensee_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
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
      conduct_actions: {
        Row: {
          action_type: string
          assigned_team: string | null
          assigned_to: string | null
          cancellation_reason: string | null
          closed_at: string | null
          closed_by: string | null
          completion_notes: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          enforcement_action_id: string | null
          entity_id: string | null
          id: string
          metadata: Json
          outcome: string | null
          product_id: string | null
          source_id: string | null
          source_module: string
          status: string
          thematic_action_id: string | null
          title: string
          updated_at: string
          waiver_override_id: string | null
          waiver_reason: string | null
        }
        Insert: {
          action_type?: string
          assigned_team?: string | null
          assigned_to?: string | null
          cancellation_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          enforcement_action_id?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json
          outcome?: string | null
          product_id?: string | null
          source_id?: string | null
          source_module: string
          status?: string
          thematic_action_id?: string | null
          title: string
          updated_at?: string
          waiver_override_id?: string | null
          waiver_reason?: string | null
        }
        Update: {
          action_type?: string
          assigned_team?: string | null
          assigned_to?: string | null
          cancellation_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          enforcement_action_id?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json
          outcome?: string | null
          product_id?: string | null
          source_id?: string | null
          source_module?: string
          status?: string
          thematic_action_id?: string | null
          title?: string
          updated_at?: string
          waiver_override_id?: string | null
          waiver_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conduct_actions_enforcement_action_id_fkey"
            columns: ["enforcement_action_id"]
            isOneToOne: false
            referencedRelation: "enforcement_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_actions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_actions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
          {
            foreignKeyName: "conduct_actions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "conduct_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_actions_thematic_action_id_fkey"
            columns: ["thematic_action_id"]
            isOneToOne: true
            referencedRelation: "thematic_review_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_actions_waiver_override_id_fkey"
            columns: ["waiver_override_id"]
            isOneToOne: false
            referencedRelation: "rule_overrides"
            referencedColumns: ["id"]
          },
        ]
      }
      conduct_alert_thresholds: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          regulator_id: string | null
          severity: string
          threshold_count: number
          updated_at: string
          window_days: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind: string
          regulator_id?: string | null
          severity?: string
          threshold_count?: number
          updated_at?: string
          window_days?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          regulator_id?: string | null
          severity?: string
          threshold_count?: number
          updated_at?: string
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "conduct_alert_thresholds_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
      }
      conduct_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          assigned_to: string | null
          channel_id: string | null
          closed_at: string | null
          closed_by: string | null
          closure_reason: string | null
          complaint_id: string | null
          conduct_risk_category_id: string | null
          created_at: string
          dedupe_key: string | null
          detail: Json
          generated_by: string
          id: string
          kind: string
          licensee_id: string | null
          product_id: string | null
          regulator_id: string | null
          severity: string
          source: string | null
          status: string
          title: string
          triage_rule_id: string | null
          updated_at: string
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          assigned_to?: string | null
          channel_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_reason?: string | null
          complaint_id?: string | null
          conduct_risk_category_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          detail?: Json
          generated_by?: string
          id?: string
          kind: string
          licensee_id?: string | null
          product_id?: string | null
          regulator_id?: string | null
          severity?: string
          source?: string | null
          status?: string
          title: string
          triage_rule_id?: string | null
          updated_at?: string
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          assigned_to?: string | null
          channel_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_reason?: string | null
          complaint_id?: string | null
          conduct_risk_category_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          detail?: Json
          generated_by?: string
          id?: string
          kind?: string
          licensee_id?: string | null
          product_id?: string | null
          regulator_id?: string | null
          severity?: string
          source?: string | null
          status?: string
          title?: string
          triage_rule_id?: string | null
          updated_at?: string
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conduct_alerts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "conduct_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_alerts_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_alerts_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "report_view_complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_alerts_conduct_risk_category_id_fkey"
            columns: ["conduct_risk_category_id"]
            isOneToOne: false
            referencedRelation: "conduct_risk_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_alerts_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_alerts_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
          {
            foreignKeyName: "conduct_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "conduct_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_alerts_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_alerts_triage_rule_id_fkey"
            columns: ["triage_rule_id"]
            isOneToOne: false
            referencedRelation: "conduct_triage_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      conduct_channels: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          kind: string
          name: string
          regulator_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name: string
          regulator_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name?: string
          regulator_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conduct_channels_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
      }
      conduct_evidence: {
        Row: {
          action_id: string | null
          alert_id: string | null
          complaint_id: string | null
          confidentiality_level: string
          created_at: string
          description: string | null
          entity_id: string | null
          evidence_type: string
          file_id: string | null
          file_url: string | null
          id: string
          investigation_id: string | null
          metadata: Json
          restricted: boolean
          source: string | null
          thematic_review_id: string | null
          title: string
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          action_id?: string | null
          alert_id?: string | null
          complaint_id?: string | null
          confidentiality_level?: string
          created_at?: string
          description?: string | null
          entity_id?: string | null
          evidence_type?: string
          file_id?: string | null
          file_url?: string | null
          id?: string
          investigation_id?: string | null
          metadata?: Json
          restricted?: boolean
          source?: string | null
          thematic_review_id?: string | null
          title: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          action_id?: string | null
          alert_id?: string | null
          complaint_id?: string | null
          confidentiality_level?: string
          created_at?: string
          description?: string | null
          entity_id?: string | null
          evidence_type?: string
          file_id?: string | null
          file_url?: string | null
          id?: string
          investigation_id?: string | null
          metadata?: Json
          restricted?: boolean
          source?: string | null
          thematic_review_id?: string | null
          title?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conduct_evidence_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "conduct_investigations"
            referencedColumns: ["id"]
          },
        ]
      }
      conduct_evidence_access_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          evidence_id: string | null
          id: string
          ip_address: string | null
          reason: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          evidence_id?: string | null
          id?: string
          ip_address?: string | null
          reason?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          evidence_id?: string | null
          id?: string
          ip_address?: string | null
          reason?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      conduct_investigations: {
        Row: {
          allegation: string
          assigned_investigator: string | null
          closed_at: string | null
          closed_by: string | null
          closure_reason: string | null
          code: string | null
          created_at: string
          due_date: string | null
          id: string
          licensee_id: string | null
          metadata: Json
          opened_by: string | null
          outcome: string | null
          priority: string
          product_id: string | null
          severity: string
          source_id: string | null
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          allegation: string
          assigned_investigator?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_reason?: string | null
          code?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          licensee_id?: string | null
          metadata?: Json
          opened_by?: string | null
          outcome?: string | null
          priority?: string
          product_id?: string | null
          severity?: string
          source_id?: string | null
          source_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          allegation?: string
          assigned_investigator?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_reason?: string | null
          code?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          licensee_id?: string | null
          metadata?: Json
          opened_by?: string | null
          outcome?: string | null
          priority?: string
          product_id?: string | null
          severity?: string
          source_id?: string | null
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conduct_investigations_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_investigations_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
        ]
      }
      conduct_monitoring_results: {
        Row: {
          alert_id: string | null
          created_at: string
          entity_id: string | null
          evaluated_at: string
          id: string
          matched: boolean
          metrics: Json
          notes: string | null
          product_id: string | null
          risk_delta_applied: number
          rule_id: string
          thematic_review_id: string | null
        }
        Insert: {
          alert_id?: string | null
          created_at?: string
          entity_id?: string | null
          evaluated_at?: string
          id?: string
          matched?: boolean
          metrics?: Json
          notes?: string | null
          product_id?: string | null
          risk_delta_applied?: number
          rule_id: string
          thematic_review_id?: string | null
        }
        Update: {
          alert_id?: string | null
          created_at?: string
          entity_id?: string | null
          evaluated_at?: string
          id?: string
          matched?: boolean
          metrics?: Json
          notes?: string | null
          product_id?: string | null
          risk_delta_applied?: number
          rule_id?: string
          thematic_review_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conduct_monitoring_results_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "conduct_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_monitoring_results_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_monitoring_results_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
          {
            foreignKeyName: "conduct_monitoring_results_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "conduct_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_monitoring_results_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "conduct_monitoring_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_monitoring_results_thematic_review_id_fkey"
            columns: ["thematic_review_id"]
            isOneToOne: false
            referencedRelation: "thematic_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      conduct_monitoring_rule_runs: {
        Row: {
          alerts_created: number
          completed_at: string | null
          error: string | null
          executed_by: string | null
          id: string
          matched_count: number
          rule_id: string | null
          started_at: string
          status: string
          summary: Json
        }
        Insert: {
          alerts_created?: number
          completed_at?: string | null
          error?: string | null
          executed_by?: string | null
          id?: string
          matched_count?: number
          rule_id?: string | null
          started_at?: string
          status?: string
          summary?: Json
        }
        Update: {
          alerts_created?: number
          completed_at?: string | null
          error?: string | null
          executed_by?: string | null
          id?: string
          matched_count?: number
          rule_id?: string | null
          started_at?: string
          status?: string
          summary?: Json
        }
        Relationships: []
      }
      conduct_monitoring_rules: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          definition: Json
          description: string | null
          frequency: string
          id: string
          name: string
          risk_delta: number
          rule_type: string
          scope: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          definition?: Json
          description?: string | null
          frequency?: string
          id?: string
          name: string
          risk_delta?: number
          rule_type?: string
          scope?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          definition?: Json
          description?: string | null
          frequency?: string
          id?: string
          name?: string
          risk_delta?: number
          rule_type?: string
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      conduct_products: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          regulator_id: string | null
          sector_id: string | null
          sub_sector_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          regulator_id?: string | null
          sector_id?: string | null
          sub_sector_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          regulator_id?: string | null
          sector_id?: string | null
          sub_sector_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conduct_products_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_products_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_products_sub_sector_id_fkey"
            columns: ["sub_sector_id"]
            isOneToOne: false
            referencedRelation: "sub_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      conduct_risk_categories: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          regulator_id: string | null
          severity_hint: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          regulator_id?: string | null
          severity_hint?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          regulator_id?: string | null
          severity_hint?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conduct_risk_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "conduct_risk_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_risk_categories_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
      }
      conduct_triage_audit_events: {
        Row: {
          actor_id: string | null
          alerts_generated: Json | null
          applied_outputs: Json | null
          complaint_id: string | null
          created_at: string
          dry_run: boolean
          error_message: string | null
          evaluated_at: string
          evaluated_summary: Json | null
          function_version: string | null
          id: string
          input_snapshot: Json | null
          matched_rule_id: string | null
          matched_rule_name: string | null
          new_values: Json | null
          old_values: Json | null
          outcome: string
          rules_evaluated: number
          triggered_by: string | null
        }
        Insert: {
          actor_id?: string | null
          alerts_generated?: Json | null
          applied_outputs?: Json | null
          complaint_id?: string | null
          created_at?: string
          dry_run?: boolean
          error_message?: string | null
          evaluated_at?: string
          evaluated_summary?: Json | null
          function_version?: string | null
          id?: string
          input_snapshot?: Json | null
          matched_rule_id?: string | null
          matched_rule_name?: string | null
          new_values?: Json | null
          old_values?: Json | null
          outcome: string
          rules_evaluated?: number
          triggered_by?: string | null
        }
        Update: {
          actor_id?: string | null
          alerts_generated?: Json | null
          applied_outputs?: Json | null
          complaint_id?: string | null
          created_at?: string
          dry_run?: boolean
          error_message?: string | null
          evaluated_at?: string
          evaluated_summary?: Json | null
          function_version?: string | null
          id?: string
          input_snapshot?: Json | null
          matched_rule_id?: string | null
          matched_rule_name?: string | null
          new_values?: Json | null
          old_values?: Json | null
          outcome?: string
          rules_evaluated?: number
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conduct_triage_audit_events_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_triage_audit_events_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "report_view_complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      conduct_triage_rules: {
        Row: {
          active: boolean
          conditions: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          match_mode: string
          name: string
          outputs: Json
          priority_order: number
          regulator_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          match_mode?: string
          name: string
          outputs?: Json
          priority_order?: number
          regulator_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          match_mode?: string
          name?: string
          outputs?: Json
          priority_order?: number
          regulator_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conduct_triage_rules_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
      }
      coordination_cases: {
        Row: {
          clearance_required: boolean
          closed_at: string | null
          closed_by: string | null
          closure_rationale: string | null
          created_at: string
          description: string | null
          id: string
          owner_regulator_id: string | null
          owner_user_id: string
          primary_regulator_id: string | null
          status: string
          subject_id: string | null
          subject_type: string
          title: string
          updated_at: string
        }
        Insert: {
          clearance_required?: boolean
          closed_at?: string | null
          closed_by?: string | null
          closure_rationale?: string | null
          created_at?: string
          description?: string | null
          id?: string
          owner_regulator_id?: string | null
          owner_user_id: string
          primary_regulator_id?: string | null
          status?: string
          subject_id?: string | null
          subject_type: string
          title: string
          updated_at?: string
        }
        Update: {
          clearance_required?: boolean
          closed_at?: string | null
          closed_by?: string | null
          closure_rationale?: string | null
          created_at?: string
          description?: string | null
          id?: string
          owner_regulator_id?: string | null
          owner_user_id?: string
          primary_regulator_id?: string | null
          status?: string
          subject_id?: string | null
          subject_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coordination_cases_owner_regulator_id_fkey"
            columns: ["owner_regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coordination_cases_primary_regulator_id_fkey"
            columns: ["primary_regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
      }
      coordination_escalations: {
        Row: {
          assigned_to: string | null
          case_id: string
          created_at: string
          id: string
          raised_by: string
          reason: string
          resolution_outcome: string | null
          resolution_rationale: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          tier: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          case_id: string
          created_at?: string
          id?: string
          raised_by: string
          reason: string
          resolution_outcome?: string | null
          resolution_rationale?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tier?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          case_id?: string
          created_at?: string
          id?: string
          raised_by?: string
          reason?: string
          resolution_outcome?: string | null
          resolution_rationale?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coordination_escalations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "coordination_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      coordination_flags: {
        Row: {
          case_id: string
          created_at: string
          created_by: string
          description: string | null
          flag_type: string
          id: string
          linked_application_id: string | null
          linked_license_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          title: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by: string
          description?: string | null
          flag_type: string
          id?: string
          linked_application_id?: string | null
          linked_license_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          flag_type?: string
          id?: string
          linked_application_id?: string | null
          linked_license_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "coordination_flags_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "coordination_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      coordination_messages: {
        Row: {
          author_id: string
          body: string
          case_id: string
          created_at: string
          id: string
        }
        Insert: {
          author_id: string
          body: string
          case_id: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string
          body?: string
          case_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coordination_messages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "coordination_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      coordination_participants: {
        Row: {
          case_id: string
          clearance_note: string | null
          clearance_status: string
          cleared_at: string | null
          id: string
          invited_at: string
          invited_by: string | null
          participant_role: string
          regulator_id: string | null
          user_id: string
        }
        Insert: {
          case_id: string
          clearance_note?: string | null
          clearance_status?: string
          cleared_at?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          participant_role?: string
          regulator_id?: string | null
          user_id: string
        }
        Update: {
          case_id?: string
          clearance_note?: string | null
          clearance_status?: string
          cleared_at?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          participant_role?: string
          regulator_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coordination_participants_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "coordination_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coordination_participants_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
      }
      correspondence_dispatches: {
        Row: {
          body: string
          channel: string
          created_at: string
          error_message: string | null
          id: string
          provider_message_id: string | null
          recipient_email: string | null
          recipient_name: string | null
          recipient_phone: string | null
          recipient_user_id: string | null
          sent_at: string | null
          sent_by: string | null
          source_id: string
          source_type: string
          status: string
          subject: string | null
          template_id: string | null
          updated_at: string
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          recipient_user_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          source_id: string
          source_type: string
          status?: string
          subject?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          recipient_user_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          source_id?: string
          source_type?: string
          status?: string
          subject?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "correspondence_dispatches_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "correspondence_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      correspondence_templates: {
        Row: {
          body: string
          category: string
          channel: string
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          regulator_id: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          body: string
          category?: string
          channel?: string
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          regulator_id?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          channel?: string
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          regulator_id?: string | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "correspondence_templates_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
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
      decision_options: {
        Row: {
          applies_to: Json
          code: string
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          label: string
          min_reason_length: number
          outcome: string
          rationale_template_id: string | null
          requires_conditions: boolean
          requires_reason: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          applies_to?: Json
          code: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          label: string
          min_reason_length?: number
          outcome: string
          rationale_template_id?: string | null
          requires_conditions?: boolean
          requires_reason?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          applies_to?: Json
          code?: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          label?: string
          min_reason_length?: number
          outcome?: string
          rationale_template_id?: string | null
          requires_conditions?: boolean
          requires_reason?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_options_rationale_template_id_fkey"
            columns: ["rationale_template_id"]
            isOneToOne: false
            referencedRelation: "decision_rationale_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_rationale_templates: {
        Row: {
          body: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          outcome: string | null
          updated_at: string
          variables: Json
        }
        Insert: {
          body: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          outcome?: string | null
          updated_at?: string
          variables?: Json
        }
        Update: {
          body?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          outcome?: string | null
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      declaration_invitations: {
        Row: {
          assessment_id: string
          channel: string
          created_at: string
          created_by: string | null
          expires_at: string
          failed_identity_attempts: number
          id: string
          individual_id: string
          opened_at: string | null
          recipient_email: string | null
          recipient_phone: string | null
          sent_at: string | null
          status: string
          submitted_at: string | null
          token_hash: string
          verification_hash: string
        }
        Insert: {
          assessment_id: string
          channel?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          failed_identity_attempts?: number
          id?: string
          individual_id: string
          opened_at?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          status?: string
          submitted_at?: string | null
          token_hash: string
          verification_hash: string
        }
        Update: {
          assessment_id?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          failed_identity_attempts?: number
          id?: string
          individual_id?: string
          opened_at?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          status?: string
          submitted_at?: string | null
          token_hash?: string
          verification_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "declaration_invitations_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "fp_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "declaration_invitations_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "fp_individuals"
            referencedColumns: ["id"]
          },
        ]
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
      document_extractions: {
        Row: {
          created_at: string
          error: string | null
          extracted: Json | null
          file_upload_id: string | null
          id: string
          input_tokens: number | null
          model: string | null
          output_tokens: number | null
          preset: string
          raw_text: string | null
          requested_by: string | null
          source_id: string | null
          source_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          extracted?: Json | null
          file_upload_id?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          preset?: string
          raw_text?: string | null
          requested_by?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          extracted?: Json | null
          file_upload_id?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          preset?: string
          raw_text?: string | null
          requested_by?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_extractions_file_upload_id_fkey"
            columns: ["file_upload_id"]
            isOneToOne: false
            referencedRelation: "file_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      document_groups: {
        Row: {
          created_at: string
          current_version_id: string | null
          display_name: string | null
          document_label: string | null
          document_type: string
          entity_id: string | null
          entity_type: string
          field_id: string | null
          form_id: string | null
          id: string
          is_deleted: boolean
          metadata: Json | null
          owner_id: string
          status: string
          submission_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_version_id?: string | null
          display_name?: string | null
          document_label?: string | null
          document_type: string
          entity_id?: string | null
          entity_type: string
          field_id?: string | null
          form_id?: string | null
          id?: string
          is_deleted?: boolean
          metadata?: Json | null
          owner_id: string
          status?: string
          submission_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_version_id?: string | null
          display_name?: string | null
          document_label?: string | null
          document_type?: string
          entity_id?: string | null
          entity_type?: string
          field_id?: string | null
          form_id?: string | null
          id?: string
          is_deleted?: boolean
          metadata?: Json | null
          owner_id?: string
          status?: string
          submission_id?: string | null
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
          bucket: string | null
          change_note: string | null
          checksum: string | null
          created_at: string
          extension: string | null
          file_size: number | null
          file_upload_id: string
          group_id: string
          id: string
          is_deleted: boolean
          metadata: Json
          mime_type: string | null
          original_file_name: string | null
          safe_file_name: string | null
          status: string
          storage_path: string | null
          uploaded_by: string
          version: number
        }
        Insert: {
          bucket?: string | null
          change_note?: string | null
          checksum?: string | null
          created_at?: string
          extension?: string | null
          file_size?: number | null
          file_upload_id: string
          group_id: string
          id?: string
          is_deleted?: boolean
          metadata?: Json
          mime_type?: string | null
          original_file_name?: string | null
          safe_file_name?: string | null
          status?: string
          storage_path?: string | null
          uploaded_by: string
          version: number
        }
        Update: {
          bucket?: string | null
          change_note?: string | null
          checksum?: string | null
          created_at?: string
          extension?: string | null
          file_size?: number | null
          file_upload_id?: string
          group_id?: string
          id?: string
          is_deleted?: boolean
          metadata?: Json
          mime_type?: string | null
          original_file_name?: string | null
          safe_file_name?: string | null
          status?: string
          storage_path?: string | null
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
          appeal_deadline: string | null
          case_number: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          date_opened: string
          decision_at: string | null
          decision_outcome: string | null
          decision_rationale: string | null
          description: string | null
          enforcement_type: string
          entity_id: string
          findings: string | null
          id: string
          linked_document_ids: string[] | null
          notice_issued_at: string | null
          opened_by: string | null
          penalty_amount: number | null
          penalty_currency: string | null
          penalty_paid_amount: number | null
          resolution_date: string | null
          response_received_at: string | null
          response_summary: string | null
          source_reference_id: string | null
          source_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          appeal_deadline?: string | null
          case_number?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          date_opened?: string
          decision_at?: string | null
          decision_outcome?: string | null
          decision_rationale?: string | null
          description?: string | null
          enforcement_type?: string
          entity_id: string
          findings?: string | null
          id?: string
          linked_document_ids?: string[] | null
          notice_issued_at?: string | null
          opened_by?: string | null
          penalty_amount?: number | null
          penalty_currency?: string | null
          penalty_paid_amount?: number | null
          resolution_date?: string | null
          response_received_at?: string | null
          response_summary?: string | null
          source_reference_id?: string | null
          source_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          appeal_deadline?: string | null
          case_number?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          date_opened?: string
          decision_at?: string | null
          decision_outcome?: string | null
          decision_rationale?: string | null
          description?: string | null
          enforcement_type?: string
          entity_id?: string
          findings?: string | null
          id?: string
          linked_document_ids?: string[] | null
          notice_issued_at?: string | null
          opened_by?: string | null
          penalty_amount?: number | null
          penalty_currency?: string | null
          penalty_paid_amount?: number | null
          resolution_date?: string | null
          response_received_at?: string | null
          response_summary?: string | null
          source_reference_id?: string | null
          source_type?: string | null
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
          {
            foreignKeyName: "enforcement_actions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
        ]
      }
      enforcement_case_events: {
        Row: {
          actor_id: string | null
          case_id: string
          created_at: string
          detail: Json | null
          event_type: string
          id: string
          note: string | null
        }
        Insert: {
          actor_id?: string | null
          case_id: string
          created_at?: string
          detail?: Json | null
          event_type: string
          id?: string
          note?: string | null
        }
        Update: {
          actor_id?: string | null
          case_id?: string
          created_at?: string
          detail?: Json | null
          event_type?: string
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enforcement_case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "enforcement_actions"
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
            foreignKeyName: "entity_relationships_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
          {
            foreignKeyName: "entity_relationships_related_entity_id_fkey"
            columns: ["related_entity_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relationships_related_entity_id_fkey"
            columns: ["related_entity_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
        ]
      }
      entity_risk_scores: {
        Row: {
          band: string
          components: Json
          computed_at: string
          computed_by: string | null
          created_at: string
          entity_id: string
          id: string
          is_current: boolean
          period_key: string
          score: number
          updated_at: string
          weights: Json
        }
        Insert: {
          band?: string
          components?: Json
          computed_at?: string
          computed_by?: string | null
          created_at?: string
          entity_id: string
          id?: string
          is_current?: boolean
          period_key: string
          score?: number
          updated_at?: string
          weights?: Json
        }
        Update: {
          band?: string
          components?: Json
          computed_at?: string
          computed_by?: string | null
          created_at?: string
          entity_id?: string
          id?: string
          is_current?: boolean
          period_key?: string
          score?: number
          updated_at?: string
          weights?: Json
        }
        Relationships: []
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
            foreignKeyName: "entity_user_access_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
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
          form_id: string | null
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
          form_id?: string | null
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
          form_id?: string | null
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
            foreignKeyName: "fee_configurations_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
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
          line_code: string | null
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
          line_code?: string | null
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
          line_code?: string | null
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
      fp_appeals: {
        Row: {
          appeal_committee_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision: string | null
          decision_rationale: string | null
          determination_id: string
          filed_at: string
          filed_by: string
          grounds: string
          id: string
          individual_id: string
          license_id: string | null
          new_determination_id: string | null
          status: string
          supporting_docs: Json
          updated_at: string
        }
        Insert: {
          appeal_committee_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          decision_rationale?: string | null
          determination_id: string
          filed_at?: string
          filed_by: string
          grounds: string
          id?: string
          individual_id: string
          license_id?: string | null
          new_determination_id?: string | null
          status?: string
          supporting_docs?: Json
          updated_at?: string
        }
        Update: {
          appeal_committee_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          decision_rationale?: string | null
          determination_id?: string
          filed_at?: string
          filed_by?: string
          grounds?: string
          id?: string
          individual_id?: string
          license_id?: string | null
          new_determination_id?: string | null
          status?: string
          supporting_docs?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fp_appeals_appeal_committee_id_fkey"
            columns: ["appeal_committee_id"]
            isOneToOne: false
            referencedRelation: "fp_committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_appeals_determination_id_fkey"
            columns: ["determination_id"]
            isOneToOne: false
            referencedRelation: "fp_determinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_appeals_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "fp_individuals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_appeals_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_appeals_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "report_view_licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_appeals_new_determination_id_fkey"
            columns: ["new_determination_id"]
            isOneToOne: false
            referencedRelation: "fp_determinations"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_assessments: {
        Row: {
          assessment_type: string
          closed_at: string | null
          committee_id: string | null
          created_at: string
          created_by: string | null
          declaration_data: Json
          determined_at: string | null
          form_response_id: string | null
          form_template_id: string | null
          form_version_id: string | null
          id: string
          individual_id: string
          licensee_id: string | null
          regulator_id: string | null
          role_id: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          assessment_type?: string
          closed_at?: string | null
          committee_id?: string | null
          created_at?: string
          created_by?: string | null
          declaration_data?: Json
          determined_at?: string | null
          form_response_id?: string | null
          form_template_id?: string | null
          form_version_id?: string | null
          id?: string
          individual_id: string
          licensee_id?: string | null
          regulator_id?: string | null
          role_id?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          assessment_type?: string
          closed_at?: string | null
          committee_id?: string | null
          created_at?: string
          created_by?: string | null
          declaration_data?: Json
          determined_at?: string | null
          form_response_id?: string | null
          form_template_id?: string | null
          form_version_id?: string | null
          id?: string
          individual_id?: string
          licensee_id?: string | null
          regulator_id?: string | null
          role_id?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fp_assessments_form_response_id_fkey"
            columns: ["form_response_id"]
            isOneToOne: false
            referencedRelation: "form_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_assessments_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_assessments_form_version_id_fkey"
            columns: ["form_version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_assessments_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "fp_individuals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_assessments_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_assessments_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
          {
            foreignKeyName: "fp_assessments_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_assessments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "fp_individual_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_committee_members: {
        Row: {
          added_at: string
          committee_id: string
          id: string
          is_active: boolean
          member_role: string
          user_id: string
          vote_weight: number
        }
        Insert: {
          added_at?: string
          committee_id: string
          id?: string
          is_active?: boolean
          member_role?: string
          user_id: string
          vote_weight?: number
        }
        Update: {
          added_at?: string
          committee_id?: string
          id?: string
          is_active?: boolean
          member_role?: string
          user_id?: string
          vote_weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "fp_committee_members_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "fp_committees"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_committee_votes: {
        Row: {
          assessment_id: string
          committee_id: string
          id: string
          justification: string | null
          member_id: string
          rationale_required: boolean
          vote: string
          voted_at: string
          weight: number
        }
        Insert: {
          assessment_id: string
          committee_id: string
          id?: string
          justification?: string | null
          member_id: string
          rationale_required?: boolean
          vote: string
          voted_at?: string
          weight?: number
        }
        Update: {
          assessment_id?: string
          committee_id?: string
          id?: string
          justification?: string | null
          member_id?: string
          rationale_required?: boolean
          vote?: string
          voted_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "fp_committee_votes_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "fp_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_committee_votes_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "fp_committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_committee_votes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "fp_committee_members"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_committees: {
        Row: {
          approval_threshold_pct: number
          casting_vote_member_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          quorum: number
          regulator_id: string | null
          updated_at: string
        }
        Insert: {
          approval_threshold_pct?: number
          casting_vote_member_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          quorum?: number
          regulator_id?: string | null
          updated_at?: string
        }
        Update: {
          approval_threshold_pct?: number
          casting_vote_member_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          quorum?: number
          regulator_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fp_committees_casting_vote_member_id_fkey"
            columns: ["casting_vote_member_id"]
            isOneToOne: false
            referencedRelation: "fp_committee_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_committees_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_conditions: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string
          determination_id: string
          due_date: string | null
          evidence_type: string | null
          id: string
          individual_id: string
          monitoring_owner: string | null
          overdue_at: string | null
          reminder_sent_at: string | null
          satisfaction_note: string | null
          satisfied_at: string | null
          satisfied_by: string | null
          status: string
          updated_at: string
          waiver_reason: string | null
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          description: string
          determination_id: string
          due_date?: string | null
          evidence_type?: string | null
          id?: string
          individual_id: string
          monitoring_owner?: string | null
          overdue_at?: string | null
          reminder_sent_at?: string | null
          satisfaction_note?: string | null
          satisfied_at?: string | null
          satisfied_by?: string | null
          status?: string
          updated_at?: string
          waiver_reason?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          determination_id?: string
          due_date?: string | null
          evidence_type?: string | null
          id?: string
          individual_id?: string
          monitoring_owner?: string | null
          overdue_at?: string | null
          reminder_sent_at?: string | null
          satisfaction_note?: string | null
          satisfied_at?: string | null
          satisfied_by?: string | null
          status?: string
          updated_at?: string
          waiver_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fp_conditions_determination_id_fkey"
            columns: ["determination_id"]
            isOneToOne: false
            referencedRelation: "fp_determinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_conditions_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "fp_individuals"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_determinations: {
        Row: {
          assessment_id: string
          created_at: string
          determined_at: string
          determined_by: string
          effective_from: string | null
          effective_to: string | null
          id: string
          individual_id: string
          is_current: boolean
          outcome: string
          rationale: string
          regulator_id: string | null
          signature_hash: string | null
          supersedes_id: string | null
        }
        Insert: {
          assessment_id: string
          created_at?: string
          determined_at?: string
          determined_by: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          individual_id: string
          is_current?: boolean
          outcome: string
          rationale: string
          regulator_id?: string | null
          signature_hash?: string | null
          supersedes_id?: string | null
        }
        Update: {
          assessment_id?: string
          created_at?: string
          determined_at?: string
          determined_by?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          individual_id?: string
          is_current?: boolean
          outcome?: string
          rationale?: string
          regulator_id?: string | null
          signature_hash?: string | null
          supersedes_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fp_determinations_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "fp_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_determinations_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "fp_individuals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_determinations_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_determinations_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "fp_determinations"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_findings: {
        Row: {
          assessment_id: string
          assigned_to: string | null
          check_type: string
          citations: Json
          confidence_score: number | null
          config_id: string | null
          created_at: string
          evidence_url: string | null
          evidence_urls: Json
          id: string
          individual_id: string
          is_false_positive: boolean
          raw_payload: Json | null
          resolution_reason: string | null
          resolution_status: string
          resolved_at: string | null
          resolved_by: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          run_id: string
          severity: string
          severity_basis: Json | null
          source: string | null
          summary: string | null
          title: string
        }
        Insert: {
          assessment_id: string
          assigned_to?: string | null
          check_type: string
          citations?: Json
          confidence_score?: number | null
          config_id?: string | null
          created_at?: string
          evidence_url?: string | null
          evidence_urls?: Json
          id?: string
          individual_id: string
          is_false_positive?: boolean
          raw_payload?: Json | null
          resolution_reason?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id: string
          severity?: string
          severity_basis?: Json | null
          source?: string | null
          summary?: string | null
          title: string
        }
        Update: {
          assessment_id?: string
          assigned_to?: string | null
          check_type?: string
          citations?: Json
          confidence_score?: number | null
          config_id?: string | null
          created_at?: string
          evidence_url?: string | null
          evidence_urls?: Json
          id?: string
          individual_id?: string
          is_false_positive?: boolean
          raw_payload?: Json | null
          resolution_reason?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id?: string
          severity?: string
          severity_basis?: Json | null
          source?: string | null
          summary?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "fp_findings_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "fp_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_findings_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "fp_screening_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_findings_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "fp_individuals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_findings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "fp_screening_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_individual_roles: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          individual_id: string
          is_current: boolean
          last_reassessment_at: string | null
          license_id: string | null
          licensee_id: string | null
          next_reassessment_due: string | null
          notes: string | null
          ownership_pct: number | null
          reassessment_cycle_months: number | null
          role_title: string | null
          role_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          individual_id: string
          is_current?: boolean
          last_reassessment_at?: string | null
          license_id?: string | null
          licensee_id?: string | null
          next_reassessment_due?: string | null
          notes?: string | null
          ownership_pct?: number | null
          reassessment_cycle_months?: number | null
          role_title?: string | null
          role_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          individual_id?: string
          is_current?: boolean
          last_reassessment_at?: string | null
          license_id?: string | null
          licensee_id?: string | null
          next_reassessment_due?: string | null
          notes?: string | null
          ownership_pct?: number | null
          reassessment_cycle_months?: number | null
          role_title?: string | null
          role_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fp_individual_roles_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "fp_individuals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_individual_roles_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_individual_roles_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "report_view_licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_individual_roles_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_individual_roles_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
        ]
      }
      fp_individuals: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          email: string | null
          full_name: string
          id: string
          national_id: string | null
          nationality: string | null
          notes: string | null
          passport_number: string | null
          phone: string | null
          regulator_id: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          id?: string
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          passport_number?: string | null
          phone?: string | null
          regulator_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          id?: string
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          passport_number?: string | null
          phone?: string | null
          regulator_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fp_individuals_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_manual_screening_tasks: {
        Row: {
          assessment_id: string
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          due_date: string | null
          finding_id: string
          id: string
          individual_id: string
          notes: string | null
          outcome: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assessment_id: string
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          due_date?: string | null
          finding_id: string
          id?: string
          individual_id: string
          notes?: string | null
          outcome?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          due_date?: string | null
          finding_id?: string
          id?: string
          individual_id?: string
          notes?: string | null
          outcome?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fp_manual_screening_tasks_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "fp_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_manual_screening_tasks_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "fp_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_manual_screening_tasks_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "fp_individuals"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_monitoring_events: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          acknowledgement_note: string | null
          detail: Json | null
          determination_id: string | null
          event_type: string
          id: string
          individual_id: string
          raised_at: string
          severity: string
          summary: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledgement_note?: string | null
          detail?: Json | null
          determination_id?: string | null
          event_type: string
          id?: string
          individual_id: string
          raised_at?: string
          severity?: string
          summary: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledgement_note?: string | null
          detail?: Json | null
          determination_id?: string | null
          event_type?: string
          id?: string
          individual_id?: string
          raised_at?: string
          severity?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "fp_monitoring_events_determination_id_fkey"
            columns: ["determination_id"]
            isOneToOne: false
            referencedRelation: "fp_determinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_monitoring_events_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "fp_individuals"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_screening_configs: {
        Row: {
          check_type: string
          config: Json
          created_at: string
          description: string | null
          display_label: string
          id: string
          is_active: boolean
          key: string
          provider: string | null
          severity_default: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          check_type: string
          config?: Json
          created_at?: string
          description?: string | null
          display_label: string
          id?: string
          is_active?: boolean
          key: string
          provider?: string | null
          severity_default?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          check_type?: string
          config?: Json
          created_at?: string
          description?: string | null
          display_label?: string
          id?: string
          is_active?: boolean
          key?: string
          provider?: string | null
          severity_default?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      fp_screening_execution_rules: {
        Row: {
          assessment_type: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string | null
          screening_config_id: string
          sector_id: string | null
          trigger_event: string
          updated_at: string
        }
        Insert: {
          assessment_type?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string | null
          screening_config_id: string
          sector_id?: string | null
          trigger_event: string
          updated_at?: string
        }
        Update: {
          assessment_type?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string | null
          screening_config_id?: string
          sector_id?: string | null
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fp_screening_execution_rules_screening_config_id_fkey"
            columns: ["screening_config_id"]
            isOneToOne: false
            referencedRelation: "fp_screening_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_screening_execution_rules_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_screening_runs: {
        Row: {
          assessment_id: string
          completed_at: string | null
          config_snapshot: Json | null
          error: string | null
          id: string
          individual_id: string
          run_type: string
          started_at: string
          status: string
          total_checks: number
          total_hits: number
          triggered_by: string | null
        }
        Insert: {
          assessment_id: string
          completed_at?: string | null
          config_snapshot?: Json | null
          error?: string | null
          id?: string
          individual_id: string
          run_type?: string
          started_at?: string
          status?: string
          total_checks?: number
          total_hits?: number
          triggered_by?: string | null
        }
        Update: {
          assessment_id?: string
          completed_at?: string | null
          config_snapshot?: Json | null
          error?: string | null
          id?: string
          individual_id?: string
          run_type?: string
          started_at?: string
          status?: string
          total_checks?: number
          total_hits?: number
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fp_screening_runs_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "fp_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_screening_runs_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "fp_individuals"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_sector_decision_rules: {
        Row: {
          created_at: string
          created_by: string | null
          criteria: Json
          id: string
          is_active: boolean
          name: string
          rationale_template_id: string | null
          role_type: string | null
          sector_id: string
          sub_sector_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          criteria?: Json
          id?: string
          is_active?: boolean
          name: string
          rationale_template_id?: string | null
          role_type?: string | null
          sector_id: string
          sub_sector_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          criteria?: Json
          id?: string
          is_active?: boolean
          name?: string
          rationale_template_id?: string | null
          role_type?: string | null
          sector_id?: string
          sub_sector_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fp_sector_decision_rules_rationale_template_id_fkey"
            columns: ["rationale_template_id"]
            isOneToOne: false
            referencedRelation: "decision_rationale_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_sector_decision_rules_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_sector_decision_rules_sub_sector_id_fkey"
            columns: ["sub_sector_id"]
            isOneToOne: false
            referencedRelation: "sub_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_task_evidence: {
        Row: {
          file_name: string
          file_path: string
          id: string
          task_id: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          file_name: string
          file_path: string
          id?: string
          task_id: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          file_name?: string
          file_path?: string
          id?: string
          task_id?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "fp_task_evidence_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "fp_manual_screening_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_findings: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string
          escalated_at: string | null
          escalated_by: string | null
          escalated_enforcement_id: string | null
          follow_up_due: string | null
          follow_up_owner: string | null
          id: string
          inspection_id: string
          recommended_action: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          description: string
          escalated_at?: string | null
          escalated_by?: string | null
          escalated_enforcement_id?: string | null
          follow_up_due?: string | null
          follow_up_owner?: string | null
          id?: string
          inspection_id: string
          recommended_action?: string | null
          severity: string
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          escalated_at?: string | null
          escalated_by?: string | null
          escalated_enforcement_id?: string | null
          follow_up_due?: string | null
          follow_up_owner?: string | null
          id?: string
          inspection_id?: string
          recommended_action?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_findings_escalated_enforcement_id_fkey"
            columns: ["escalated_enforcement_id"]
            isOneToOne: false
            referencedRelation: "enforcement_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_findings_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
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
          lead_inspector_id: string | null
          location: string | null
          report_url: string | null
          scheduled_date: string | null
          scope: string | null
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
          lead_inspector_id?: string | null
          location?: string | null
          report_url?: string | null
          scheduled_date?: string | null
          scope?: string | null
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
          lead_inspector_id?: string | null
          location?: string | null
          report_url?: string | null
          scheduled_date?: string | null
          scope?: string | null
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
          {
            foreignKeyName: "inspections_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
        ]
      }
      integration_logs: {
        Row: {
          actor_id: string | null
          created_at: string
          direction: string
          duration_ms: number | null
          endpoint: string | null
          entity_id: string | null
          entity_type: string | null
          error: string | null
          http_status: number | null
          id: string
          integration_key: string
          metadata: Json
          method: string | null
          request_summary: string | null
          response_summary: string | null
          status: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          direction: string
          duration_ms?: number | null
          endpoint?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          http_status?: number | null
          id?: string
          integration_key: string
          metadata?: Json
          method?: string | null
          request_summary?: string | null
          response_summary?: string | null
          status: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          direction?: string
          duration_ms?: number | null
          endpoint?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          http_status?: number | null
          id?: string
          integration_key?: string
          metadata?: Json
          method?: string | null
          request_summary?: string | null
          response_summary?: string | null
          status?: string
        }
        Relationships: []
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
      license_action_form_configs: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          form_template_id: string
          id: string
          is_active: boolean
          is_required: boolean
          license_action_type: string
          regulator_id: string | null
          sector_id: string | null
          sub_sector_id: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          form_template_id: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          license_action_type: string
          regulator_id?: string | null
          sector_id?: string | null
          sub_sector_id?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          form_template_id?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          license_action_type?: string
          regulator_id?: string | null
          sector_id?: string | null
          sub_sector_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_action_form_configs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_action_form_configs_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_action_form_configs_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_action_form_configs_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_action_form_configs_sub_sector_id_fkey"
            columns: ["sub_sector_id"]
            isOneToOne: false
            referencedRelation: "sub_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      license_actions: {
        Row: {
          action_type: string
          actor_id: string
          created_at: string
          form_response_id: string | null
          form_template_id: string | null
          form_version_id: string | null
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
          form_response_id?: string | null
          form_template_id?: string | null
          form_version_id?: string | null
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
          form_response_id?: string | null
          form_template_id?: string | null
          form_version_id?: string | null
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
      license_appeal_events: {
        Row: {
          actor_id: string | null
          appeal_id: string
          created_at: string
          description: string
          event_type: string
          id: string
          metadata: Json
        }
        Insert: {
          actor_id?: string | null
          appeal_id: string
          created_at?: string
          description: string
          event_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          actor_id?: string | null
          appeal_id?: string
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "license_appeal_events_appeal_id_fkey"
            columns: ["appeal_id"]
            isOneToOne: false
            referencedRelation: "license_appeals"
            referencedColumns: ["id"]
          },
        ]
      }
      license_appeal_panel_members: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          member_role: string
          panel_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          member_role?: string
          panel_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          member_role?: string
          panel_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_appeal_panel_members_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "license_appeal_panels"
            referencedColumns: ["id"]
          },
        ]
      }
      license_appeal_panels: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          regulator_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          regulator_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          regulator_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      license_appeals: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          appeal_deadline: string | null
          appeal_reference: string
          application_id: string
          assigned_to: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision: string | null
          decision_rationale: string | null
          filed_at: string
          filed_by: string
          grounds: string
          hearing_date: string | null
          id: string
          license_id: string | null
          licensee_id: string | null
          panel_id: string | null
          regulator_id: string | null
          relief_sought: string | null
          status: string
          supporting_docs: Json
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          appeal_deadline?: string | null
          appeal_reference: string
          application_id: string
          assigned_to?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          decision_rationale?: string | null
          filed_at?: string
          filed_by: string
          grounds: string
          hearing_date?: string | null
          id?: string
          license_id?: string | null
          licensee_id?: string | null
          panel_id?: string | null
          regulator_id?: string | null
          relief_sought?: string | null
          status?: string
          supporting_docs?: Json
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          appeal_deadline?: string | null
          appeal_reference?: string
          application_id?: string
          assigned_to?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          decision_rationale?: string | null
          filed_at?: string
          filed_by?: string
          grounds?: string
          hearing_date?: string | null
          id?: string
          license_id?: string | null
          licensee_id?: string | null
          panel_id?: string | null
          regulator_id?: string | null
          relief_sought?: string | null
          status?: string
          supporting_docs?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_appeals_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_appeals_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "report_view_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_appeals_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "license_appeal_panels"
            referencedColumns: ["id"]
          },
        ]
      }
      license_certificate_signatures: {
        Row: {
          certificate_id: string
          content_sha256: string
          created_at: string
          id: string
          license_id: string
          reason: string | null
          signature_hmac: string
          signed_at: string
          signer_name: string
          signer_title: string | null
          signer_user_id: string
          signing_key_fingerprint: string
        }
        Insert: {
          certificate_id: string
          content_sha256: string
          created_at?: string
          id?: string
          license_id: string
          reason?: string | null
          signature_hmac: string
          signed_at?: string
          signer_name: string
          signer_title?: string | null
          signer_user_id: string
          signing_key_fingerprint: string
        }
        Update: {
          certificate_id?: string
          content_sha256?: string
          created_at?: string
          id?: string
          license_id?: string
          reason?: string | null
          signature_hmac?: string
          signed_at?: string
          signer_name?: string
          signer_title?: string | null
          signer_user_id?: string
          signing_key_fingerprint?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_certificate_signatures_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "license_certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_certificate_signatures_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_certificate_signatures_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "report_view_licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      license_certificates: {
        Row: {
          created_at: string
          dispatch_status: string
          dispatched_at: string | null
          dispatched_by: string | null
          file_path: string
          id: string
          is_signed: boolean
          license_id: string
          metadata: Json
          signatory_name: string | null
          signatory_title: string | null
          signature_fingerprint: string | null
          signed_at: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          dispatch_status?: string
          dispatched_at?: string | null
          dispatched_by?: string | null
          file_path: string
          id?: string
          is_signed?: boolean
          license_id: string
          metadata?: Json
          signatory_name?: string | null
          signatory_title?: string | null
          signature_fingerprint?: string | null
          signed_at?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          dispatch_status?: string
          dispatched_at?: string | null
          dispatched_by?: string | null
          file_path?: string
          id?: string
          is_signed?: boolean
          license_id?: string
          metadata?: Json
          signatory_name?: string | null
          signatory_title?: string | null
          signature_fingerprint?: string | null
          signed_at?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "license_certificates_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_certificates_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "report_view_licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      license_conditions: {
        Row: {
          application_id: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string
          due_date: string | null
          id: string
          license_id: string
          monitoring_owner: string | null
          notes: string | null
          satisfied_at: string | null
          satisfied_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          description: string
          due_date?: string | null
          id?: string
          license_id: string
          monitoring_owner?: string | null
          notes?: string | null
          satisfied_at?: string | null
          satisfied_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string | null
          id?: string
          license_id?: string
          monitoring_owner?: string | null
          notes?: string | null
          satisfied_at?: string | null
          satisfied_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_conditions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_conditions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "report_view_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_conditions_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_conditions_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "report_view_licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      license_renewals: {
        Row: {
          created_at: string
          decision_reason: string | null
          id: string
          initiated_by: string
          license_id: string
          new_valid_until: string
          notes: string | null
          previous_valid_until: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decision_reason?: string | null
          id?: string
          initiated_by: string
          license_id: string
          new_valid_until: string
          notes?: string | null
          previous_valid_until?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decision_reason?: string | null
          id?: string
          initiated_by?: string
          license_id?: string
          new_valid_until?: string
          notes?: string | null
          previous_valid_until?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_renewals_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_renewals_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "report_view_licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      licensee_channels: {
        Row: {
          active_from: string | null
          active_to: string | null
          channel_id: string
          created_at: string
          created_by: string | null
          id: string
          licensee_id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          active_from?: string | null
          active_to?: string | null
          channel_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          licensee_id: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          active_from?: string | null
          active_to?: string | null
          channel_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          licensee_id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "licensee_channels_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "conduct_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_channels_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_channels_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
        ]
      }
      licensee_products: {
        Row: {
          active_from: string | null
          active_to: string | null
          created_at: string
          created_by: string | null
          id: string
          licensee_id: string
          notes: string | null
          product_id: string
          updated_at: string
        }
        Insert: {
          active_from?: string | null
          active_to?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          licensee_id: string
          notes?: string | null
          product_id: string
          updated_at?: string
        }
        Update: {
          active_from?: string | null
          active_to?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          licensee_id?: string
          notes?: string | null
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "licensee_products_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_products_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
          {
            foreignKeyName: "licensee_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "conduct_products"
            referencedColumns: ["id"]
          },
        ]
      }
      licensees: {
        Row: {
          alternate_regulator_id: string | null
          applicant_id: string | null
          assigned_supervisor_id: string | null
          category_id: string | null
          created_at: string
          id: string
          lead_regulator_id: string | null
          license_id: string | null
          name: string
          regulator_officer_id: string | null
          sector_id: string | null
          status: string
          sub_sector_id: string | null
          systemic_importance: string | null
          updated_at: string
        }
        Insert: {
          alternate_regulator_id?: string | null
          applicant_id?: string | null
          assigned_supervisor_id?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          lead_regulator_id?: string | null
          license_id?: string | null
          name: string
          regulator_officer_id?: string | null
          sector_id?: string | null
          status?: string
          sub_sector_id?: string | null
          systemic_importance?: string | null
          updated_at?: string
        }
        Update: {
          alternate_regulator_id?: string | null
          applicant_id?: string | null
          assigned_supervisor_id?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          lead_regulator_id?: string | null
          license_id?: string | null
          name?: string
          regulator_officer_id?: string | null
          sector_id?: string | null
          status?: string
          sub_sector_id?: string | null
          systemic_importance?: string | null
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
      licensing_audit_determinations: {
        Row: {
          created_at: string
          effective_date: string
          entity_id: string
          id: string
          issued_at: string
          issued_by: string
          rationale: string
          risk_rating_id: string | null
          updated_at: string
          verdict: string
        }
        Insert: {
          created_at?: string
          effective_date?: string
          entity_id: string
          id?: string
          issued_at?: string
          issued_by: string
          rationale: string
          risk_rating_id?: string | null
          updated_at?: string
          verdict: string
        }
        Update: {
          created_at?: string
          effective_date?: string
          entity_id?: string
          id?: string
          issued_at?: string
          issued_by?: string
          rationale?: string
          risk_rating_id?: string | null
          updated_at?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "licensing_audit_determinations_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensing_audit_determinations_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
          {
            foreignKeyName: "licensing_audit_determinations_risk_rating_id_fkey"
            columns: ["risk_rating_id"]
            isOneToOne: false
            referencedRelation: "risk_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      licensing_audit_risk_profiles: {
        Row: {
          created_at: string
          entity_id: string
          generated_at: string
          generated_by: string
          id: string
          key_drivers: Json
          profile_score: number
          snapshot: Json
          tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          generated_at?: string
          generated_by: string
          id?: string
          key_drivers?: Json
          profile_score: number
          snapshot?: Json
          tier: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          generated_at?: string
          generated_by?: string
          id?: string
          key_drivers?: Json
          profile_score?: number
          snapshot?: Json
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "licensing_audit_risk_profiles_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensing_audit_risk_profiles_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
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
      notification_digest_log: {
        Row: {
          categories_included: string[]
          channel: string
          created_at: string
          error_message: string | null
          id: string
          item_count: number
          payload: Json | null
          sent_at: string
          status: string
          user_id: string
        }
        Insert: {
          categories_included?: string[]
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          item_count?: number
          payload?: Json | null
          sent_at?: string
          status?: string
          user_id: string
        }
        Update: {
          categories_included?: string[]
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          item_count?: number
          payload?: Json | null
          sent_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_dispatch_log: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
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
          acknowledged_at?: string | null
          acknowledged_by?: string | null
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
          acknowledged_at?: string | null
          acknowledged_by?: string | null
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
      notification_outbox: {
        Row: {
          action_history_id: string | null
          body: string | null
          channel: string
          claimed_at: string | null
          claimed_by: string | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          event_key: string
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          recipient_email: string | null
          recipient_user_id: string | null
          retry_count: number
          sent_at: string | null
          status: string
          subject: string | null
          template_id: string | null
        }
        Insert: {
          action_history_id?: string | null
          body?: string | null
          channel: string
          claimed_at?: string | null
          claimed_by?: string | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event_key: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          recipient_email?: string | null
          recipient_user_id?: string | null
          retry_count?: number
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
        }
        Update: {
          action_history_id?: string | null
          body?: string | null
          channel?: string
          claimed_at?: string | null
          claimed_by?: string | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_key?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          recipient_email?: string | null
          recipient_user_id?: string | null
          retry_count?: number
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          categories: Json
          channels: Json
          created_at: string
          digest_enabled: boolean
          digest_time: string
          digest_timezone: string
          id: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          categories?: Json
          channels?: Json
          created_at?: string
          digest_enabled?: boolean
          digest_time?: string
          digest_timezone?: string
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          categories?: Json
          channels?: Json
          created_at?: string
          digest_enabled?: boolean
          digest_time?: string
          digest_timezone?: string
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id?: string
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
      permission_actions: {
        Row: {
          audience: string
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          key: string
          label: string
          module_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          audience?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key: string
          label: string
          module_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          audience?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key?: string
          label?: string
          module_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_actions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "permission_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_dependent_actions: {
        Row: {
          action: string
          created_at: string
          description: string | null
          updated_at: string
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      permission_module_routes: {
        Row: {
          created_at: string
          id: string
          menu_label: string | null
          module_id: string
          route_prefix: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          menu_label?: string | null
          module_id: string
          route_prefix: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          menu_label?: string | null
          module_id?: string
          route_prefix?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_module_routes_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "permission_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_modules: {
        Row: {
          audience: string
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          key: string
          label: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          audience?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key: string
          label: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          audience?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key?: string
          label?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_modules_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "permission_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action_id: string | null
          created_at: string
          deprecated: boolean
          description: string | null
          enforced: boolean
          id: string
          module: string
          name: string
        }
        Insert: {
          action_id?: string | null
          created_at?: string
          deprecated?: boolean
          description?: string | null
          enforced?: boolean
          id?: string
          module: string
          name: string
        }
        Update: {
          action_id?: string | null
          created_at?: string
          deprecated?: boolean
          description?: string | null
          enforced?: boolean
          id?: string
          module?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissions_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "permission_actions"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "ppoc_entity_mappings_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
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
          regulator_id: string | null
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
          regulator_id?: string | null
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
          regulator_id?: string | null
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
            foreignKeyName: "profiles_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
          {
            foreignKeyName: "profiles_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
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
      prudential_actions: {
        Row: {
          action_type: string
          assigned_to: string | null
          cancellation_reason: string | null
          closed_at: string | null
          closed_by: string | null
          completion_notes: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          entity_contact: string | null
          entity_id: string
          id: string
          severity: string
          source_id: string | null
          source_type: string
          status: string
          title: string
          updated_at: string
          waiver_reason: string | null
        }
        Insert: {
          action_type: string
          assigned_to?: string | null
          cancellation_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          entity_contact?: string | null
          entity_id: string
          id?: string
          severity?: string
          source_id?: string | null
          source_type: string
          status?: string
          title: string
          updated_at?: string
          waiver_reason?: string | null
        }
        Update: {
          action_type?: string
          assigned_to?: string | null
          cancellation_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          entity_contact?: string | null
          entity_id?: string
          id?: string
          severity?: string
          source_id?: string | null
          source_type?: string
          status?: string
          title?: string
          updated_at?: string
          waiver_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prudential_actions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prudential_actions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
        ]
      }
      prudential_assessments: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          auto_suggested_rating: string | null
          closed_at: string | null
          conclusion: string | null
          created_at: string
          created_by: string | null
          entity_id: string
          evidence_refs: Json
          id: string
          overall_rating: string | null
          override_reason: string | null
          period_end: string | null
          period_start: string | null
          ratings: Json
          rationale: string | null
          recommended_response: string | null
          return_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          signal_snapshot: Json
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          auto_suggested_rating?: string | null
          closed_at?: string | null
          conclusion?: string | null
          created_at?: string
          created_by?: string | null
          entity_id: string
          evidence_refs?: Json
          id?: string
          overall_rating?: string | null
          override_reason?: string | null
          period_end?: string | null
          period_start?: string | null
          ratings?: Json
          rationale?: string | null
          recommended_response?: string | null
          return_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signal_snapshot?: Json
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          auto_suggested_rating?: string | null
          closed_at?: string | null
          conclusion?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string
          evidence_refs?: Json
          id?: string
          overall_rating?: string | null
          override_reason?: string | null
          period_end?: string | null
          period_start?: string | null
          ratings?: Json
          rationale?: string | null
          recommended_response?: string | null
          return_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signal_snapshot?: Json
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prudential_assessments_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prudential_assessments_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
          {
            foreignKeyName: "prudential_assessments_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns_filed"
            referencedColumns: ["id"]
          },
        ]
      }
      prudential_data_feed_logs: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          feed_type: string
          id: string
          metadata: Json
          related_return_id: string | null
          row_count: number | null
          source: string
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          feed_type: string
          id?: string
          metadata?: Json
          related_return_id?: string | null
          row_count?: number | null
          source: string
          started_at?: string
          status: string
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          feed_type?: string
          id?: string
          metadata?: Json
          related_return_id?: string | null
          row_count?: number | null
          source?: string
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prudential_data_feed_logs_related_return_id_fkey"
            columns: ["related_return_id"]
            isOneToOne: false
            referencedRelation: "returns_filed"
            referencedColumns: ["id"]
          },
        ]
      }
      prudential_escalations: {
        Row: {
          created_at: string
          created_by: string | null
          decided_at: string | null
          decision: string | null
          decision_by: string | null
          entity_id: string
          escalation_type: string
          evidence: Json
          id: string
          outcome: string | null
          priority: string | null
          reason: string | null
          related_id: string | null
          related_type: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decision?: string | null
          decision_by?: string | null
          entity_id: string
          escalation_type: string
          evidence?: Json
          id?: string
          outcome?: string | null
          priority?: string | null
          reason?: string | null
          related_id?: string | null
          related_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decision?: string | null
          decision_by?: string | null
          entity_id?: string
          escalation_type?: string
          evidence?: Json
          id?: string
          outcome?: string | null
          priority?: string | null
          reason?: string | null
          related_id?: string | null
          related_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prudential_escalations_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prudential_escalations_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
        ]
      }
      prudential_ratio_versions: {
        Row: {
          display_format: string | null
          effective_from: string
          formula: string
          id: string
          published_at: string
          published_by: string | null
          ratio_id: string
          version: number
        }
        Insert: {
          display_format?: string | null
          effective_from?: string
          formula: string
          id?: string
          published_at?: string
          published_by?: string | null
          ratio_id: string
          version: number
        }
        Update: {
          display_format?: string | null
          effective_from?: string
          formula?: string
          id?: string
          published_at?: string
          published_by?: string | null
          ratio_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prudential_ratio_versions_ratio_id_fkey"
            columns: ["ratio_id"]
            isOneToOne: false
            referencedRelation: "prudential_ratios"
            referencedColumns: ["id"]
          },
        ]
      }
      prudential_ratios: {
        Row: {
          category: string | null
          created_at: string
          current_version: number
          display_format: string
          formula: string
          id: string
          is_active: boolean
          label: string
          metric_key: string | null
          ratio_key: string
          recommendation_template: string | null
          return_config_id: string
          taxonomy_code: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          current_version?: number
          display_format?: string
          formula: string
          id?: string
          is_active?: boolean
          label: string
          metric_key?: string | null
          ratio_key: string
          recommendation_template?: string | null
          return_config_id: string
          taxonomy_code?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          current_version?: number
          display_format?: string
          formula?: string
          id?: string
          is_active?: boolean
          label?: string
          metric_key?: string | null
          ratio_key?: string
          recommendation_template?: string | null
          return_config_id?: string
          taxonomy_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prudential_ratios_return_config_id_fkey"
            columns: ["return_config_id"]
            isOneToOne: false
            referencedRelation: "return_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      prudential_risk_taxonomy: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          label: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prudential_risk_taxonomy_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "prudential_risk_taxonomy"
            referencedColumns: ["id"]
          },
        ]
      }
      prudential_stress_events: {
        Row: {
          created_at: string
          entity_id: string | null
          id: string
          indicator_id: string
          notified: boolean
          observed_value: number | null
          resolved_at: string | null
          return_id: string | null
          triggered_at: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          id?: string
          indicator_id: string
          notified?: boolean
          observed_value?: number | null
          resolved_at?: string | null
          return_id?: string | null
          triggered_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          id?: string
          indicator_id?: string
          notified?: boolean
          observed_value?: number | null
          resolved_at?: string | null
          return_id?: string | null
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prudential_stress_events_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prudential_stress_events_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
          {
            foreignKeyName: "prudential_stress_events_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "prudential_stress_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prudential_stress_events_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns_filed"
            referencedColumns: ["id"]
          },
        ]
      }
      prudential_stress_indicators: {
        Row: {
          created_at: string
          created_by: string | null
          direction: string
          escalate: boolean
          id: string
          is_active: boolean
          label: string
          metric_key: string
          notify_roles: Json
          sector_id: string | null
          severity: string
          sub_sector_id: string | null
          taxonomy_code: string | null
          threshold_value: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          direction: string
          escalate?: boolean
          id?: string
          is_active?: boolean
          label: string
          metric_key: string
          notify_roles?: Json
          sector_id?: string | null
          severity?: string
          sub_sector_id?: string | null
          taxonomy_code?: string | null
          threshold_value: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          direction?: string
          escalate?: boolean
          id?: string
          is_active?: boolean
          label?: string
          metric_key?: string
          notify_roles?: Json
          sector_id?: string | null
          severity?: string
          sub_sector_id?: string | null
          taxonomy_code?: string | null
          threshold_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prudential_stress_indicators_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prudential_stress_indicators_sub_sector_id_fkey"
            columns: ["sub_sector_id"]
            isOneToOne: false
            referencedRelation: "sub_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      prudential_threshold_versions: {
        Row: {
          breach_value: number | null
          comparator: string
          effective_from: string
          effective_to: string | null
          id: string
          published_at: string
          published_by: string | null
          threshold_id: string
          unit: string | null
          upper_value: number | null
          version: number
          warn_value: number | null
        }
        Insert: {
          breach_value?: number | null
          comparator: string
          effective_from: string
          effective_to?: string | null
          id?: string
          published_at?: string
          published_by?: string | null
          threshold_id: string
          unit?: string | null
          upper_value?: number | null
          version: number
          warn_value?: number | null
        }
        Update: {
          breach_value?: number | null
          comparator?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          published_at?: string
          published_by?: string | null
          threshold_id?: string
          unit?: string | null
          upper_value?: number | null
          version?: number
          warn_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prudential_threshold_versions_threshold_id_fkey"
            columns: ["threshold_id"]
            isOneToOne: false
            referencedRelation: "prudential_thresholds"
            referencedColumns: ["id"]
          },
        ]
      }
      prudential_thresholds: {
        Row: {
          breach_value: number | null
          comparator: string
          created_at: string
          current_version: number
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          label: string
          metric_key: string
          return_config_id: string
          return_type_id: string | null
          sector_id: string | null
          taxonomy_code: string | null
          unit: string | null
          updated_at: string
          upper_value: number | null
          warn_value: number | null
        }
        Insert: {
          breach_value?: number | null
          comparator: string
          created_at?: string
          current_version?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          label: string
          metric_key: string
          return_config_id: string
          return_type_id?: string | null
          sector_id?: string | null
          taxonomy_code?: string | null
          unit?: string | null
          updated_at?: string
          upper_value?: number | null
          warn_value?: number | null
        }
        Update: {
          breach_value?: number | null
          comparator?: string
          created_at?: string
          current_version?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          label?: string
          metric_key?: string
          return_config_id?: string
          return_type_id?: string | null
          sector_id?: string | null
          taxonomy_code?: string | null
          unit?: string | null
          updated_at?: string
          upper_value?: number | null
          warn_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prudential_thresholds_return_config_id_fkey"
            columns: ["return_config_id"]
            isOneToOne: false
            referencedRelation: "return_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      rbac_module_scopes: {
        Row: {
          created_at: string
          help: string | null
          label: string
          module: string
          scope: string
          selector: string | null
        }
        Insert: {
          created_at?: string
          help?: string | null
          label: string
          module: string
          scope: string
          selector?: string | null
        }
        Update: {
          created_at?: string
          help?: string | null
          label?: string
          module?: string
          scope?: string
          selector?: string | null
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
          form_schema_backup: Json | null
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
          form_schema_backup?: Json | null
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
          form_schema_backup?: Json | null
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
          review_notes: string | null
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
          review_notes?: string | null
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
          review_notes?: string | null
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
          {
            foreignKeyName: "reinsurance_contracts_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
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
      return_calculated_ratios: {
        Row: {
          computed_at: string
          computed_by: string | null
          display_format: string | null
          formula_snapshot: string | null
          id: string
          label: string | null
          null_reason: string | null
          ratio_key: string
          ratio_version: number | null
          return_config_id: string | null
          return_id: string
          value: number | null
        }
        Insert: {
          computed_at?: string
          computed_by?: string | null
          display_format?: string | null
          formula_snapshot?: string | null
          id?: string
          label?: string | null
          null_reason?: string | null
          ratio_key: string
          ratio_version?: number | null
          return_config_id?: string | null
          return_id: string
          value?: number | null
        }
        Update: {
          computed_at?: string
          computed_by?: string | null
          display_format?: string | null
          formula_snapshot?: string | null
          id?: string
          label?: string | null
          null_reason?: string | null
          ratio_key?: string
          ratio_version?: number | null
          return_config_id?: string | null
          return_id?: string
          value?: number | null
        }
        Relationships: []
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
      return_consolidated_analysis: {
        Row: {
          ai_summary: string | null
          asset_quality_summary: Json
          capital_summary: Json
          computed_at: string
          computed_by: string | null
          concentration_risks: Json
          early_warnings: Json
          health_score: number | null
          heatmap: Json
          id: string
          inputs: Json
          liquidity_summary: Json
          peer: Json
          profitability_summary: Json
          recommendations: Json
          return_config_id: string | null
          return_id: string
          sector_id: string | null
          trend: Json
        }
        Insert: {
          ai_summary?: string | null
          asset_quality_summary?: Json
          capital_summary?: Json
          computed_at?: string
          computed_by?: string | null
          concentration_risks?: Json
          early_warnings?: Json
          health_score?: number | null
          heatmap?: Json
          id?: string
          inputs?: Json
          liquidity_summary?: Json
          peer?: Json
          profitability_summary?: Json
          recommendations?: Json
          return_config_id?: string | null
          return_id: string
          sector_id?: string | null
          trend?: Json
        }
        Update: {
          ai_summary?: string | null
          asset_quality_summary?: Json
          capital_summary?: Json
          computed_at?: string
          computed_by?: string | null
          concentration_risks?: Json
          early_warnings?: Json
          health_score?: number | null
          heatmap?: Json
          id?: string
          inputs?: Json
          liquidity_summary?: Json
          peer?: Json
          profitability_summary?: Json
          recommendations?: Json
          return_config_id?: string | null
          return_id?: string
          sector_id?: string | null
          trend?: Json
        }
        Relationships: []
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
      return_data_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          form_version_ids: Json
          id: string
          new_status: string | null
          previous_status: string | null
          return_id: string
          revision_number: number
          snapshot: Json
          snapshot_reason: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          form_version_ids?: Json
          id?: string
          new_status?: string | null
          previous_status?: string | null
          return_id: string
          revision_number: number
          snapshot?: Json
          snapshot_reason: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          form_version_ids?: Json
          id?: string
          new_status?: string | null
          previous_status?: string | null
          return_id?: string
          revision_number?: number
          snapshot?: Json
          snapshot_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_data_revisions_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns_filed"
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
            foreignKeyName: "return_due_dates_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
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
      return_edit_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_comment: string | null
          id: string
          reason: string
          requested_at: string
          requested_by: string | null
          return_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_comment?: string | null
          id?: string
          reason: string
          requested_at?: string
          requested_by?: string | null
          return_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_comment?: string | null
          id?: string
          reason?: string
          requested_at?: string
          requested_by?: string | null
          return_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_edit_requests_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns_filed"
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
      return_template_downloads: {
        Row: {
          downloaded_at: string
          downloaded_by: string | null
          fingerprint: string | null
          form_version_ids: string[]
          format: string
          id: string
          licensee_id: string | null
          metadata: Json
          return_id: string
        }
        Insert: {
          downloaded_at?: string
          downloaded_by?: string | null
          fingerprint?: string | null
          form_version_ids?: string[]
          format: string
          id?: string
          licensee_id?: string | null
          metadata?: Json
          return_id: string
        }
        Update: {
          downloaded_at?: string
          downloaded_by?: string | null
          fingerprint?: string | null
          form_version_ids?: string[]
          format?: string
          id?: string
          licensee_id?: string | null
          metadata?: Json
          return_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_template_downloads_return_id_fkey"
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
      return_threshold_breaches: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          acknowledgement_note: string | null
          comparator: string | null
          detected_at: string
          escalated_at: string | null
          escalated_by: string | null
          escalated_enforcement_id: string | null
          id: string
          level: string
          metric_key: string
          notified: boolean
          return_config_id: string | null
          return_id: string
          risk_level: string | null
          threshold_value: number | null
          threshold_version: number | null
          value: number | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledgement_note?: string | null
          comparator?: string | null
          detected_at?: string
          escalated_at?: string | null
          escalated_by?: string | null
          escalated_enforcement_id?: string | null
          id?: string
          level: string
          metric_key: string
          notified?: boolean
          return_config_id?: string | null
          return_id: string
          risk_level?: string | null
          threshold_value?: number | null
          threshold_version?: number | null
          value?: number | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledgement_note?: string | null
          comparator?: string | null
          detected_at?: string
          escalated_at?: string | null
          escalated_by?: string | null
          escalated_enforcement_id?: string | null
          id?: string
          level?: string
          metric_key?: string
          notified?: boolean
          return_config_id?: string | null
          return_id?: string
          risk_level?: string | null
          threshold_value?: number | null
          threshold_version?: number | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "return_threshold_breaches_escalated_enforcement_id_fkey"
            columns: ["escalated_enforcement_id"]
            isOneToOne: false
            referencedRelation: "enforcement_actions"
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
      return_upload_attempts: {
        Row: {
          checksum: string | null
          created_at: string
          errors: Json
          fingerprint: string | null
          form_version_ids: string[]
          id: string
          licensee_id: string | null
          mime_type: string | null
          original_filename: string
          parsed_payload: Json | null
          return_id: string
          size_bytes: number
          status: string
          storage_path: string | null
          summary: Json
          updated_at: string
          uploaded_by: string | null
          warnings: Json
        }
        Insert: {
          checksum?: string | null
          created_at?: string
          errors?: Json
          fingerprint?: string | null
          form_version_ids?: string[]
          id?: string
          licensee_id?: string | null
          mime_type?: string | null
          original_filename: string
          parsed_payload?: Json | null
          return_id: string
          size_bytes?: number
          status?: string
          storage_path?: string | null
          summary?: Json
          updated_at?: string
          uploaded_by?: string | null
          warnings?: Json
        }
        Update: {
          checksum?: string | null
          created_at?: string
          errors?: Json
          fingerprint?: string | null
          form_version_ids?: string[]
          id?: string
          licensee_id?: string | null
          mime_type?: string | null
          original_filename?: string
          parsed_payload?: Json | null
          return_id?: string
          size_bytes?: number
          status?: string
          storage_path?: string | null
          summary?: Json
          updated_at?: string
          uploaded_by?: string | null
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "return_upload_attempts_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns_filed"
            referencedColumns: ["id"]
          },
        ]
      }
      return_upload_imports: {
        Row: {
          committed_at: string
          committed_by: string | null
          forms_touched: string[]
          id: string
          strategy: string
          upload_id: string
          values_written: number
        }
        Insert: {
          committed_at?: string
          committed_by?: string | null
          forms_touched?: string[]
          id?: string
          strategy: string
          upload_id: string
          values_written?: number
        }
        Update: {
          committed_at?: string
          committed_by?: string | null
          forms_touched?: string[]
          id?: string
          strategy?: string
          upload_id?: string
          values_written?: number
        }
        Relationships: [
          {
            foreignKeyName: "return_upload_imports_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "return_upload_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      return_validation_rule_versions: {
        Row: {
          definition: Json
          id: string
          is_current: boolean
          published_at: string
          published_by: string | null
          rule_id: string
          version: number
        }
        Insert: {
          definition: Json
          id?: string
          is_current?: boolean
          published_at?: string
          published_by?: string | null
          rule_id: string
          version: number
        }
        Update: {
          definition?: Json
          id?: string
          is_current?: boolean
          published_at?: string
          published_by?: string | null
          rule_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "return_validation_rule_versions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "return_validation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      return_validation_rules: {
        Row: {
          created_at: string
          created_by: string | null
          current_version: number
          error_message: string
          expression: string
          field_refs: Json
          form_id: string | null
          id: string
          is_active: boolean
          name: string
          return_config_id: string
          rule_type: string
          scope: string
          severity: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_version?: number
          error_message: string
          expression: string
          field_refs?: Json
          form_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          return_config_id: string
          rule_type: string
          scope: string
          severity?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_version?: number
          error_message?: string
          expression?: string
          field_refs?: Json
          form_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          return_config_id?: string
          rule_type?: string
          scope?: string
          severity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_validation_rules_return_config_id_fkey"
            columns: ["return_config_id"]
            isOneToOne: false
            referencedRelation: "return_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      return_validation_run_log: {
        Row: {
          batch_id: string
          context: string
          executed_at: string
          executed_by: string | null
          id: string
          message: string | null
          passed: boolean
          return_id: string
          rule_id: string | null
          rule_name: string | null
          rule_version: number | null
          severity: string
        }
        Insert: {
          batch_id: string
          context?: string
          executed_at?: string
          executed_by?: string | null
          id?: string
          message?: string | null
          passed: boolean
          return_id: string
          rule_id?: string | null
          rule_name?: string | null
          rule_version?: number | null
          severity: string
        }
        Update: {
          batch_id?: string
          context?: string
          executed_at?: string
          executed_by?: string | null
          id?: string
          message?: string | null
          passed?: boolean
          return_id?: string
          rule_id?: string | null
          rule_name?: string | null
          rule_version?: number | null
          severity?: string
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
          explanations: string | null
          id: string
          latest_validation_batch_id: string | null
          on_behalf_of_licensee_id: string | null
          ontime_status:
            | Database["public"]["Enums"]["ontime_status_enum"]
            | null
          period_end_date: string
          period_start_date: string
          return_configuration_id: string
          return_period: string
          return_year: number
          reviewer_notes: string | null
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
          explanations?: string | null
          id?: string
          latest_validation_batch_id?: string | null
          on_behalf_of_licensee_id?: string | null
          ontime_status?:
            | Database["public"]["Enums"]["ontime_status_enum"]
            | null
          period_end_date: string
          period_start_date: string
          return_configuration_id: string
          return_period: string
          return_year: number
          reviewer_notes?: string | null
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
          explanations?: string | null
          id?: string
          latest_validation_batch_id?: string | null
          on_behalf_of_licensee_id?: string | null
          ontime_status?:
            | Database["public"]["Enums"]["ontime_status_enum"]
            | null
          period_end_date?: string
          period_start_date?: string
          return_configuration_id?: string
          return_period?: string
          return_year?: number
          reviewer_notes?: string | null
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
            foreignKeyName: "returns_filed_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
          {
            foreignKeyName: "returns_filed_on_behalf_of_licensee_id_fkey"
            columns: ["on_behalf_of_licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_filed_on_behalf_of_licensee_id_fkey"
            columns: ["on_behalf_of_licensee_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
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
      review_comments: {
        Row: {
          author_role_id: string | null
          author_user_id: string
          body: string
          created_at: string
          entity_id: string
          entity_type: string
          field_key: string
          id: string
          is_blocking: boolean
          parent_comment_id: string | null
          regulator_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          selection_end: number | null
          selection_start: number | null
          selection_text: string | null
          status: string
          updated_at: string
          workflow_instance_id: string | null
          workflow_step_id: string | null
        }
        Insert: {
          author_role_id?: string | null
          author_user_id: string
          body: string
          created_at?: string
          entity_id: string
          entity_type: string
          field_key: string
          id?: string
          is_blocking?: boolean
          parent_comment_id?: string | null
          regulator_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          selection_end?: number | null
          selection_start?: number | null
          selection_text?: string | null
          status?: string
          updated_at?: string
          workflow_instance_id?: string | null
          workflow_step_id?: string | null
        }
        Update: {
          author_role_id?: string | null
          author_user_id?: string
          body?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          field_key?: string
          id?: string
          is_blocking?: boolean
          parent_comment_id?: string | null
          regulator_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          selection_end?: number | null
          selection_start?: number | null
          selection_text?: string | null
          status?: string
          updated_at?: string
          workflow_instance_id?: string | null
          workflow_step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "review_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      review_narrative_fields: {
        Row: {
          column_name: string
          created_at: string
          entity_type: string
          field_key: string
          table_name: string
        }
        Insert: {
          column_name: string
          created_at?: string
          entity_type: string
          field_key: string
          table_name: string
        }
        Update: {
          column_name?: string
          created_at?: string
          entity_type?: string
          field_key?: string
          table_name?: string
        }
        Relationships: []
      }
      review_role_display_settings: {
        Row: {
          color: string
          created_at: string
          id: string
          regulator_id: string | null
          role_id: string
          show_reviewer_name: boolean
          show_role_name: boolean
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          regulator_id?: string | null
          role_id: string
          show_reviewer_name?: boolean
          show_role_name?: boolean
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          regulator_id?: string | null
          role_id?: string
          show_reviewer_name?: boolean
          show_role_name?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      review_step_permissions: {
        Row: {
          block_approval_on_unresolved_blocking: boolean
          can_accept: boolean
          can_comment: boolean
          can_mark_blocking: boolean
          can_reject: boolean
          can_reply: boolean
          can_resolve: boolean
          can_suggest: boolean
          can_view: boolean
          created_at: string
          enabled: boolean
          id: string
          role_id: string
          step_id: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          block_approval_on_unresolved_blocking?: boolean
          can_accept?: boolean
          can_comment?: boolean
          can_mark_blocking?: boolean
          can_reject?: boolean
          can_reply?: boolean
          can_resolve?: boolean
          can_suggest?: boolean
          can_view?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          role_id: string
          step_id: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          block_approval_on_unresolved_blocking?: boolean
          can_accept?: boolean
          can_comment?: boolean
          can_mark_blocking?: boolean
          can_reject?: boolean
          can_reply?: boolean
          can_resolve?: boolean
          can_suggest?: boolean
          can_view?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          role_id?: string
          step_id?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: []
      }
      review_suggestions: {
        Row: {
          author_role_id: string | null
          author_user_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          entity_id: string
          entity_type: string
          field_key: string
          id: string
          original_text: string | null
          regulator_id: string | null
          selection_end: number | null
          selection_start: number | null
          status: string
          suggested_text: string | null
          type: string
          updated_at: string
          workflow_instance_id: string | null
          workflow_step_id: string | null
        }
        Insert: {
          author_role_id?: string | null
          author_user_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          entity_id: string
          entity_type: string
          field_key: string
          id?: string
          original_text?: string | null
          regulator_id?: string | null
          selection_end?: number | null
          selection_start?: number | null
          status?: string
          suggested_text?: string | null
          type: string
          updated_at?: string
          workflow_instance_id?: string | null
          workflow_step_id?: string | null
        }
        Update: {
          author_role_id?: string | null
          author_user_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          entity_id?: string
          entity_type?: string
          field_key?: string
          id?: string
          original_text?: string | null
          regulator_id?: string | null
          selection_end?: number | null
          selection_start?: number | null
          status?: string
          suggested_text?: string | null
          type?: string
          updated_at?: string
          workflow_instance_id?: string | null
          workflow_step_id?: string | null
        }
        Relationships: []
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
          {
            foreignKeyName: "risk_ratings_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
        ]
      }
      risk_score_weights: {
        Row: {
          band_thresholds: Json
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          weights: Json
        }
        Insert: {
          band_thresholds?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          weights?: Json
        }
        Update: {
          band_thresholds?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          weights?: Json
        }
        Relationships: []
      }
      role_migration_log: {
        Row: {
          classified_category: string | null
          created_at: string
          custom_reason: string | null
          id: string
          is_custom: boolean
          matched_template: string | null
          per_module_levels: Json
          role_id: string
          run_by: string | null
          sensitive_actions: Json
        }
        Insert: {
          classified_category?: string | null
          created_at?: string
          custom_reason?: string | null
          id?: string
          is_custom?: boolean
          matched_template?: string | null
          per_module_levels?: Json
          role_id: string
          run_by?: string | null
          sensitive_actions?: Json
        }
        Update: {
          classified_category?: string | null
          created_at?: string
          custom_reason?: string | null
          id?: string
          is_custom?: boolean
          matched_template?: string | null
          per_module_levels?: Json
          role_id?: string
          run_by?: string | null
          sensitive_actions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "role_migration_log_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
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
          access_summary: Json
          created_at: string
          dashboard_tier: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          role_category: string | null
          role_type: string
          scope_config: Json
          status: string
          system_role: string
          updated_at: string
        }
        Insert: {
          access_summary?: Json
          created_at?: string
          dashboard_tier?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          role_category?: string | null
          role_type?: string
          scope_config?: Json
          status?: string
          system_role?: string
          updated_at?: string
        }
        Update: {
          access_summary?: Json
          created_at?: string
          dashboard_tier?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          role_category?: string | null
          role_type?: string
          scope_config?: Json
          status?: string
          system_role?: string
          updated_at?: string
        }
        Relationships: []
      }
      rule_overrides: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          module: string
          original_value: Json | null
          overridden_value: Json | null
          reason: string
          rule_key: string
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          module: string
          original_value?: Json | null
          overridden_value?: Json | null
          reason: string
          rule_key: string
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          module?: string
          original_value?: Json | null
          overridden_value?: Json | null
          reason?: string
          rule_key?: string
          user_id?: string | null
          user_role?: string | null
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
      security_event_logs: {
        Row: {
          actor_role: string | null
          created_at: string
          detail: Json | null
          event_time: string
          event_type: Database["public"]["Enums"]["security_event_type"]
          id: string
          ip_address: unknown
          metadata: Json | null
          target_resource: string | null
          user_agent: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          actor_role?: string | null
          created_at?: string
          detail?: Json | null
          event_time?: string
          event_type: Database["public"]["Enums"]["security_event_type"]
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          target_resource?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          actor_role?: string | null
          created_at?: string
          detail?: Json | null
          event_time?: string
          event_type?: Database["public"]["Enums"]["security_event_type"]
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          target_resource?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_role?: string | null
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
      sla_configurations: {
        Row: {
          active: boolean
          calendar_profile_id: string | null
          created_at: string
          created_by: string | null
          escalation_recipient: string | null
          id: string
          pause_conditions: string | null
          process_type: string
          sla_duration: number
          sla_unit: string
          stage_name: string
          updated_at: string
          updated_by: string | null
          warning_threshold_pct: number
        }
        Insert: {
          active?: boolean
          calendar_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          escalation_recipient?: string | null
          id?: string
          pause_conditions?: string | null
          process_type: string
          sla_duration: number
          sla_unit?: string
          stage_name: string
          updated_at?: string
          updated_by?: string | null
          warning_threshold_pct?: number
        }
        Update: {
          active?: boolean
          calendar_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          escalation_recipient?: string | null
          id?: string
          pause_conditions?: string | null
          process_type?: string
          sla_duration?: number
          sla_unit?: string
          stage_name?: string
          updated_at?: string
          updated_by?: string | null
          warning_threshold_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "sla_configurations_calendar_profile_id_fkey"
            columns: ["calendar_profile_id"]
            isOneToOne: false
            referencedRelation: "business_calendar_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_escalation_dispatches: {
        Row: {
          dispatched_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          overdue_by_seconds: number | null
          process_type: string
          recipients: string | null
          sla_deadline: string | null
          tier: number
          workflow_instance_id: string
        }
        Insert: {
          dispatched_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          overdue_by_seconds?: number | null
          process_type: string
          recipients?: string | null
          sla_deadline?: string | null
          tier: number
          workflow_instance_id: string
        }
        Update: {
          dispatched_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          overdue_by_seconds?: number | null
          process_type?: string
          recipients?: string | null
          sla_deadline?: string | null
          tier?: number
          workflow_instance_id?: string
        }
        Relationships: []
      }
      sla_escalation_tiers: {
        Row: {
          created_at: string
          created_by: string | null
          delay_days: number
          id: string
          notify_roles: string | null
          process_type: string
          recipients: string
          tier: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delay_days?: number
          id?: string
          notify_roles?: string | null
          process_type: string
          recipients: string
          tier: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delay_days?: number
          id?: string
          notify_roles?: string | null
          process_type?: string
          recipients?: string
          tier?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sla_process_team_leads: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          process_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          process_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          process_type?: string
          user_id?: string
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
      sufficiency_evaluation_results: {
        Row: {
          auto_rfi_item_id: string | null
          created_at: string
          detail: Json
          evaluation_id: string
          id: string
          rule_id: string | null
          rule_snapshot: Json
          severity: string
          status: string
        }
        Insert: {
          auto_rfi_item_id?: string | null
          created_at?: string
          detail?: Json
          evaluation_id: string
          id?: string
          rule_id?: string | null
          rule_snapshot?: Json
          severity: string
          status: string
        }
        Update: {
          auto_rfi_item_id?: string | null
          created_at?: string
          detail?: Json
          evaluation_id?: string
          id?: string
          rule_id?: string | null
          rule_snapshot?: Json
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sufficiency_evaluation_results_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "sufficiency_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sufficiency_evaluation_results_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "sufficiency_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      sufficiency_evaluations: {
        Row: {
          application_id: string
          blocker_count: number
          created_at: string
          evaluated_at: string
          evaluated_by: string | null
          id: string
          overall_status: string
          pass_count: number
          rule_set_id: string | null
          snapshot: Json
          triggered_by: string
          warning_count: number
        }
        Insert: {
          application_id: string
          blocker_count?: number
          created_at?: string
          evaluated_at?: string
          evaluated_by?: string | null
          id?: string
          overall_status: string
          pass_count?: number
          rule_set_id?: string | null
          snapshot?: Json
          triggered_by?: string
          warning_count?: number
        }
        Update: {
          application_id?: string
          blocker_count?: number
          created_at?: string
          evaluated_at?: string
          evaluated_by?: string | null
          id?: string
          overall_status?: string
          pass_count?: number
          rule_set_id?: string | null
          snapshot?: Json
          triggered_by?: string
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "sufficiency_evaluations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sufficiency_evaluations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "report_view_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sufficiency_evaluations_rule_set_id_fkey"
            columns: ["rule_set_id"]
            isOneToOne: false
            referencedRelation: "sufficiency_rule_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      sufficiency_overrides: {
        Row: {
          created_at: string
          evaluation_result_id: string
          id: string
          overridden_by: string
          reason: string
        }
        Insert: {
          created_at?: string
          evaluation_result_id: string
          id?: string
          overridden_by: string
          reason: string
        }
        Update: {
          created_at?: string
          evaluation_result_id?: string
          id?: string
          overridden_by?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "sufficiency_overrides_evaluation_result_id_fkey"
            columns: ["evaluation_result_id"]
            isOneToOne: false
            referencedRelation: "sufficiency_evaluation_results"
            referencedColumns: ["id"]
          },
        ]
      }
      sufficiency_rule_set_items: {
        Row: {
          created_at: string
          id: string
          ordinal: number
          rule_id: string
          rule_set_id: string
          severity_override: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ordinal?: number
          rule_id: string
          rule_set_id: string
          severity_override?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ordinal?: number
          rule_id?: string
          rule_set_id?: string
          severity_override?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sufficiency_rule_set_items_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "sufficiency_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sufficiency_rule_set_items_rule_set_id_fkey"
            columns: ["rule_set_id"]
            isOneToOne: false
            referencedRelation: "sufficiency_rule_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      sufficiency_rule_sets: {
        Row: {
          application_type: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          license_type: string | null
          name: string
          priority: number
          sector_id: string | null
          sub_sector_id: string | null
          updated_at: string
        }
        Insert: {
          application_type?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          license_type?: string | null
          name: string
          priority?: number
          sector_id?: string | null
          sub_sector_id?: string | null
          updated_at?: string
        }
        Update: {
          application_type?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          license_type?: string | null
          name?: string
          priority?: number
          sector_id?: string | null
          sub_sector_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sufficiency_rules: {
        Row: {
          auto_rfi: boolean
          code: string
          config: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          rfi_prompt_template: string | null
          rfi_question_type: string | null
          rule_type: string
          severity: string
          updated_at: string
        }
        Insert: {
          auto_rfi?: boolean
          code: string
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          rfi_prompt_template?: string | null
          rfi_question_type?: string | null
          rule_type: string
          severity?: string
          updated_at?: string
        }
        Update: {
          auto_rfi?: boolean
          code?: string
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          rfi_prompt_template?: string | null
          rfi_question_type?: string | null
          rule_type?: string
          severity?: string
          updated_at?: string
        }
        Relationships: []
      }
      supervisory_plan_actions: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          due_date: string
          extension_reason: string | null
          id: string
          owner_role: string | null
          plan_id: string
          previous_due_date: string | null
          reassigned_at: string | null
          reassigned_by: string | null
          reassigned_from: string | null
          source: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date: string
          extension_reason?: string | null
          id?: string
          owner_role?: string | null
          plan_id: string
          previous_due_date?: string | null
          reassigned_at?: string | null
          reassigned_by?: string | null
          reassigned_from?: string | null
          source?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string
          extension_reason?: string | null
          id?: string
          owner_role?: string | null
          plan_id?: string
          previous_due_date?: string | null
          reassigned_at?: string | null
          reassigned_by?: string | null
          reassigned_from?: string | null
          source?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supervisory_plan_actions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "supervisory_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      supervisory_plan_template_actions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          offset_days: number
          owner_role: string | null
          sort_order: number
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          offset_days?: number
          owner_role?: string | null
          sort_order?: number
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          offset_days?: number
          owner_role?: string | null
          sort_order?: number
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supervisory_plan_template_actions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "supervisory_plan_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      supervisory_plan_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          sector_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sector_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sector_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supervisory_plan_templates_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      supervisory_plans: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          created_from: string
          entity_id: string
          id: string
          license_id: string | null
          notes: string | null
          risk_rating_id: string | null
          status: string
          submitted_for_review_at: string | null
          submitted_for_review_by: string | null
          updated_at: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          created_from?: string
          entity_id: string
          id?: string
          license_id?: string | null
          notes?: string | null
          risk_rating_id?: string | null
          status?: string
          submitted_for_review_at?: string | null
          submitted_for_review_by?: string | null
          updated_at?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          created_from?: string
          entity_id?: string
          id?: string
          license_id?: string | null
          notes?: string | null
          risk_rating_id?: string | null
          status?: string
          submitted_for_review_at?: string | null
          submitted_for_review_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supervisory_plans_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisory_plans_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
          {
            foreignKeyName: "supervisory_plans_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisory_plans_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "report_view_licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisory_plans_risk_rating_id_fkey"
            columns: ["risk_rating_id"]
            isOneToOne: false
            referencedRelation: "risk_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      thematic_review_actions: {
        Row: {
          action_type: string
          assigned_team: string | null
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          evidence_of_completion: string | null
          finding_id: string | null
          id: string
          licensee_id: string | null
          review_id: string
          status: string
          title: string
          updated_at: string
          waiver_override_id: string | null
        }
        Insert: {
          action_type?: string
          assigned_team?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          evidence_of_completion?: string | null
          finding_id?: string | null
          id?: string
          licensee_id?: string | null
          review_id: string
          status?: string
          title: string
          updated_at?: string
          waiver_override_id?: string | null
        }
        Update: {
          action_type?: string
          assigned_team?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          evidence_of_completion?: string | null
          finding_id?: string | null
          id?: string
          licensee_id?: string | null
          review_id?: string
          status?: string
          title?: string
          updated_at?: string
          waiver_override_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "thematic_review_actions_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "thematic_review_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thematic_review_actions_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thematic_review_actions_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
          {
            foreignKeyName: "thematic_review_actions_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "thematic_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thematic_review_actions_waiver_override_id_fkey"
            columns: ["waiver_override_id"]
            isOneToOne: false
            referencedRelation: "rule_overrides"
            referencedColumns: ["id"]
          },
        ]
      }
      thematic_review_entities: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          inclusion_reason: string | null
          licensee_id: string
          review_id: string
          sample_weight: number | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          inclusion_reason?: string | null
          licensee_id: string
          review_id: string
          sample_weight?: number | null
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          inclusion_reason?: string | null
          licensee_id?: string
          review_id?: string
          sample_weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "thematic_review_entities_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thematic_review_entities_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
          {
            foreignKeyName: "thematic_review_entities_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "thematic_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      thematic_review_evidence: {
        Row: {
          collected_at: string
          collected_by: string | null
          file_upload_id: string | null
          finding_id: string | null
          id: string
          notes: string | null
          review_id: string
          source_ref: string | null
          source_type: string
        }
        Insert: {
          collected_at?: string
          collected_by?: string | null
          file_upload_id?: string | null
          finding_id?: string | null
          id?: string
          notes?: string | null
          review_id: string
          source_ref?: string | null
          source_type?: string
        }
        Update: {
          collected_at?: string
          collected_by?: string | null
          file_upload_id?: string | null
          finding_id?: string | null
          id?: string
          notes?: string | null
          review_id?: string
          source_ref?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "thematic_review_evidence_file_upload_id_fkey"
            columns: ["file_upload_id"]
            isOneToOne: false
            referencedRelation: "file_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thematic_review_evidence_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "thematic_review_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thematic_review_evidence_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "thematic_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      thematic_review_findings: {
        Row: {
          created_at: string
          created_by: string | null
          detail: string | null
          evidence_summary: string | null
          id: string
          issued_at: string | null
          issued_by: string | null
          licensee_id: string | null
          review_id: string
          root_cause: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          detail?: string | null
          evidence_summary?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          licensee_id?: string | null
          review_id: string
          root_cause?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          detail?: string | null
          evidence_summary?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          licensee_id?: string | null
          review_id?: string
          root_cause?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "thematic_review_findings_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thematic_review_findings_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
          },
          {
            foreignKeyName: "thematic_review_findings_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "thematic_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      thematic_review_products: {
        Row: {
          channel_id: string | null
          created_at: string
          id: string
          notes: string | null
          product_id: string
          review_id: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          review_id: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thematic_review_products_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "conduct_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thematic_review_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "conduct_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thematic_review_products_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "thematic_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      thematic_review_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: string | null
          id: string
          metadata: Json
          override_id: string | null
          reason: string | null
          review_id: string
          to_status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          metadata?: Json
          override_id?: string | null
          reason?: string | null
          review_id: string
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          metadata?: Json
          override_id?: string | null
          reason?: string | null
          review_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "thematic_review_status_history_override_id_fkey"
            columns: ["override_id"]
            isOneToOne: false
            referencedRelation: "rule_overrides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thematic_review_status_history_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "thematic_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      thematic_reviews: {
        Row: {
          closed_at: string | null
          closure_summary: string | null
          code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          hypothesis: string | null
          id: string
          lead_officer_id: string | null
          methodology: Json
          opened_at: string | null
          regulator_id: string | null
          risk_category_id: string | null
          scope_end: string | null
          scope_start: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closure_summary?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          hypothesis?: string | null
          id?: string
          lead_officer_id?: string | null
          methodology?: Json
          opened_at?: string | null
          regulator_id?: string | null
          risk_category_id?: string | null
          scope_end?: string | null
          scope_start?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closure_summary?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          hypothesis?: string | null
          id?: string
          lead_officer_id?: string | null
          methodology?: Json
          opened_at?: string | null
          regulator_id?: string | null
          risk_category_id?: string | null
          scope_end?: string | null
          scope_start?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "thematic_reviews_risk_category_id_fkey"
            columns: ["risk_category_id"]
            isOneToOne: false
            referencedRelation: "conduct_risk_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      twinpeaks_clearances: {
        Row: {
          application_id: string
          conditions: string[]
          created_at: string
          id: string
          rationale: string | null
          recorded_at: string | null
          recorded_by: string | null
          regulator_role: string
          status: string
          updated_at: string
        }
        Insert: {
          application_id: string
          conditions?: string[]
          created_at?: string
          id?: string
          rationale?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          regulator_role: string
          status?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          conditions?: string[]
          created_at?: string
          id?: string
          rationale?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          regulator_role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "twinpeaks_clearances_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "twinpeaks_clearances_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "report_view_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      twinpeaks_disagreements: {
        Row: {
          application_id: string
          created_at: string
          description: string
          id: string
          raised_at: string
          raised_by: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          application_id: string
          created_at?: string
          description: string
          id?: string
          raised_at?: string
          raised_by?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          description?: string
          id?: string
          raised_at?: string
          raised_by?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "twinpeaks_disagreements_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "twinpeaks_disagreements_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "report_view_applications"
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
          assigned_role: string | null
          assigned_user_id: string | null
          completed_at: string | null
          created_at: string
          current_step_id: string | null
          current_step_key: string | null
          due_at: string | null
          entity_id: string
          entity_type: string
          id: string
          paused_at: string | null
          paused_reason: string | null
          resumed_at: string | null
          sla_status: string
          started_at: string
          status: string
          total_pause_seconds: number
          updated_at: string
          version_snapshot: Json | null
          workflow_id: string
          workflow_version_id: string | null
        }
        Insert: {
          assigned_role?: string | null
          assigned_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_step_id?: string | null
          current_step_key?: string | null
          due_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          paused_at?: string | null
          paused_reason?: string | null
          resumed_at?: string | null
          sla_status?: string
          started_at?: string
          status?: string
          total_pause_seconds?: number
          updated_at?: string
          version_snapshot?: Json | null
          workflow_id: string
          workflow_version_id?: string | null
        }
        Update: {
          assigned_role?: string | null
          assigned_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_step_id?: string | null
          current_step_key?: string | null
          due_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          paused_at?: string | null
          paused_reason?: string | null
          resumed_at?: string | null
          sla_status?: string
          started_at?: string
          status?: string
          total_pause_seconds?: number
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
      audit_timeline: {
        Row: {
          action: string | null
          actor_role: string | null
          after_value: Json | null
          before_value: Json | null
          id: string | null
          ip_address: string | null
          justification: string | null
          metadata: Json | null
          object_id: string | null
          object_type: string | null
          occurred_at: string | null
          source: string | null
          user_agent: string | null
          user_id: string | null
        }
        Relationships: []
      }
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
          sla_days: number | null
          sla_due_at: string | null
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
          {
            foreignKeyName: "complaints_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "complaint_status_catalogue"
            referencedColumns: ["code"]
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
          {
            foreignKeyName: "profiles_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
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
          {
            foreignKeyName: "profiles_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "v_prudential_early_warnings"
            referencedColumns: ["licensee_id"]
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
      v_prudential_early_warnings: {
        Row: {
          current_value: number | null
          delta_pct: number | null
          last_seen: string | null
          licensee_id: string | null
          licensee_name: string | null
          previous_value: number | null
          ratio_key: string | null
          recent_breach_count: number | null
          regulator_id: string | null
          sector_id: string | null
          warning_level: string | null
        }
        Relationships: [
          {
            foreignKeyName: "returns_filed_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sectors_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
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
      _assert_complaint_fresh: {
        Args: { _expected: string; _id: string }
        Returns: undefined
      }
      _assert_review_action: {
        Args: {
          _action: string
          _entity_id: string
          _entity_type: string
          _role_id: string
          _step_id: string
          _user_id: string
        }
        Returns: undefined
      }
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
      accept_review_suggestion: {
        Args: { _suggestion_id: string }
        Returns: {
          author_role_id: string | null
          author_user_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          entity_id: string
          entity_type: string
          field_key: string
          id: string
          original_text: string | null
          regulator_id: string | null
          selection_end: number | null
          selection_start: number | null
          status: string
          suggested_text: string | null
          type: string
          updated_at: string
          workflow_instance_id: string | null
          workflow_step_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "review_suggestions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      activate_form_version_as_current: {
        Args: { _activation_date?: string; _version_id: string }
        Returns: Json
      }
      add_review_comment: {
        Args: {
          _body: string
          _entity_id: string
          _entity_type: string
          _field_key: string
          _is_blocking?: boolean
          _parent_comment_id?: string
          _role_id?: string
          _selection?: Json
        }
        Returns: {
          author_role_id: string | null
          author_user_id: string
          body: string
          created_at: string
          entity_id: string
          entity_type: string
          field_key: string
          id: string
          is_blocking: boolean
          parent_comment_id: string | null
          regulator_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          selection_end: number | null
          selection_start: number | null
          selection_text: string | null
          status: string
          updated_at: string
          workflow_instance_id: string | null
          workflow_step_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "review_comments"
          isOneToOne: true
          isSetofReturn: false
        }
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
      archive_prudential_ratio: {
        Args: { _ratio_id: string }
        Returns: undefined
      }
      archive_prudential_threshold: {
        Args: { _threshold_id: string }
        Returns: undefined
      }
      archive_validation_rule: {
        Args: { _rule_id: string }
        Returns: undefined
      }
      assert_role_management_action: {
        Args: { _action: string }
        Returns: undefined
      }
      assign_complaint:
        | {
            Args: {
              _assignee: string
              _expected_updated_at?: string
              _id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _id: string
              _investigator?: string
              _reason?: string
              _team?: string
            }
            Returns: {
              acknowledged_at: string | null
              assigned_team: string | null
              channel_id: string | null
              closed_at: string | null
              closed_by: string | null
              closure_category: string | null
              closure_reason: string | null
              complainant_id: string | null
              complaint_number: string
              complaint_type_id: string | null
              conduct_risk_category_id: string | null
              created_at: string
              customer_type: string | null
              description: string
              email: string | null
              enforcement_action_id: string | null
              findings: string | null
              id: string
              idempotency_key: string | null
              intake_source: string | null
              internal_created_by: string | null
              investigation_notes: string | null
              investigator_id: string | null
              license_holder_id: string | null
              licensee_id: string | null
              parent_complaint_id: string | null
              priority: string | null
              product_id: string | null
              regulator_id: string | null
              repeat_complaint_count: number
              resolution: string | null
              resolution_notes: string | null
              resolved_at: string | null
              search_vector: unknown
              severity: string
              severity_overridden_at: string | null
              severity_overridden_by: string | null
              severity_override_reason: string | null
              sla_days: number | null
              sla_due_at: string | null
              status: string
              subject: string
              triage_evaluated_at: string | null
              triage_last_error: string | null
              triage_original_values: Json | null
              triage_override_status: string
              triage_result_snapshot: Json | null
              triage_rule_id: string | null
              triage_source: string | null
              updated_at: string
              vulnerability_category: string | null
              vulnerability_indicator: boolean
              vulnerability_notes: string | null
              vulnerability_review_state: Database["public"]["Enums"]["complaint_vulnerability_review_state"]
            }
            SetofOptions: {
              from: "*"
              to: "complaints"
              isOneToOne: true
              isSetofReturn: false
            }
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
      bootstrap_supervisory_profile: {
        Args: { _license_id: string }
        Returns: string
      }
      build_workflow_snapshot: { Args: { _workflow_id: string }; Returns: Json }
      can_access_review_entity: {
        Args: { _entity_id: string; _entity_type: string; _user_id: string }
        Returns: boolean
      }
      can_act_on_approval: { Args: { _user: string }; Returns: boolean }
      can_act_on_enforcement: {
        Args: { _action: string; _user_id: string }
        Returns: boolean
      }
      can_act_on_fp: { Args: { _user: string }; Returns: boolean }
      can_act_on_inspection: {
        Args: { _action: string; _user_id: string }
        Returns: boolean
      }
      can_act_on_prudential: { Args: { _user: string }; Returns: boolean }
      can_current_user_access_licensee: {
        Args: { target_licensee_id: string; target_sector_id?: string }
        Returns: boolean
      }
      can_manage_fp_config: { Args: { _user: string }; Returns: boolean }
      can_manage_prudential_config: {
        Args: { _user: string }
        Returns: boolean
      }
      can_mutate_application: {
        Args: { _application_id: string; _user: string }
        Returns: boolean
      }
      can_mutate_approval_config: { Args: { _user: string }; Returns: boolean }
      can_mutate_compliance_return: {
        Args: { _return_id: string; _user: string }
        Returns: boolean
      }
      can_mutate_license: {
        Args: { _license_id: string; _user: string }
        Returns: boolean
      }
      can_mutate_licensee: {
        Args: { _licensee_id: string; _user: string }
        Returns: boolean
      }
      can_mutate_return_filed: {
        Args: { _return_id: string; _user_id: string }
        Returns: boolean
      }
      can_read_application: {
        Args: { _application_id: string; _user: string }
        Returns: boolean
      }
      can_read_approval_config: { Args: { _user: string }; Returns: boolean }
      can_read_compliance_return: {
        Args: { _return_id: string; _user: string }
        Returns: boolean
      }
      can_read_enforcement: {
        Args: { _entity_id: string; _user_id: string }
        Returns: boolean
      }
      can_read_fp_assessment: {
        Args: { _assessment_id: string; _user: string }
        Returns: boolean
      }
      can_read_fp_individual: {
        Args: { _individual_id: string; _user: string }
        Returns: boolean
      }
      can_read_fp_licensee: {
        Args: { _licensee_id: string; _user: string }
        Returns: boolean
      }
      can_read_inspection: {
        Args: { _entity_id: string; _user_id: string }
        Returns: boolean
      }
      can_read_license: {
        Args: { _license_id: string; _user: string }
        Returns: boolean
      }
      can_read_license_appeal: {
        Args: { _appeal_id: string; _user_id: string }
        Returns: boolean
      }
      can_read_licensee: {
        Args: { _licensee_id: string; _user: string }
        Returns: boolean
      }
      can_read_prudential_entity: {
        Args: { _entity_id: string; _user: string }
        Returns: boolean
      }
      can_read_return_filed: {
        Args: { _return_id: string; _user_id: string }
        Returns: boolean
      }
      can_read_return_filed_row: {
        Args: {
          _created_by: string
          _entity_id: string
          _on_behalf_of_licensee_id: string
          _return_id: string
          _user_id: string
        }
        Returns: boolean
      }
      can_read_workflow_instance: {
        Args: { _entity_id: string; _user: string }
        Returns: boolean
      }
      can_review_action: {
        Args: { _action: string; _role_id: string; _step_id: string }
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
      can_view_application_legal_notes: {
        Args: { _application_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_entity_returns:
        | { Args: { _licensee_id: string; _user_id: string }; Returns: boolean }
        | {
            Args: {
              _licensee_id: string
              _status: string
              _user_id: string
              _workflow_status: string
            }
            Returns: boolean
          }
      can_view_return_filed: {
        Args: { _return_id: string; _user_id: string }
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
      check_approval_blocked: {
        Args: { _entity_id: string; _entity_type: string; _step_id: string }
        Returns: Json
      }
      check_coordination_gates: {
        Args: { _subject_id: string; _subject_type: string }
        Returns: Json
      }
      check_decision_gates: {
        Args: { _application_id: string; _license_id: string }
        Returns: Json
      }
      check_primary_user_email_exists: {
        Args: { p_email: string }
        Returns: boolean
      }
      claim_notification_outbox: {
        Args: { _limit?: number; _worker?: string }
        Returns: {
          action_history_id: string | null
          body: string | null
          channel: string
          claimed_at: string | null
          claimed_by: string | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          event_key: string
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          recipient_email: string | null
          recipient_user_id: string | null
          retry_count: number
          sent_at: string | null
          status: string
          subject: string | null
          template_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      classify_complaint: {
        Args: { _id: string; _payload: Json }
        Returns: undefined
      }
      classify_ratio_risk: {
        Args: {
          _breach: number
          _comparator: string
          _value: number
          _warn: number
        }
        Returns: string
      }
      cleanup_orphaned_complaint_evidence: {
        Args: { _older_than?: string }
        Returns: {
          bucket_name: string
          deleted_evidence_id: string
          file_path: string
          file_upload_id: string
        }[]
      }
      clone_validation_rule: {
        Args: { _new_name: string; _rule_id: string }
        Returns: string
      }
      close_application: {
        Args: { _application_id: string; _reason?: string }
        Returns: {
          ack_at: string | null
          ack_by: string | null
          ack_text: string | null
          applicant_id: string
          application_number: string
          approved_at: string | null
          assessment_notes: string | null
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          cancelled_at: string | null
          created_at: string
          current_step_id: string | null
          data: Json | null
          decision_rationale: string | null
          form_version_id: string | null
          id: string
          last_sufficiency_evaluation_id: string | null
          license_type: string
          priority: number
          priority_reason: string | null
          priority_set_at: string | null
          priority_set_by: string | null
          regulator_id: string | null
          rejected_at: string | null
          review_notes: string | null
          search_vector: unknown
          status: string
          submitted_at: string | null
          sufficiency_status: string | null
          updated_at: string
          workflow_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      close_complaint:
        | {
            Args: { _category?: string; _id: string; _reason: string }
            Returns: undefined
          }
        | {
            Args: {
              _category?: string
              _expected_updated_at?: string
              _id: string
              _reason: string
            }
            Returns: undefined
          }
      complaint_sla_status: {
        Args: {
          _created_at: string
          _resolved_at: string
          _sla_days: number
          _sla_due_at: string
        }
        Returns: string
      }
      complaints_analytics: { Args: { _filters?: Json }; Returns: Json }
      complaints_dashboard_counts: { Args: { _scope?: Json }; Returns: Json }
      complete_or_get_application_payment: {
        Args: { _amount?: number; _application_id: string }
        Returns: Json
      }
      complete_vulnerability_review: {
        Args: {
          _category?: string
          _complaint_id: string
          _decision: string
          _notes?: string
        }
        Returns: undefined
      }
      conduct_entity_audit_history: {
        Args: { _entity_id: string }
        Returns: {
          action_type: string
          actor_id: string
          after_value: Json
          before_value: Json
          justification: string
          logged_at: string
          object_id: string
          object_type: string
        }[]
      }
      conduct_entity_profile_summary: {
        Args: { _entity_id: string }
        Returns: Json
      }
      configure_application_form: {
        Args: { _config: Json; _form_config_id: string }
        Returns: {
          category_id: string | null
          created_at: string
          data_protection_url: string | null
          declarations: Json
          document_types: Json
          form_schema: Json
          form_schema_backup: Json | null
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
        SetofOptions: {
          from: "*"
          to: "registration_form_configs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_complaint_duplicate: {
        Args: { _notes?: string; _pair_id: string; _parent_id: string }
        Returns: Json
      }
      copy_review_step_permissions: {
        Args: { _from_step: string; _to_step: string }
        Returns: number
      }
      create_application_draft: {
        Args: { _data?: Json; _license_type: string; _regulator_id?: string }
        Returns: {
          ack_at: string | null
          ack_by: string | null
          ack_text: string | null
          applicant_id: string
          application_number: string
          approved_at: string | null
          assessment_notes: string | null
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          cancelled_at: string | null
          created_at: string
          current_step_id: string | null
          data: Json | null
          decision_rationale: string | null
          form_version_id: string | null
          id: string
          last_sufficiency_evaluation_id: string | null
          license_type: string
          priority: number
          priority_reason: string | null
          priority_set_at: string | null
          priority_set_by: string | null
          regulator_id: string | null
          rejected_at: string | null
          review_notes: string | null
          search_vector: unknown
          status: string
          submitted_at: string | null
          sufficiency_status: string | null
          updated_at: string
          workflow_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "applications"
          isOneToOne: true
          isSetofReturn: false
        }
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
      create_complaint:
        | { Args: { _payload: Json }; Returns: Json }
        | { Args: { _payload: Json; _variant: string }; Returns: Json }
      create_complaint_with_attachments: {
        Args: {
          _idempotency_key?: string
          _payload: Json
          _staged_upload_ids?: string[]
          _variant: string
        }
        Returns: Json
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
      create_document_version_metadata: {
        Args: {
          _bucket: string
          _change_note?: string
          _checksum: string
          _document_label: string
          _document_type: string
          _entity_id: string
          _entity_type: string
          _extension: string
          _field_id: string
          _file_size: number
          _file_upload_id: string
          _form_id: string
          _group_id?: string
          _metadata?: Json
          _mime_type: string
          _original_file_name: string
          _safe_file_name: string
          _storage_path: string
          _submission_id: string
        }
        Returns: {
          current_version_id: string
          document_upload_id: string
          document_version_id: string
          version_number: number
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
      create_review_suggestion: {
        Args: {
          _entity_id: string
          _entity_type: string
          _field_key: string
          _original_text: string
          _role_id?: string
          _selection: Json
          _suggested_text: string
          _type: string
        }
        Returns: {
          author_role_id: string | null
          author_user_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          entity_id: string
          entity_type: string
          field_key: string
          id: string
          original_text: string | null
          regulator_id: string | null
          selection_end: number | null
          selection_start: number | null
          status: string
          suggested_text: string | null
          type: string
          updated_at: string
          workflow_instance_id: string | null
          workflow_step_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "review_suggestions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_workflow_step_for: {
        Args: { _entity_id: string; _entity_type: string }
        Returns: {
          instance_id: string
          regulator_id: string
          step_id: string
          workflow_id: string
        }[]
      }
      decide_duplicate_pair: {
        Args: { _action: string; _id: string }
        Returns: undefined
      }
      decide_escalation_case: {
        Args: { _decision: string; _id: string; _notes?: string }
        Returns: undefined
      }
      decide_return_edit_request: {
        Args: { _comment: string; _decision: string; _request_id: string }
        Returns: Json
      }
      delete_ppoc_mapping: { Args: { _mapping_id: string }; Returns: Json }
      detect_complaint_duplicates: {
        Args: { _complaint_id?: string; _window_days?: number }
        Returns: Json
      }
      dismiss_complaint_duplicate: {
        Args: { _pair_id: string; _reason?: string }
        Returns: Json
      }
      dismiss_complaint_escalation: {
        Args: { _case_id: string; _reason?: string }
        Returns: Json
      }
      duplicate_hub_stats: { Args: never; Returns: Json }
      enforce_action: {
        Args: { _action: string; _meta?: Json; _module: string }
        Returns: undefined
      }
      enforce_permission: {
        Args: { _action: string; _module: string }
        Returns: undefined
      }
      enforce_scoped_permission: {
        Args: {
          _action: string
          _holder?: string
          _module: string
          _region?: string
          _sector?: string
        }
        Returns: undefined
      }
      enforce_workflow_transition: {
        Args: {
          _action: string
          _from_state?: string
          _meta?: Json
          _module: string
          _record_id: string
          _submitter_id?: string
          _to_state?: string
        }
        Returns: undefined
      }
      escalate_application: {
        Args: { _application_id: string; _reason?: string }
        Returns: {
          ack_at: string | null
          ack_by: string | null
          ack_text: string | null
          applicant_id: string
          application_number: string
          approved_at: string | null
          assessment_notes: string | null
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          cancelled_at: string | null
          created_at: string
          current_step_id: string | null
          data: Json | null
          decision_rationale: string | null
          form_version_id: string | null
          id: string
          last_sufficiency_evaluation_id: string | null
          license_type: string
          priority: number
          priority_reason: string | null
          priority_set_at: string | null
          priority_set_by: string | null
          regulator_id: string | null
          rejected_at: string | null
          review_notes: string | null
          search_vector: unknown
          status: string
          submitted_at: string | null
          sufficiency_status: string | null
          updated_at: string
          workflow_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      escalate_complaint_to_enforcement: {
        Args: { _findings: string; _id: string }
        Returns: {
          case_number: string
          complaint_id: string
          enforcement_id: string
        }[]
      }
      escalation_hub_stats: { Args: never; Returns: Json }
      evaluate_all_complaint_escalations: {
        Args: never
        Returns: {
          escalated: number
          scanned: number
        }[]
      }
      evaluate_complaint_escalations: {
        Args: { _complaint_id: string }
        Returns: number
      }
      evaluate_complaint_escalations_v2: {
        Args: { _complaint_id: string }
        Returns: number
      }
      evaluate_complaint_vulnerability_escalations: {
        Args: { _complaint_id: string }
        Returns: number
      }
      evaluate_return_validations: {
        Args: { _form_data?: Json; _return_id: string }
        Returns: Json
      }
      evaluate_stress_indicators_for_return: {
        Args: { _return_id: string }
        Returns: Json
      }
      execute_complaint_workflow_action: {
        Args: {
          _action_key: string
          _complaint_id: string
          _expected_updated_at?: string
          _payload?: Json
        }
        Returns: Json
      }
      expire_delegation_rules: { Args: never; Returns: number }
      external_can_access_application: {
        Args: { _application_id: string; _capability: string; _user_id: string }
        Returns: boolean
      }
      external_can_access_application_values: {
        Args: {
          _applicant_id: string
          _capability: string
          _data: Json
          _user_id: string
        }
        Returns: boolean
      }
      external_can_access_complaint: {
        Args: { _capability: string; _complaint_id: string; _user_id: string }
        Returns: boolean
      }
      external_can_access_complaint_values: {
        Args: {
          _capability: string
          _complainant_id: string
          _license_holder_id: string
          _user_id: string
        }
        Returns: boolean
      }
      external_can_access_compliance_return: {
        Args: { _capability: string; _return_id: string; _user_id: string }
        Returns: boolean
      }
      external_can_access_compliance_return_values: {
        Args: {
          _capability: string
          _license_id: string
          _on_behalf_of_licensee_id: string
          _submitter_id: string
          _user_id: string
        }
        Returns: boolean
      }
      external_can_access_document_ref: {
        Args: {
          _capability: string
          _entity_id: string
          _entity_type: string
          _user_id: string
        }
        Returns: boolean
      }
      external_can_access_license: {
        Args: { _capability: string; _license_id: string; _user_id: string }
        Returns: boolean
      }
      external_can_access_payment: {
        Args: { _capability: string; _payment_id: string; _user_id: string }
        Returns: boolean
      }
      external_can_access_payment_values: {
        Args: {
          _application_id: string
          _capability: string
          _payment_user_id: string
          _user_id: string
        }
        Returns: boolean
      }
      external_can_access_return_filed: {
        Args: { _capability: string; _return_id: string; _user_id: string }
        Returns: boolean
      }
      external_can_access_return_filed_values: {
        Args: {
          _capability: string
          _created_by: string
          _entity_id: string
          _on_behalf_of_licensee_id: string
          _user_id: string
        }
        Returns: boolean
      }
      external_can_upload_document_ref: {
        Args: { _entity_id: string; _entity_type: string; _user_id: string }
        Returns: boolean
      }
      external_user_entity_ids: {
        Args: { _user_id: string }
        Returns: string[]
      }
      finalize_complaint_with_attachments: {
        Args: { p_complaint_id: string; p_file_upload_ids: string[] }
        Returns: Json
      }
      fp_regulator_visible: {
        Args: { _row_regulator_id: string }
        Returns: boolean
      }
      fp_user_regulator_id: { Args: { _user_id: string }; Returns: string }
      generate_application_number: { Args: never; Returns: string }
      generate_complaint_duplicate_candidates: {
        Args: { _complaint_id: string }
        Returns: number
      }
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
      get_complaint: { Args: { _id: string }; Returns: Json }
      get_complaint_available_actions: {
        Args: { _complaint_id: string }
        Returns: {
          action_key: string
          action_type: string
          label: string
          mutation_kind: string
          require_comments: boolean
          required_fields: Json
          sort_order: number
          target_step_key: string
        }[]
      }
      get_complaint_current_assignees: {
        Args: { _complaint_ids: string[] }
        Returns: {
          complaint_id: string
          email: string
          full_name: string
          step_role: string
          user_id: string
        }[]
      }
      get_complaint_tracking: { Args: { _complaint_id: string }; Returns: Json }
      get_declaration_invitation_public: {
        Args: { p_token: string }
        Returns: {
          assessment_id: string
          expires_at: string
          failed_identity_attempts: number
          id: string
          individual_name: string
          status: string
        }[]
      }
      get_form_version_usage_counts: {
        Args: { _template_id: string }
        Returns: {
          in_progress_count: number
          submitted_response_count: number
          version_id: string
        }[]
      }
      get_fp_declaration_form_public: {
        Args: never
        Returns: {
          schema_snapshot: Json
          template_id: string
          version_id: string
        }[]
      }
      get_fp_determination_audit_log: {
        Args: { _determination_id: string }
        Returns: {
          action: string
          actor_name: string
          created_at: string
          id: string
          metadata: Json
          user_id: string
        }[]
      }
      get_in_flight_renewals: {
        Args: { license_ids: string[] }
        Returns: {
          application_id: string
          is_in_progress: boolean
          is_pending: boolean
          license_id: string
          status: string
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
      get_permission_dependencies: {
        Args: never
        Returns: {
          action: string
          requires: string
        }[]
      }
      get_public_complaint_tracking: {
        Args: { p_email?: string; p_reference: string }
        Returns: Json
      }
      get_public_complaint_tracking_raw: {
        Args: { p_email?: string; p_reference: string }
        Returns: Json
      }
      get_registration_reviewer_remarks: {
        Args: { _registration_id: string }
        Returns: string
      }
      get_return_revisions: {
        Args: { _return_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          form_version_ids: Json
          id: string
          new_status: string | null
          previous_status: string | null
          return_id: string
          revision_number: number
          snapshot: Json
          snapshot_reason: string
        }[]
        SetofOptions: {
          from: "*"
          to: "return_data_revisions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_review_role_display: {
        Args: { _regulator_id: string }
        Returns: {
          color: string
          role_id: string
          show_reviewer_name: boolean
          show_role_name: boolean
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_any_internal_role: { Args: { _user_id: string }; Returns: boolean }
      has_any_permission: {
        Args: { _keys: string[]; _user_id: string }
        Returns: boolean
      }
      has_complaint_perm: {
        Args: { _action: string; _user_id: string }
        Returns: boolean
      }
      has_decision_gate_override: {
        Args: { _entity_id: string; _entity_type: string }
        Returns: boolean
      }
      has_external_role: { Args: { _user_id: string }; Returns: boolean }
      has_legal_access: { Args: { _user_id: string }; Returns: boolean }
      has_permission: {
        Args: { _action: string; _module: string; _user_id: string }
        Returns: boolean
      }
      has_portal_capability: {
        Args: {
          _area: Database["public"]["Enums"]["portal_area"]
          _capability: string
          _entity_id: string
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_scoped_permission:
        | {
            Args: {
              _action: string
              _licensee_id?: string
              _module: string
              _owner_id?: string
              _sector_id?: string
              _user_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _action: string
              _licensee_id: string
              _module: string
              _owner_id: string
              _record_id: string
              _sector_id: string
              _user_id: string
            }
            Returns: boolean
          }
      import_applications_bulk: { Args: { _payload: Json }; Returns: Json }
      import_return_form_data: {
        Args: { _return_id: string; _rows: Json; _strategy: string }
        Returns: {
          forms_touched: string[]
          values_written: number
        }[]
      }
      is_assignment_only_regulator: {
        Args: { _user_id: string }
        Returns: boolean
      }
      is_collab_admin: { Args: { _user_id: string }; Returns: boolean }
      is_coordination_participant: {
        Args: { _case_id: string; _user_id: string }
        Returns: boolean
      }
      is_doc_staff: { Args: { _user_id: string }; Returns: boolean }
      is_eligible_ppoc_user: {
        Args: { _existing_mapping_id?: string; _user_id: string }
        Returns: boolean
      }
      is_fp_staff: { Args: { _user_id: string }; Returns: boolean }
      is_internal_staff: { Args: { _user_id: string }; Returns: boolean }
      is_internal_staff_user: { Args: { _user_id: string }; Returns: boolean }
      is_legal_compliance_user: { Args: { _user_id: string }; Returns: boolean }
      is_primary_user_of: {
        Args: { _entity_id: string; _user_id: string }
        Returns: boolean
      }
      is_record_assigned_to_user: {
        Args: { _module: string; _record_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      latest_return_analysis: {
        Args: { _return_id: string }
        Returns: {
          ai_summary: string | null
          asset_quality_summary: Json
          capital_summary: Json
          computed_at: string
          computed_by: string | null
          concentration_risks: Json
          early_warnings: Json
          health_score: number | null
          heatmap: Json
          id: string
          inputs: Json
          liquidity_summary: Json
          peer: Json
          profitability_summary: Json
          recommendations: Json
          return_config_id: string | null
          return_id: string
          sector_id: string | null
          trend: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "return_consolidated_analysis"
          isOneToOne: false
          isSetofReturn: true
        }
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
      link_complaint_licensee: {
        Args: { _complaint_id: string; _licensee_id: string }
        Returns: undefined
      }
      list_complaint_assignment_teams: {
        Args: { _regulator_id?: string }
        Returns: {
          complaint_count: number
          team: string
        }[]
      }
      list_complaints: {
        Args: {
          _filters?: Json
          _page?: number
          _page_size?: number
          _search?: string
          _sort?: string
        }
        Returns: Json
      }
      list_duplicate_clusters: { Args: { _dimension?: string }; Returns: Json }
      list_permission_dependent_actions: { Args: never; Returns: string[] }
      log_compliance_audit: {
        Args: {
          _action_type: Database["public"]["Enums"]["compliance_audit_action"]
          _after_value?: Json
          _ai_model_version?: string
          _before_value?: Json
          _ip_address?: string
          _justification?: string
          _metadata?: Json
          _object_id?: string
          _object_type: string
        }
        Returns: string
      }
      log_compliance_audit_as_actor: {
        Args: {
          _action_type: Database["public"]["Enums"]["compliance_audit_action"]
          _actor_id: string
          _after_value?: Json
          _ai_model_version?: string
          _before_value?: Json
          _ip_address?: string
          _justification?: string
          _metadata?: Json
          _object_id?: string
          _object_type: string
          _user_agent?: string
        }
        Returns: string
      }
      log_conduct_evidence_access: {
        Args: { _action: string; _evidence_id: string; _reason?: string }
        Returns: undefined
      }
      log_document_batch_action: {
        Args: { _action: string; _details?: Json; _group_id: string }
        Returns: undefined
      }
      log_restricted_legal_note_denial: {
        Args: {
          _application_id: string
          _note_id: string
          _reason: string
          _source: string
        }
        Returns: undefined
      }
      log_rule_override: {
        Args: {
          _entity_id: string
          _entity_type: string
          _metadata?: Json
          _module: string
          _original_value: Json
          _overridden_value: Json
          _reason: string
          _rule_key: string
        }
        Returns: string
      }
      log_security_event: {
        Args: {
          _detail?: Json
          _event_type: Database["public"]["Enums"]["security_event_type"]
          _ip_address?: string
          _metadata?: Json
          _target_resource?: string
          _user_agent?: string
        }
        Returns: string
      }
      log_security_event_as_actor: {
        Args: {
          _actor_id: string
          _detail?: Json
          _event_type: Database["public"]["Enums"]["security_event_type"]
          _ip_address?: string
          _metadata?: Json
          _target_resource?: string
          _user_agent?: string
        }
        Returns: string
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
      log_validation_run: {
        Args: { _context?: string; _results: Json; _return_id: string }
        Returns: string
      }
      manual_escalate_complaint: {
        Args: {
          _complaint_id: string
          _notes?: string
          _rule_key: string
          _severity?: string
          _target_tier?: string
        }
        Returns: string
      }
      mark_application_in_progress: {
        Args: { _application_id: string }
        Returns: Json
      }
      mark_expired_licenses: { Args: never; Returns: number }
      mark_prudential_actions_overdue: { Args: never; Returns: number }
      notification_recipients_for_role: {
        Args: { _role: string }
        Returns: string[]
      }
      peer_ratio_snapshot: {
        Args: { _period_end: string; _ratio_key: string; _sector_id?: string }
        Returns: Json
      }
      pending_duplicate_count: { Args: never; Returns: number }
      pending_escalation_count: { Args: never; Returns: number }
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
      perform_manual_application_approval: {
        Args: { _actor_id?: string; _application_id: string; _comments: string }
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
      permission_has_dependency: { Args: { _action: string }; Returns: boolean }
      portal_application_entity_ids: {
        Args: { _application_id: string }
        Returns: string[]
      }
      portal_license_entity_ids: {
        Args: { _license_id: string }
        Returns: string[]
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
      prudential_dashboard_metrics: { Args: never; Returns: Json }
      prudential_entity_audit_history: {
        Args: { _entity_id: string }
        Returns: {
          action_type: Database["public"]["Enums"]["compliance_audit_action"]
          after_value: Json
          before_value: Json
          entry_id: string
          justification: string
          metadata: Json
          object_id: string
          object_type: string
          timestamp: string
          user_id: string
          user_role: string
        }[]
      }
      prudential_sector_risk_distribution: {
        Args: never
        Returns: {
          breach_count: number
          entity_count: number
          sector_id: string
          sector_name: string
        }[]
      }
      publish_prudential_ratio: { Args: { _ratio_id: string }; Returns: number }
      publish_prudential_threshold: {
        Args: { _effective_from?: string; _threshold_id: string }
        Returns: number
      }
      publish_validation_rule: { Args: { _rule_id: string }; Returns: number }
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
      rbac_delete_role: { Args: { _role_id: string }; Returns: Json }
      rbac_reclassify_roles: { Args: never; Returns: Json }
      rbac_save_role: { Args: { _payload: Json }; Returns: Json }
      reap_stuck_notification_outbox: { Args: never; Returns: number }
      recompute_return_ratios: { Args: { _return_id: string }; Returns: Json }
      record_export_intent: {
        Args: { _action: string; _meta?: Json; _module: string }
        Returns: Json
      }
      record_return_breach: {
        Args: {
          _comparator: string
          _level: string
          _metric_key: string
          _return_id: string
          _risk_level?: string
          _threshold_value: number
          _value: number
        }
        Returns: string
      }
      record_return_ratio: {
        Args: {
          _computed_by?: string
          _display_format: string
          _label: string
          _ratio_key: string
          _return_id: string
          _value: number
        }
        Returns: string
      }
      reject_application_action: {
        Args: { _application_id: string; _comments: string }
        Returns: Json
      }
      reject_return: {
        Args: { _reason: string; _return_id: string }
        Returns: undefined
      }
      reject_review_suggestion: {
        Args: { _suggestion_id: string }
        Returns: {
          author_role_id: string | null
          author_user_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          entity_id: string
          entity_type: string
          field_key: string
          id: string
          original_text: string | null
          regulator_id: string | null
          selection_end: number | null
          selection_start: number | null
          status: string
          suggested_text: string | null
          type: string
          updated_at: string
          workflow_instance_id: string | null
          workflow_step_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "review_suggestions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reorder_approval_steps: {
        Args: { _orders: Json; _workflow_id: string }
        Returns: undefined
      }
      repair_application_workflow: {
        Args: { _application_id: string }
        Returns: Json
      }
      request_legal_notes_access: {
        Args: { _application_id: string }
        Returns: Json
      }
      request_resubmission_for_application: {
        Args: { _application_id: string; _comments: string }
        Returns: Json
      }
      request_return_edit: {
        Args: { _reason: string; _return_id: string }
        Returns: Json
      }
      reset_application_for_provisioning: {
        Args: { _application_id: string }
        Returns: Json
      }
      reset_system_role_permissions: {
        Args: { p_role_name: string }
        Returns: number
      }
      reset_system_role_permissions_guarded: {
        Args: { p_role_name: string }
        Returns: number
      }
      resolve_actor_role: { Args: { _user_id: string }; Returns: string }
      resolve_application_form_version: {
        Args: { _application_id: string; _template_id: string }
        Returns: Json
      }
      resolve_complaint:
        | {
            Args: { _id: string; _resolution: string }
            Returns: {
              acknowledged_at: string | null
              assigned_team: string | null
              channel_id: string | null
              closed_at: string | null
              closed_by: string | null
              closure_category: string | null
              closure_reason: string | null
              complainant_id: string | null
              complaint_number: string
              complaint_type_id: string | null
              conduct_risk_category_id: string | null
              created_at: string
              customer_type: string | null
              description: string
              email: string | null
              enforcement_action_id: string | null
              findings: string | null
              id: string
              idempotency_key: string | null
              intake_source: string | null
              internal_created_by: string | null
              investigation_notes: string | null
              investigator_id: string | null
              license_holder_id: string | null
              licensee_id: string | null
              parent_complaint_id: string | null
              priority: string | null
              product_id: string | null
              regulator_id: string | null
              repeat_complaint_count: number
              resolution: string | null
              resolution_notes: string | null
              resolved_at: string | null
              search_vector: unknown
              severity: string
              severity_overridden_at: string | null
              severity_overridden_by: string | null
              severity_override_reason: string | null
              sla_days: number | null
              sla_due_at: string | null
              status: string
              subject: string
              triage_evaluated_at: string | null
              triage_last_error: string | null
              triage_original_values: Json | null
              triage_override_status: string
              triage_result_snapshot: Json | null
              triage_rule_id: string | null
              triage_source: string | null
              updated_at: string
              vulnerability_category: string | null
              vulnerability_indicator: boolean
              vulnerability_notes: string | null
              vulnerability_review_state: Database["public"]["Enums"]["complaint_vulnerability_review_state"]
            }
            SetofOptions: {
              from: "*"
              to: "complaints"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              _expected_updated_at: string
              _id: string
              _resolution: string
            }
            Returns: {
              acknowledged_at: string | null
              assigned_team: string | null
              channel_id: string | null
              closed_at: string | null
              closed_by: string | null
              closure_category: string | null
              closure_reason: string | null
              complainant_id: string | null
              complaint_number: string
              complaint_type_id: string | null
              conduct_risk_category_id: string | null
              created_at: string
              customer_type: string | null
              description: string
              email: string | null
              enforcement_action_id: string | null
              findings: string | null
              id: string
              idempotency_key: string | null
              intake_source: string | null
              internal_created_by: string | null
              investigation_notes: string | null
              investigator_id: string | null
              license_holder_id: string | null
              licensee_id: string | null
              parent_complaint_id: string | null
              priority: string | null
              product_id: string | null
              regulator_id: string | null
              repeat_complaint_count: number
              resolution: string | null
              resolution_notes: string | null
              resolved_at: string | null
              search_vector: unknown
              severity: string
              severity_overridden_at: string | null
              severity_overridden_by: string | null
              severity_override_reason: string | null
              sla_days: number | null
              sla_due_at: string | null
              status: string
              subject: string
              triage_evaluated_at: string | null
              triage_last_error: string | null
              triage_original_values: Json | null
              triage_override_status: string
              triage_result_snapshot: Json | null
              triage_rule_id: string | null
              triage_source: string | null
              updated_at: string
              vulnerability_category: string | null
              vulnerability_indicator: boolean
              vulnerability_notes: string | null
              vulnerability_review_state: Database["public"]["Enums"]["complaint_vulnerability_review_state"]
            }
            SetofOptions: {
              from: "*"
              to: "complaints"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      resolve_effective_threshold: {
        Args: {
          _as_of?: string
          _metric_key: string
          _return_config_id: string
          _return_type_id?: string
          _sector_id?: string
        }
        Returns: {
          breach_value: number | null
          comparator: string
          created_at: string
          current_version: number
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          label: string
          metric_key: string
          return_config_id: string
          return_type_id: string | null
          sector_id: string | null
          taxonomy_code: string | null
          unit: string | null
          updated_at: string
          upper_value: number | null
          warn_value: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "prudential_thresholds"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      resolve_license_action_form: {
        Args: {
          _action_type: string
          _category_id: string
          _regulator_id: string
          _sector_id: string
          _sub_sector_id: string
        }
        Returns: {
          form_template_id: string
          id: string
          is_required: boolean
          match_score: number
        }[]
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
      resolve_review_comment: {
        Args: { _comment_id: string; _resolved: boolean }
        Returns: {
          author_role_id: string | null
          author_user_id: string
          body: string
          created_at: string
          entity_id: string
          entity_type: string
          field_key: string
          id: string
          is_blocking: boolean
          parent_comment_id: string | null
          regulator_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          selection_end: number | null
          selection_start: number | null
          selection_text: string | null
          status: string
          updated_at: string
          workflow_instance_id: string | null
          workflow_step_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "review_comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      retry_complaint_triage: { Args: { _id: string }; Returns: undefined }
      retry_dead_notification_outbox: {
        Args: { _ids: string[] }
        Returns: number
      }
      return_status_is_submitted_lifecycle: {
        Args: { _status: string }
        Returns: boolean
      }
      role_scope_for: {
        Args: { _module: string; _role_id: string }
        Returns: Json
      }
      rollback_prudential_ratio: {
        Args: { _ratio_id: string; _to_version: number }
        Returns: number
      }
      rollback_prudential_threshold: {
        Args: { _threshold_id: string; _to_version: number }
        Returns: number
      }
      rollback_validation_rule: {
        Args: { _rule_id: string; _to_version: number }
        Returns: number
      }
      run_complaint_escalation_sweep: { Args: never; Returns: Json }
      safe_uuid: { Args: { _value: string }; Returns: string }
      save_ppoc_mapping: {
        Args: {
          _licensee_id: string
          _mapping_id: string
          _ppoc_user_id: string
          _sector_ids: string[]
        }
        Returns: Json
      }
      search_licensees: {
        Args: { _limit?: number; _offset?: number; _q?: string }
        Returns: {
          id: string
          name: string
          regulator_id: string
          sector_id: string
          sector_name: string
          status: string
          total_count: number
        }[]
      }
      seed_external_portal_defaults: {
        Args: {
          _actor?: string
          _entity_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      set_review_comment_blocking: {
        Args: { _blocking: boolean; _comment_id: string }
        Returns: {
          author_role_id: string | null
          author_user_id: string
          body: string
          created_at: string
          entity_id: string
          entity_type: string
          field_key: string
          id: string
          is_blocking: boolean
          parent_comment_id: string | null
          regulator_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          selection_end: number | null
          selection_start: number | null
          selection_text: string | null
          status: string
          updated_at: string
          workflow_instance_id: string | null
          workflow_step_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "review_comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      simulate_escalation_rule: {
        Args: { _criterion: string; _thresholds: Json }
        Returns: Json
      }
      snapshot_return_revision: {
        Args: {
          _actor_id?: string
          _new_status?: string
          _previous_status?: string
          _reason: string
          _return_id: string
        }
        Returns: string
      }
      start_complaint_investigation:
        | {
            Args: { _id: string }
            Returns: {
              acknowledged_at: string | null
              assigned_team: string | null
              channel_id: string | null
              closed_at: string | null
              closed_by: string | null
              closure_category: string | null
              closure_reason: string | null
              complainant_id: string | null
              complaint_number: string
              complaint_type_id: string | null
              conduct_risk_category_id: string | null
              created_at: string
              customer_type: string | null
              description: string
              email: string | null
              enforcement_action_id: string | null
              findings: string | null
              id: string
              idempotency_key: string | null
              intake_source: string | null
              internal_created_by: string | null
              investigation_notes: string | null
              investigator_id: string | null
              license_holder_id: string | null
              licensee_id: string | null
              parent_complaint_id: string | null
              priority: string | null
              product_id: string | null
              regulator_id: string | null
              repeat_complaint_count: number
              resolution: string | null
              resolution_notes: string | null
              resolved_at: string | null
              search_vector: unknown
              severity: string
              severity_overridden_at: string | null
              severity_overridden_by: string | null
              severity_override_reason: string | null
              sla_days: number | null
              sla_due_at: string | null
              status: string
              subject: string
              triage_evaluated_at: string | null
              triage_last_error: string | null
              triage_original_values: Json | null
              triage_override_status: string
              triage_result_snapshot: Json | null
              triage_rule_id: string | null
              triage_source: string | null
              updated_at: string
              vulnerability_category: string | null
              vulnerability_indicator: boolean
              vulnerability_notes: string | null
              vulnerability_review_state: Database["public"]["Enums"]["complaint_vulnerability_review_state"]
            }
            SetofOptions: {
              from: "*"
              to: "complaints"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { _expected_updated_at: string; _id: string }
            Returns: {
              acknowledged_at: string | null
              assigned_team: string | null
              channel_id: string | null
              closed_at: string | null
              closed_by: string | null
              closure_category: string | null
              closure_reason: string | null
              complainant_id: string | null
              complaint_number: string
              complaint_type_id: string | null
              conduct_risk_category_id: string | null
              created_at: string
              customer_type: string | null
              description: string
              email: string | null
              enforcement_action_id: string | null
              findings: string | null
              id: string
              idempotency_key: string | null
              intake_source: string | null
              internal_created_by: string | null
              investigation_notes: string | null
              investigator_id: string | null
              license_holder_id: string | null
              licensee_id: string | null
              parent_complaint_id: string | null
              priority: string | null
              product_id: string | null
              regulator_id: string | null
              repeat_complaint_count: number
              resolution: string | null
              resolution_notes: string | null
              resolved_at: string | null
              search_vector: unknown
              severity: string
              severity_overridden_at: string | null
              severity_overridden_by: string | null
              severity_override_reason: string | null
              sla_days: number | null
              sla_due_at: string | null
              status: string
              subject: string
              triage_evaluated_at: string | null
              triage_last_error: string | null
              triage_original_values: Json | null
              triage_override_status: string
              triage_result_snapshot: Json | null
              triage_rule_id: string | null
              triage_source: string | null
              updated_at: string
              vulnerability_category: string | null
              vulnerability_indicator: boolean
              vulnerability_notes: string | null
              vulnerability_review_state: Database["public"]["Enums"]["complaint_vulnerability_review_state"]
            }
            SetofOptions: {
              from: "*"
              to: "complaints"
              isOneToOne: true
              isSetofReturn: false
            }
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
      submit_declaration_by_token: {
        Args: { p_assessment_id: string; p_inv_id: string; p_token: string }
        Returns: boolean
      }
      submit_declaration_form: {
        Args: {
          p_assessment_id: string
          p_form_data?: Json
          p_inv_id: string
          p_token: string
        }
        Returns: Json
      }
      toggle_ppoc_mapping_status: {
        Args: { _is_active: boolean; _mapping_id: string }
        Returns: Json
      }
      transition_complaint_status: {
        Args: {
          _expected_updated_at?: string
          _id: string
          _new_status: string
          _reason?: string
        }
        Returns: undefined
      }
      update_complaint_severity:
        | {
            Args: { _id: string; _reason?: string; _severity: string }
            Returns: undefined
          }
        | {
            Args: {
              _expected_updated_at: string
              _id: string
              _reason: string
              _severity: string
            }
            Returns: undefined
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
      user_has_entity_assignment: {
        Args: { _licensee_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_permission: {
        Args: { _action: string; _module: string; _user_id: string }
        Returns: boolean
      }
      user_licensee_id: { Args: { _user_id: string }; Returns: string }
      user_scope_for: {
        Args: { _action: string; _module: string; _user_id: string }
        Returns: Json
      }
      validate_scope_config: {
        Args: { _scope_config: Json }
        Returns: {
          error: string
          module: string
        }[]
      }
      verify_declaration_identity: {
        Args: { p_dob: string; p_last4id: string; p_token: string }
        Returns: {
          assessment_id: string
          invitation_id: string
          verified: boolean
        }[]
      }
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
        | "legal_compliance"
      complaint_vulnerability_review_state:
        | "not_applicable"
        | "needs_remediation"
        | "confirmed"
      compliance_audit_action:
        | "CREATE"
        | "UPDATE"
        | "DELETE"
        | "APPROVE"
        | "REJECT"
        | "OVERRIDE"
        | "EXPORT"
        | "ACCESS_DENIED"
        | "WORKFLOW_TRANSITION"
        | "NOTIFICATION_SENT"
        | "INTEGRATION_EVENT"
        | "LOGIN"
        | "LOGOUT"
      cutoff_unit_enum: "days" | "weeks" | "months"
      entity_access_type: "primary_user" | "employee" | "secondary_contact"
      notification_status_enum: "pending" | "sent" | "failed"
      ontime_status_enum: "ON_TIME" | "LATE"
      portal_area: "licensing" | "returns" | "complaints" | "fp_declarations"
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
      security_event_type:
        | "ACCESS_DENIED"
        | "AUTH_FAILED"
        | "PERMISSION_ESCALATION"
        | "INTEGRATION_FAILURE"
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
        "legal_compliance",
      ],
      complaint_vulnerability_review_state: [
        "not_applicable",
        "needs_remediation",
        "confirmed",
      ],
      compliance_audit_action: [
        "CREATE",
        "UPDATE",
        "DELETE",
        "APPROVE",
        "REJECT",
        "OVERRIDE",
        "EXPORT",
        "ACCESS_DENIED",
        "WORKFLOW_TRANSITION",
        "NOTIFICATION_SENT",
        "INTEGRATION_EVENT",
        "LOGIN",
        "LOGOUT",
      ],
      cutoff_unit_enum: ["days", "weeks", "months"],
      entity_access_type: ["primary_user", "employee", "secondary_contact"],
      notification_status_enum: ["pending", "sent", "failed"],
      ontime_status_enum: ["ON_TIME", "LATE"],
      portal_area: ["licensing", "returns", "complaints", "fp_declarations"],
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
      security_event_type: [
        "ACCESS_DENIED",
        "AUTH_FAILED",
        "PERMISSION_ESCALATION",
        "INTEGRATION_FAILURE",
      ],
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
