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
            referencedRelation: "v_group_activities"
            referencedColumns: ["id"]
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
            referencedRelation: "v_attendance_roster"
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
            foreignKeyName: "invitations_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
            referencedRelation: "v_group_activities"
            referencedColumns: ["id"]
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
            referencedRelation: "v_attendance_roster"
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
            referencedRelation: "v_group_activities"
            referencedColumns: ["id"]
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
            referencedRelation: "v_attendance_roster"
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
        ]
      }
      v_group_detail: {
        Row: {
          description: string | null
          id: string | null
          invite_code: string | null
          logo_url: string | null
          name: string | null
          roles: string[] | null
          settings: Json | null
          sport: string | null
        }
        Relationships: []
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
    }
    Functions: {
      accept_invitation: {
        Args: { p_auth_user_id: string; p_token_hash: string }
        Returns: Json
      }
      auth_user_id: { Args: never; Returns: string }
      can_read_avatar: { Args: { p_name: string }; Returns: boolean }
      can_upload_avatar: { Args: never; Returns: boolean }
      cancel_invitation_registration: {
        Args: { p_nonce_hash: string }
        Returns: undefined
      }
      clear_attendance_record: {
        Args: { p_activity_id: string; p_membership_id: string }
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
      invitation_context: { Args: { p_token_hash: string }; Returns: Json }
      is_group_admin: { Args: { p_group_id: string }; Returns: boolean }
      is_guardian_of: { Args: { p_athlete_user_id: string }; Returns: boolean }
      is_member: { Args: { p_group_id: string }; Returns: boolean }
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
      list_guardianship_athletes: {
        Args: { p_group_id: string; p_offset?: number; p_search?: string }
        Returns: {
          full_name: string
          total_count: number
          user_id: string
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
      prepare_invitation_registration: {
        Args: {
          p_email: string
          p_nonce_hash: string
          p_registration: Json
          p_token_hash: string
        }
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
      request_birthdate_change: {
        Args: { p_birthdate: string }
        Returns: string
      }
      review_birthdate_change: {
        Args: { p_approve: boolean; p_group_id: string; p_request_id: string }
        Returns: string
      }
      rotate_invite_code: { Args: { p_group_id: string }; Returns: string }
      set_avatar_permission: {
        Args: { p_allow: boolean; p_guardianship_id: string }
        Returns: undefined
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
