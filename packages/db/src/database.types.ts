export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activities: {
        Row: {
          activity_type_id: string
          created_at: string
          created_by: string
          description: string | null
          ends_at: string
          group_id: string
          id: string
          location: string | null
          recurrence_rule: Json | null
          recurrence_source_id: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          activity_type_id: string
          created_at?: string
          created_by: string
          description?: string | null
          ends_at: string
          group_id: string
          id?: string
          location?: string | null
          recurrence_rule?: Json | null
          recurrence_source_id?: string | null
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          activity_type_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          ends_at?: string
          group_id?: string
          id?: string
          location?: string | null
          recurrence_rule?: Json | null
          recurrence_source_id?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "activity_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "v_activity_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "v_athlete_attendance_history"
            referencedColumns: ["activity_type_id"]
          },
          {
            foreignKeyName: "activities_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "v_ward_attendance_history"
            referencedColumns: ["activity_type_id"]
          },
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_group_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_ward_groups"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "activities_recurrence_source_id_fkey"
            columns: ["recurrence_source_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_recurrence_source_id_fkey"
            columns: ["recurrence_source_id"]
            isOneToOne: false
            referencedRelation: "v_athlete_attendance_history"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "activities_recurrence_source_id_fkey"
            columns: ["recurrence_source_id"]
            isOneToOne: false
            referencedRelation: "v_group_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_recurrence_source_id_fkey"
            columns: ["recurrence_source_id"]
            isOneToOne: false
            referencedRelation: "v_ward_attendance_history"
            referencedColumns: ["activity_id"]
          },
        ]
      }
      activity_types: {
        Row: {
          color: string
          group_id: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          color?: string
          group_id?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          color?: string
          group_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_types_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_types_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_group_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_types_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_types_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_ward_groups"
            referencedColumns: ["group_id"]
          },
        ]
      }
      announcement_push_preferences: {
        Row: {
          enabled: boolean
          user_id: string
        }
        Insert: {
          enabled?: boolean
          user_id: string
        }
        Update: {
          enabled?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_push_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          activity_id: string
          id: string
          membership_id: string
          note: string | null
          recorded_at: string
          recorded_by: string
          status: string
        }
        Insert: {
          activity_id: string
          id?: string
          membership_id: string
          note?: string | null
          recorded_at?: string
          recorded_by: string
          status: string
        }
        Update: {
          activity_id?: string
          id?: string
          membership_id?: string
          note?: string | null
          recorded_at?: string
          recorded_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "v_athlete_attendance_history"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "attendance_records_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "v_group_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "v_ward_attendance_history"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_athlete_attendance_history"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_roster"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_group_attendance_report"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_group_stats_members"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_ward_attendance_history"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "attendance_records_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plans: {
        Row: {
          amount_clp: number
          athlete_limit: number
          code: string
          currency: string
          name: string
        }
        Insert: {
          amount_clp: number
          athlete_limit: number
          code: string
          currency?: string
          name: string
        }
        Update: {
          amount_clp?: number
          athlete_limit?: number
          code?: string
          currency?: string
          name?: string
        }
        Relationships: []
      }
      birthdate_change_approvals: {
        Row: {
          approved_at: string
          approved_by: string
          group_id: string
          request_id: string
        }
        Insert: {
          approved_at?: string
          approved_by: string
          group_id: string
          request_id: string
        }
        Update: {
          approved_at?: string
          approved_by?: string
          group_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "birthdate_change_approvals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birthdate_change_approvals_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birthdate_change_approvals_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_group_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birthdate_change_approvals_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birthdate_change_approvals_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_ward_groups"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "birthdate_change_approvals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "birthdate_change_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      birthdate_change_requests: {
        Row: {
          created_at: string
          id: string
          old_birthdate: string
          requested_birthdate: string
          resolved_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          old_birthdate: string
          requested_birthdate: string
          resolved_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          old_birthdate?: string
          requested_birthdate?: string
          resolved_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "birthdate_change_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          allows_avatar: boolean
          channel: string | null
          consent_type: string
          granted_at: string
          guardianship_id: string
          id: string
          revoked_at: string | null
          terms_version: string
        }
        Insert: {
          allows_avatar?: boolean
          channel?: string | null
          consent_type: string
          granted_at?: string
          guardianship_id: string
          id?: string
          revoked_at?: string | null
          terms_version: string
        }
        Update: {
          allows_avatar?: boolean
          channel?: string | null
          consent_type?: string
          granted_at?: string
          guardianship_id?: string
          id?: string
          revoked_at?: string | null
          terms_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_guardianship_id_fkey"
            columns: ["guardianship_id"]
            isOneToOne: false
            referencedRelation: "guardianships"
            referencedColumns: ["id"]
          },
        ]
      }
      group_announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string
          deleted_at: string | null
          group_id: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          group_id: string
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          group_id?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_announcements_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_announcements_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_group_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_announcements_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_announcements_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_ward_groups"
            referencedColumns: ["group_id"]
          },
        ]
      }
      group_subscriptions: {
        Row: {
          activated_at: string | null
          amount_clp: number
          athlete_limit: number
          checkout_url: string | null
          created_at: string
          creation_attempted_at: string | null
          group_id: string
          id: string
          next_payment_at: string | null
          plan_code: string
          provider_subscription_id: string | null
          provider_updated_at: string | null
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          amount_clp: number
          athlete_limit: number
          checkout_url?: string | null
          created_at?: string
          creation_attempted_at?: string | null
          group_id: string
          id?: string
          next_payment_at?: string | null
          plan_code: string
          provider_subscription_id?: string | null
          provider_updated_at?: string | null
          requested_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          amount_clp?: number
          athlete_limit?: number
          checkout_url?: string | null
          created_at?: string
          creation_attempted_at?: string | null
          group_id?: string
          id?: string
          next_payment_at?: string | null
          plan_code?: string
          provider_subscription_id?: string | null
          provider_updated_at?: string | null
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_subscriptions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_subscriptions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_group_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_subscriptions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_subscriptions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_ward_groups"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "group_subscriptions_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "group_subscriptions_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          invite_code: string
          logo_url: string | null
          name: string
          settings: Json
          settings_updated_at: string | null
          settings_updated_by: string | null
          sport: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          invite_code: string
          logo_url?: string | null
          name: string
          settings?: Json
          settings_updated_at?: string | null
          settings_updated_by?: string | null
          sport?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          invite_code?: string
          logo_url?: string | null
          name?: string
          settings?: Json
          settings_updated_at?: string | null
          settings_updated_by?: string | null
          sport?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_settings_updated_by_fkey"
            columns: ["settings_updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      guardianships: {
        Row: {
          athlete_user_id: string
          created_at: string
          deactivated_at: string | null
          guardian_user_id: string
          id: string
          relationship: string
          status: string
        }
        Insert: {
          athlete_user_id: string
          created_at?: string
          deactivated_at?: string | null
          guardian_user_id: string
          id?: string
          relationship: string
          status?: string
        }
        Update: {
          athlete_user_id?: string
          created_at?: string
          deactivated_at?: string | null
          guardian_user_id?: string
          id?: string
          relationship?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardianships_athlete_user_id_fkey"
            columns: ["athlete_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardianships_guardian_user_id_fkey"
            columns: ["guardian_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          activation_membership_id: string | null
          created_at: string
          created_by: string
          email: string | null
          expires_at: string
          group_id: string
          id: string
          invited_user_id: string | null
          role: string
          status: string
          terms_version: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          activation_membership_id?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          expires_at?: string
          group_id: string
          id?: string
          invited_user_id?: string | null
          role: string
          status?: string
          terms_version?: string | null
          token: string
        }
        Update: {
          accepted_at?: string | null
          activation_membership_id?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          expires_at?: string
          group_id?: string
          id?: string
          invited_user_id?: string | null
          role?: string
          status?: string
          terms_version?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_activation_membership_id_fkey"
            columns: ["activation_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_activation_membership_id_fkey"
            columns: ["activation_membership_id"]
            isOneToOne: false
            referencedRelation: "v_athlete_attendance_history"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "invitations_activation_membership_id_fkey"
            columns: ["activation_membership_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_roster"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "invitations_activation_membership_id_fkey"
            columns: ["activation_membership_id"]
            isOneToOne: false
            referencedRelation: "v_group_attendance_report"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "invitations_activation_membership_id_fkey"
            columns: ["activation_membership_id"]
            isOneToOne: false
            referencedRelation: "v_group_stats_members"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "invitations_activation_membership_id_fkey"
            columns: ["activation_membership_id"]
            isOneToOne: false
            referencedRelation: "v_ward_attendance_history"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_group_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_ward_groups"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "invitations_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          affected_count: number
          completed_at: string
          id: string
          job_name: string
          run_date: string
        }
        Insert: {
          affected_count: number
          completed_at?: string
          id?: string
          job_name: string
          run_date: string
        }
        Update: {
          affected_count?: number
          completed_at?: string
          id?: string
          job_name?: string
          run_date?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          created_at: string
          group_id: string
          id: string
          joined_at: string | null
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          joined_at?: string | null
          role: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          joined_at?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_group_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_ward_groups"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoices: {
        Row: {
          amount_clp: number
          created_at: string
          due_at: string
          paid_at: string | null
          provider_invoice_id: string
          provider_payment_id: string | null
          provider_updated_at: string
          status: string
          subscription_id: string
        }
        Insert: {
          amount_clp: number
          created_at?: string
          due_at: string
          paid_at?: string | null
          provider_invoice_id: string
          provider_payment_id?: string | null
          provider_updated_at: string
          status: string
          subscription_id: string
        }
        Update: {
          amount_clp?: number
          created_at?: string
          due_at?: string
          paid_at?: string | null
          provider_invoice_id?: string
          provider_payment_id?: string | null
          provider_updated_at?: string
          status?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "group_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          account_status: string
          auth_user_id: string | null
          avatar_url: string | null
          birthdate: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          account_status?: string
          auth_user_id?: string | null
          avatar_url?: string | null
          birthdate?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: string
          auth_user_id?: string | null
          avatar_url?: string | null
          birthdate?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_activity_types: {
        Row: {
          color: string | null
          group_id: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
        }
        Insert: {
          color?: string | null
          group_id?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
        }
        Update: {
          color?: string | null
          group_id?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_types_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_types_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_group_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_types_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_types_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_ward_groups"
            referencedColumns: ["group_id"]
          },
        ]
      }
      v_athlete_attendance_history: {
        Row: {
          activity_id: string | null
          activity_type_color: string | null
          activity_type_id: string | null
          activity_type_name: string | null
          group_id: string | null
          id: string | null
          is_system_type: boolean | null
          membership_id: string | null
          note: string | null
          starts_at: string | null
          status: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_group_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_ward_groups"
            referencedColumns: ["group_id"]
          },
        ]
      }
      v_attendance_admin: {
        Row: {
          activity_id: string | null
          group_id: string | null
          id: string | null
          membership_id: string | null
          note: string | null
          recorded_at: string | null
          recorded_by: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_group_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_ward_groups"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "attendance_records_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "v_athlete_attendance_history"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "attendance_records_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "v_group_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "v_ward_attendance_history"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_athlete_attendance_history"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_roster"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_group_attendance_report"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_group_stats_members"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_ward_attendance_history"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "attendance_records_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      v_attendance_operator: {
        Row: {
          activity_id: string | null
          group_id: string | null
          id: string | null
          membership_id: string | null
          note: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_group_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_ward_groups"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "attendance_records_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "v_athlete_attendance_history"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "attendance_records_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "v_group_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "v_ward_attendance_history"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_athlete_attendance_history"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_roster"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_group_attendance_report"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_group_stats_members"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_ward_attendance_history"
            referencedColumns: ["membership_id"]
          },
        ]
      }
      v_attendance_own: {
        Row: {
          activity_id: string | null
          group_id: string | null
          id: string | null
          membership_id: string | null
          note: string | null
          recorded_at: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_group_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_ward_groups"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "attendance_records_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "v_athlete_attendance_history"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "attendance_records_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "v_group_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "v_ward_attendance_history"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_athlete_attendance_history"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_roster"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_group_attendance_report"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_group_stats_members"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_ward_attendance_history"
            referencedColumns: ["membership_id"]
          },
        ]
      }
      v_attendance_roster: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          group_id: string | null
          membership_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_group_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_ward_groups"
            referencedColumns: ["group_id"]
          },
        ]
      }
      v_group_activities: {
        Row: {
          activity_type_color: string | null
          activity_type_id: string | null
          activity_type_name: string | null
          description: string | null
          ends_at: string | null
          group_id: string | null
          id: string | null
          is_system_type: boolean | null
          location: string | null
          recurrence_rule: Json | null
          recurrence_source_id: string | null
          starts_at: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "activity_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "v_activity_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "v_athlete_attendance_history"
            referencedColumns: ["activity_type_id"]
          },
          {
            foreignKeyName: "activities_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "v_ward_attendance_history"
            referencedColumns: ["activity_type_id"]
          },
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_group_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_ward_groups"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "activities_recurrence_source_id_fkey"
            columns: ["recurrence_source_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_recurrence_source_id_fkey"
            columns: ["recurrence_source_id"]
            isOneToOne: false
            referencedRelation: "v_athlete_attendance_history"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "activities_recurrence_source_id_fkey"
            columns: ["recurrence_source_id"]
            isOneToOne: false
            referencedRelation: "v_group_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_recurrence_source_id_fkey"
            columns: ["recurrence_source_id"]
            isOneToOne: false
            referencedRelation: "v_ward_attendance_history"
            referencedColumns: ["activity_id"]
          },
        ]
      }
      v_group_attendance_report: {
        Row: {
          absent: number | null
          activity_date: string | null
          activity_type_id: string | null
          attendance_pct: number | null
          convened: number | null
          excused: number | null
          group_id: string | null
          late: number | null
          late_rate: number | null
          membership_id: string | null
          present: number | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "activity_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "v_activity_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "v_athlete_attendance_history"
            referencedColumns: ["activity_type_id"]
          },
          {
            foreignKeyName: "activities_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "v_ward_attendance_history"
            referencedColumns: ["activity_type_id"]
          },
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_group_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_ward_groups"
            referencedColumns: ["group_id"]
          },
        ]
      }
      v_group_detail: {
        Row: {
          can_view_group_stats: boolean | null
          description: string | null
          id: string | null
          invite_code: string | null
          logo_url: string | null
          name: string | null
          roles: string[] | null
          settings: Json | null
          settings_updated_at: string | null
          settings_updated_by_name: string | null
          sport: string | null
        }
        Relationships: []
      }
      v_group_stats_members: {
        Row: {
          absent: number | null
          attendance_pct: number | null
          avatar_url: string | null
          convened: number | null
          excused: number | null
          full_name: string | null
          group_id: string | null
          late: number | null
          late_rate: number | null
          membership_id: string | null
          present: number | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_group_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_ward_groups"
            referencedColumns: ["group_id"]
          },
        ]
      }
      v_my_groups: {
        Row: {
          id: string | null
          logo_url: string | null
          name: string | null
          roles: string[] | null
          sport: string | null
        }
        Relationships: []
      }
      v_my_ward_groups: {
        Row: {
          athlete_user_id: string | null
          group_id: string | null
          membership_status: string | null
          name: string | null
          sport: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardianships_athlete_user_id_fkey"
            columns: ["athlete_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      v_my_wards: {
        Row: {
          age: number | null
          athlete_user_id: string | null
          avatar_url: string | null
          days_until_majority: number | null
          full_name: string | null
        }
        Relationships: []
      }
      v_ward_attendance_history: {
        Row: {
          activity_id: string | null
          activity_type_color: string | null
          activity_type_id: string | null
          activity_type_name: string | null
          athlete_user_id: string | null
          group_id: string | null
          id: string | null
          is_system_type: boolean | null
          membership_id: string | null
          note: string | null
          starts_at: string | null
          status: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_group_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_my_ward_groups"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["athlete_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invitation: {
        Args: { p_auth_user_id: string; p_token_hash: string }
        Returns: Json
      }
      approve_membership: {
        Args: { p_group_id: string; p_membership_id: string }
        Returns: undefined
      }
      assign_member_coach: {
        Args: { p_group_id: string; p_membership_id: string }
        Returns: string
      }
      auth_user_id: { Args: never; Returns: string }
      begin_subscription_checkout: {
        Args: {
          p_actor_auth_id: string
          p_group_id: string
          p_plan_code: string
        }
        Returns: Json
      }
      can_read_avatar: { Args: { p_name: string }; Returns: boolean }
      can_upload_avatar: { Args: never; Returns: boolean }
      cancel_invitation_registration: {
        Args: { p_nonce_hash: string }
        Returns: undefined
      }
      claim_announcement_push: {
        Args: { p_receipts?: boolean }
        Returns: {
          announcement_id: string
          claim_token: string
          delivery_id: string
          group_id: string
          ticket_id: string
          token: string
        }[]
      }
      claim_guardianship_majority_emails: {
        Args: never
        Returns: {
          audience: string
          claim_token: string
          delivery_id: string
          email: string
          full_name: string
        }[]
      }
      claim_subscription_creation: {
        Args: { p_subscription_id: string }
        Returns: boolean
      }
      clear_attendance_record: {
        Args: { p_activity_id: string; p_membership_id: string }
        Returns: undefined
      }
      complete_announcement_push: {
        Args: {
          p_claim_token: string
          p_delivery_id: string
          p_outcome: string
          p_ticket_id?: string
        }
        Returns: undefined
      }
      complete_guardianship_majority_email: {
        Args: { p_claim_token: string; p_delivery_id: string }
        Returns: undefined
      }
      consent_managed_member: {
        Args: { p_accepted: boolean; p_membership_id: string }
        Returns: undefined
      }
      consume_invitation_attempt: { Args: { p_key: string }; Returns: boolean }
      create_activity: {
        Args: {
          p_activity_type_id: string
          p_description?: string
          p_ends_at: string
          p_group_id: string
          p_location?: string
          p_recurrence_rule?: Json
          p_starts_at: string
          p_title: string
        }
        Returns: string
      }
      create_group: {
        Args: {
          p_description?: string
          p_logo_url?: string
          p_name: string
          p_sport: string
        }
        Returns: string
      }
      create_guardianship: {
        Args: {
          p_athlete_user_id: string
          p_email: string
          p_full_name: string
          p_group_id: string
          p_relationship: string
        }
        Returns: string
      }
      create_managed_member: {
        Args: {
          p_birthdate: string
          p_email?: string
          p_full_name: string
          p_group_id: string
          p_guardian?: Json
        }
        Returns: Json
      }
      deactivate_membership: {
        Args: { p_group_id: string; p_membership_id: string }
        Returns: undefined
      }
      delete_activity: {
        Args: {
          p_activity_id: string
          p_confirm_attendance?: boolean
          p_group_id: string
          p_scope?: string
        }
        Returns: number
      }
      delete_group_announcement: {
        Args: {
          p_announcement_id: string
          p_group_id: string
          p_updated_at: string
        }
        Returns: undefined
      }
      get_group_attendance_report: {
        Args: {
          p_activity_type_ids?: string[]
          p_from?: string
          p_group_id: string
          p_include_inactive?: boolean
          p_page?: number
          p_page_size?: number
          p_period?: string
          p_sort?: string
          p_to?: string
        }
        Returns: Json
      }
      get_group_billing: {
        Args: { p_group_id: string; p_page?: number }
        Returns: Json
      }
      get_group_stats: {
        Args: { p_group_id: string; p_page?: number; p_page_size?: number }
        Returns: Json
      }
      get_my_attendance_history: {
        Args: {
          p_activity_type_ids?: string[]
          p_from?: string
          p_group_id: string
          p_page?: number
          p_page_size?: number
          p_period?: string
          p_to?: string
        }
        Returns: Json
      }
      get_qr_checkin_settings: { Args: { p_group_id: string }; Returns: Json }
      get_subscription_context: {
        Args: { p_actor_auth_id: string; p_group_id: string }
        Returns: Json
      }
      get_ward_attendance_history: {
        Args: {
          p_activity_type_ids?: string[]
          p_athlete_user_id: string
          p_from?: string
          p_group_id: string
          p_page?: number
          p_page_size?: number
          p_period?: string
          p_to?: string
        }
        Returns: Json
      }
      invitation_context: { Args: { p_token_hash: string }; Returns: Json }
      invitation_registration_result: {
        Args: { p_auth_user_id: string; p_token_hash: string }
        Returns: Json
      }
      is_group_admin: { Args: { p_group_id: string }; Returns: boolean }
      is_guardian_of: { Args: { p_athlete_user_id: string }; Returns: boolean }
      is_member: { Args: { p_group_id: string }; Returns: boolean }
      issue_activity_checkin_qr: {
        Args: { p_activity_id: string }
        Returns: Json
      }
      issue_invitation: {
        Args: {
          p_auth_user_id: string
          p_email?: string
          p_group_id: string
          p_invitation_id?: string
          p_role?: string
          p_token_hash: string
        }
        Returns: Json
      }
      issue_managed_activation: {
        Args: {
          p_auth_user_id: string
          p_group_id: string
          p_membership_id: string
          p_token_hash: string
        }
        Returns: Json
      }
      join_group_as_athlete: { Args: { p_group_id: string }; Returns: string }
      join_group_by_code: { Args: { p_invite_code: string }; Returns: Json }
      list_avatar_permissions: {
        Args: never
        Returns: {
          allows_avatar: boolean
          full_name: string
          guardianship_id: string
        }[]
      }
      list_birthdate_reviews: {
        Args: never
        Returns: {
          approved: boolean
          full_name: string
          group_id: string
          group_name: string
          old_birthdate: string
          request_id: string
          requested_birthdate: string
        }[]
      }
      list_group_announcements: {
        Args: { p_group_id: string; p_page?: number }
        Returns: {
          body: string
          created_at: string
          group_id: string
          id: string
          title: string
          total_count: number
          updated_at: string
        }[]
      }
      list_group_members: {
        Args: {
          p_group_id: string
          p_offset?: number
          p_role?: string
          p_status?: string
        }
        Returns: {
          account_status: string
          birthdate: string
          email: string
          full_name: string
          membership_id: string
          phone: string
          role: string
          status: string
          total_count: number
        }[]
      }
      list_guardianship_athletes: {
        Args: { p_group_id: string; p_offset?: number; p_search?: string }
        Returns: {
          full_name: string
          total_count: number
          user_id: string
        }[]
      }
      list_managed_activation_requests: {
        Args: { p_group_id: string; p_offset?: number }
        Returns: {
          full_name: string
          membership_id: string
          relationship: string
          request_id: string
          status: string
          total_count: number
        }[]
      }
      list_managed_member_consents: {
        Args: { p_group_id: string; p_offset?: number }
        Returns: {
          full_name: string
          membership_id: string
          relationship: string
          total_count: number
        }[]
      }
      list_my_wards: {
        Args: never
        Returns: {
          age: number
          athlete_user_id: string
          avatar_url: string
          days_until_majority: number
          full_name: string
        }[]
      }
      list_pending_athletes: {
        Args: { p_group_id: string }
        Returns: {
          full_name: string
          guardian_ready: boolean
          is_minor: boolean
          membership_id: string
          total_count: number
        }[]
      }
      list_pending_memberships: {
        Args: { p_group_id: string; p_offset?: number }
        Returns: {
          full_name: string
          guardian_linked: boolean
          guardian_ready: boolean
          is_minor: boolean
          membership_id: string
          requires_managed_consent: boolean
          total_count: number
        }[]
      }
      lookup_billing_subscription: {
        Args: { p_subscription_id: string }
        Returns: Json
      }
      prepare_invitation_registration: {
        Args: {
          p_email: string
          p_nonce_hash: string
          p_registration: Json
          p_token_hash: string
        }
        Returns: undefined
      }
      publish_group_announcement: {
        Args: {
          p_body: string
          p_group_id: string
          p_request_id: string
          p_title: string
        }
        Returns: string
      }
      reactivate_membership: {
        Args: { p_group_id: string; p_membership_id: string }
        Returns: undefined
      }
      record_announcement_push_run: {
        Args: { p_processed: number }
        Returns: undefined
      }
      record_attendance_bulk: {
        Args: {
          p_activity_id: string
          p_only_unmarked?: boolean
          p_records: Json
        }
        Returns: Json
      }
      register_announcement_push_token: {
        Args: { p_platform: string; p_token: string }
        Returns: string
      }
      reject_pending_membership: {
        Args: { p_group_id: string; p_membership_id: string }
        Returns: undefined
      }
      reject_subscription_creation: {
        Args: { p_subscription_id: string }
        Returns: undefined
      }
      request_birthdate_change: {
        Args: { p_birthdate: string }
        Returns: string
      }
      request_managed_activation: {
        Args: { p_group_id: string; p_membership_id: string }
        Returns: string
      }
      review_birthdate_change: {
        Args: { p_approve: boolean; p_group_id: string; p_request_id: string }
        Returns: string
      }
      review_managed_activation: {
        Args: { p_accepted: boolean; p_request_id: string }
        Returns: Json
      }
      rotate_invite_code: { Args: { p_group_id: string }; Returns: string }
      run_guardianship_majority: { Args: never; Returns: number }
      self_checkin: {
        Args: { p_activity_id: string; p_token: string }
        Returns: Json
      }
      set_announcement_push_enabled: {
        Args: { p_enabled: boolean }
        Returns: undefined
      }
      set_avatar_permission: {
        Args: { p_allow: boolean; p_guardianship_id: string }
        Returns: undefined
      }
      set_qr_checkin_settings: {
        Args: { p_group_id: string; p_settings: Json }
        Returns: Json
      }
      sync_group_subscription: {
        Args: {
          p_checkout_url: string
          p_next_payment_at: string
          p_provider_id: string
          p_provider_updated_at: string
          p_status: string
          p_subscription_id: string
        }
        Returns: undefined
      }
      sync_subscription_invoice: {
        Args: {
          p_amount_clp: number
          p_currency: string
          p_due_at: string
          p_invoice_id: string
          p_paid_at: string
          p_payment_id: string
          p_provider_subscription_id: string
          p_provider_updated_at: string
          p_status: string
        }
        Returns: undefined
      }
      unregister_announcement_push_token: {
        Args: { p_token: string }
        Returns: undefined
      }
      update_activity: {
        Args: {
          p_activity_id: string
          p_activity_type_id: string
          p_description?: string
          p_ends_at: string
          p_group_id: string
          p_location?: string
          p_scope?: string
          p_starts_at: string
          p_title: string
        }
        Returns: number
      }
      update_attendance_record: {
        Args: { p_changes: Json; p_record_id: string }
        Returns: Json
      }
      update_group_announcement: {
        Args: {
          p_announcement_id: string
          p_body: string
          p_group_id: string
          p_title: string
          p_updated_at: string
        }
        Returns: undefined
      }
      update_group_settings: {
        Args: { p_changes: Json; p_group_id: string }
        Returns: Json
      }
      update_managed_member: {
        Args: {
          p_birthdate: string
          p_email?: string
          p_full_name: string
          p_group_id: string
          p_membership_id: string
          p_phone?: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
