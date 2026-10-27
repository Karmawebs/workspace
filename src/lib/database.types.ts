export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17";
  };
  public: {
    Tables: {
      action_jobs: {
        Row: {
          action_type: string;
          finished_at: string | null;
          id: string;
          progress_at: string | null;
          progress_message: string | null;
          progress_stage: string | null;
          requested_at: string;
          requested_payload: Json;
          result: Json;
          site_id: string;
          started_at: string | null;
          status: string;
          target_slug: string | null;
          target_type: string | null;
        };
        Insert: {
          action_type: string;
          finished_at?: string | null;
          id?: string;
          progress_at?: string | null;
          progress_message?: string | null;
          progress_stage?: string | null;
          requested_at?: string;
          requested_payload?: Json;
          result?: Json;
          site_id: string;
          started_at?: string | null;
          status?: string;
          target_slug?: string | null;
          target_type?: string | null;
        };
        Update: {
          action_type?: string;
          finished_at?: string | null;
          id?: string;
          progress_at?: string | null;
          progress_message?: string | null;
          progress_stage?: string | null;
          requested_at?: string;
          requested_payload?: Json;
          result?: Json;
          site_id?: string;
          started_at?: string | null;
          status?: string;
          target_slug?: string | null;
          target_type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "action_jobs_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "site_overview";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_jobs_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      alerts: {
        Row: {
          code: string;
          first_seen_at: string;
          id: string;
          last_seen_at: string;
          message: string | null;
          metadata: Json;
          resolved_at: string | null;
          severity: Database["public"]["Enums"]["alert_severity"];
          site_id: string;
          source: string;
          status: Database["public"]["Enums"]["alert_status"];
          title: string;
        };
        Insert: {
          code: string;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          message?: string | null;
          metadata?: Json;
          resolved_at?: string | null;
          severity: Database["public"]["Enums"]["alert_severity"];
          site_id: string;
          source?: string;
          status?: Database["public"]["Enums"]["alert_status"];
          title: string;
        };
        Update: {
          code?: string;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          message?: string | null;
          metadata?: Json;
          resolved_at?: string | null;
          severity?: Database["public"]["Enums"]["alert_severity"];
          site_id?: string;
          source?: string;
          status?: Database["public"]["Enums"]["alert_status"];
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "alerts_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "site_overview";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alerts_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          actor: string;
          created_at: string;
          details: Json;
          event_type: string;
          id: number;
          site_id: string | null;
        };
        Insert: {
          actor?: string;
          created_at?: string;
          details?: Json;
          event_type: string;
          id?: never;
          site_id?: string | null;
        };
        Update: {
          actor?: string;
          created_at?: string;
          details?: Json;
          event_type?: string;
          id?: never;
          site_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "site_overview";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_log_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      diagnostics: {
        Row: {
          captured_at: string;
          database_version: string | null;
          health: Json;
          home_url: string | null;
          https: boolean | null;
          id: string;
          locale: string | null;
          multisite: boolean | null;
          php_memory_limit: string | null;
          php_version: string | null;
          post_max_size: string | null;
          raw: Json;
          server_software: string | null;
          site_id: string;
          site_kit_status: string | null;
          site_name: string | null;
          timezone: string | null;
          upload_max_filesize: string | null;
          wp_latest_version: string | null;
          wp_memory_limit: string | null;
          wp_update_available: boolean | null;
          wp_url: string | null;
          wp_version: string | null;
        };
        Insert: {
          captured_at?: string;
          database_version?: string | null;
          health?: Json;
          home_url?: string | null;
          https?: boolean | null;
          id?: string;
          locale?: string | null;
          multisite?: boolean | null;
          php_memory_limit?: string | null;
          php_version?: string | null;
          post_max_size?: string | null;
          raw?: Json;
          server_software?: string | null;
          site_id: string;
          site_kit_status?: string | null;
          site_name?: string | null;
          timezone?: string | null;
          upload_max_filesize?: string | null;
          wp_latest_version?: string | null;
          wp_memory_limit?: string | null;
          wp_update_available?: boolean | null;
          wp_url?: string | null;
          wp_version?: string | null;
        };
        Update: {
          captured_at?: string;
          database_version?: string | null;
          health?: Json;
          home_url?: string | null;
          https?: boolean | null;
          id?: string;
          locale?: string | null;
          multisite?: boolean | null;
          php_memory_limit?: string | null;
          php_version?: string | null;
          post_max_size?: string | null;
          raw?: Json;
          server_software?: string | null;
          site_id?: string;
          site_kit_status?: string | null;
          site_name?: string | null;
          timezone?: string | null;
          upload_max_filesize?: string | null;
          wp_latest_version?: string | null;
          wp_memory_limit?: string | null;
          wp_update_available?: boolean | null;
          wp_url?: string | null;
          wp_version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "diagnostics_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "site_overview";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "diagnostics_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      installations: {
        Row: {
          api_token: string | null;
          connected_at: string | null;
          created_at: string;
          credential_hash: string | null;
          id: string;
          installation_uuid: string | null;
          last_seen_at: string | null;
          paired_at: string | null;
          pairing_code: string | null;
          pairing_code_hash: string | null;
          pairing_expires_at: string | null;
          plugin_version: string | null;
          site_id: string;
          updated_at: string;
        };
        Insert: {
          api_token?: string | null;
          connected_at?: string | null;
          created_at?: string;
          credential_hash?: string | null;
          id?: string;
          installation_uuid?: string | null;
          last_seen_at?: string | null;
          paired_at?: string | null;
          pairing_code?: string | null;
          pairing_code_hash?: string | null;
          pairing_expires_at?: string | null;
          plugin_version?: string | null;
          site_id: string;
          updated_at?: string;
        };
        Update: {
          api_token?: string | null;
          connected_at?: string | null;
          created_at?: string;
          credential_hash?: string | null;
          id?: string;
          installation_uuid?: string | null;
          last_seen_at?: string | null;
          paired_at?: string | null;
          pairing_code?: string | null;
          pairing_code_hash?: string | null;
          pairing_expires_at?: string | null;
          plugin_version?: string | null;
          site_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "installations_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: true;
            referencedRelation: "site_overview";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "installations_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: true;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      kw_alerts: {
        Row: {
          app_key: string;
          assigned_to: string | null;
          created_at: string;
          id: string;
          message: string | null;
          metadata: Json;
          project_id: string | null;
          resolved_at: string | null;
          severity: string;
          source_id: string | null;
          source_type: string | null;
          status: string;
          title: string;
          type: string;
          workspace_id: string;
        };
        Insert: {
          app_key: string;
          assigned_to?: string | null;
          created_at?: string;
          id?: string;
          message?: string | null;
          metadata?: Json;
          project_id?: string | null;
          resolved_at?: string | null;
          severity?: string;
          source_id?: string | null;
          source_type?: string | null;
          status?: string;
          title: string;
          type?: string;
          workspace_id: string;
        };
        Update: {
          app_key?: string;
          assigned_to?: string | null;
          created_at?: string;
          id?: string;
          message?: string | null;
          metadata?: Json;
          project_id?: string | null;
          resolved_at?: string | null;
          severity?: string;
          source_id?: string | null;
          source_type?: string | null;
          status?: string;
          title?: string;
          type?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kw_alerts_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "kw_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kw_alerts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "kw_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      kw_app_modules: {
        Row: {
          app_key: string;
          config: Json;
          enabled: boolean;
          id: string;
          module_key: string;
          workspace_id: string;
        };
        Insert: {
          app_key: string;
          config?: Json;
          enabled?: boolean;
          id?: string;
          module_key: string;
          workspace_id: string;
        };
        Update: {
          app_key?: string;
          config?: Json;
          enabled?: boolean;
          id?: string;
          module_key?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kw_app_modules_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "kw_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      kw_apps: {
        Row: {
          config: Json;
          created_at: string;
          enabled: boolean;
          id: string;
          key: string;
          name: string;
          workspace_id: string;
        };
        Insert: {
          config?: Json;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          key: string;
          name: string;
          workspace_id: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          key?: string;
          name?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kw_apps_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "kw_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      kw_care_sites: {
        Row: {
          created_at: string;
          domain: string;
          id: string;
          legacy_site_id: string | null;
          metadata: Json;
          project_id: string | null;
          status: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          domain: string;
          id?: string;
          legacy_site_id?: string | null;
          metadata?: Json;
          project_id?: string | null;
          status?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          domain?: string;
          id?: string;
          legacy_site_id?: string | null;
          metadata?: Json;
          project_id?: string | null;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kw_care_sites_legacy_site_id_fkey";
            columns: ["legacy_site_id"];
            isOneToOne: true;
            referencedRelation: "site_overview";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kw_care_sites_legacy_site_id_fkey";
            columns: ["legacy_site_id"];
            isOneToOne: true;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kw_care_sites_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "kw_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kw_care_sites_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "kw_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      kw_clients: {
        Row: {
          archived: boolean;
          company: string | null;
          created_at: string;
          email: string | null;
          id: string;
          metadata: Json;
          name: string;
          notes: string | null;
          phone: string | null;
          updated_at: string;
          website: string | null;
          workspace_id: string;
        };
        Insert: {
          archived?: boolean;
          company?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          metadata?: Json;
          name: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
          website?: string | null;
          workspace_id: string;
        };
        Update: {
          archived?: boolean;
          company?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          metadata?: Json;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
          website?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kw_clients_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "kw_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      kw_connections: {
        Row: {
          care_site_id: string | null;
          connection_type: string;
          created_at: string;
          endpoint: string | null;
          id: string;
          last_checked_at: string | null;
          metadata: Json;
          name: string;
          project_id: string | null;
          status: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          care_site_id?: string | null;
          connection_type: string;
          created_at?: string;
          endpoint?: string | null;
          id?: string;
          last_checked_at?: string | null;
          metadata?: Json;
          name: string;
          project_id?: string | null;
          status?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          care_site_id?: string | null;
          connection_type?: string;
          created_at?: string;
          endpoint?: string | null;
          id?: string;
          last_checked_at?: string | null;
          metadata?: Json;
          name?: string;
          project_id?: string | null;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kw_connections_care_site_id_fkey";
            columns: ["care_site_id"];
            isOneToOne: false;
            referencedRelation: "kw_care_sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kw_connections_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "kw_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kw_connections_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "kw_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      kw_content_items: {
        Row: {
          assignee_id: string | null;
          channel: string | null;
          content_type: string;
          created_at: string;
          description: string | null;
          file_urls: Json;
          id: string;
          metadata: Json;
          project_id: string | null;
          published_at: string | null;
          scheduled_at: string | null;
          sort_order: number;
          status: string;
          title: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          assignee_id?: string | null;
          channel?: string | null;
          content_type?: string;
          created_at?: string;
          description?: string | null;
          file_urls?: Json;
          id?: string;
          metadata?: Json;
          project_id?: string | null;
          published_at?: string | null;
          scheduled_at?: string | null;
          sort_order?: number;
          status?: string;
          title: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          assignee_id?: string | null;
          channel?: string | null;
          content_type?: string;
          created_at?: string;
          description?: string | null;
          file_urls?: Json;
          id?: string;
          metadata?: Json;
          project_id?: string | null;
          published_at?: string | null;
          scheduled_at?: string | null;
          sort_order?: number;
          status?: string;
          title?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kw_content_items_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "kw_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kw_content_items_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "kw_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      kw_events: {
        Row: {
          app_key: string;
          attendees: Json;
          created_at: string;
          description: string | null;
          ends_at: string | null;
          id: string;
          location: string | null;
          metadata: Json;
          project_id: string | null;
          starts_at: string;
          title: string;
          type: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          app_key: string;
          attendees?: Json;
          created_at?: string;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          location?: string | null;
          metadata?: Json;
          project_id?: string | null;
          starts_at: string;
          title: string;
          type?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          app_key?: string;
          attendees?: Json;
          created_at?: string;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          location?: string | null;
          metadata?: Json;
          project_id?: string | null;
          starts_at?: string;
          title?: string;
          type?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kw_events_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "kw_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kw_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "kw_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      kw_journal_entries: {
        Row: {
          app_key: string;
          author_id: string | null;
          body: string;
          created_at: string;
          entry_date: string;
          id: string;
          metadata: Json;
          project_id: string | null;
          title: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          app_key: string;
          author_id?: string | null;
          body: string;
          created_at?: string;
          entry_date?: string;
          id?: string;
          metadata?: Json;
          project_id?: string | null;
          title?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          app_key?: string;
          author_id?: string | null;
          body?: string;
          created_at?: string;
          entry_date?: string;
          id?: string;
          metadata?: Json;
          project_id?: string | null;
          title?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kw_journal_entries_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "kw_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kw_journal_entries_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "kw_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      kw_profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          role: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          role?: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      kw_project_members: {
        Row: {
          project_id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          project_id: string;
          role?: string;
          user_id: string;
        };
        Update: {
          project_id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kw_project_members_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "kw_projects";
            referencedColumns: ["id"];
          },
        ];
      };
      kw_project_milestones: {
        Row: {
          completed_at: string | null;
          created_at: string;
          description: string | null;
          due_at: string | null;
          id: string;
          metadata: Json;
          project_id: string;
          sort_order: number;
          status: string;
          title: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          due_at?: string | null;
          id?: string;
          metadata?: Json;
          project_id: string;
          sort_order?: number;
          status?: string;
          title: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          due_at?: string | null;
          id?: string;
          metadata?: Json;
          project_id?: string;
          sort_order?: number;
          status?: string;
          title?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kw_project_milestones_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "kw_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kw_project_milestones_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "kw_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      kw_project_panels: {
        Row: {
          app_key: string;
          config: Json;
          enabled: boolean;
          icon: string | null;
          id: string;
          panel_key: string;
          project_id: string;
          sort_order: number;
          subtitle: string | null;
          title: string;
        };
        Insert: {
          app_key: string;
          config?: Json;
          enabled?: boolean;
          icon?: string | null;
          id?: string;
          panel_key: string;
          project_id: string;
          sort_order?: number;
          subtitle?: string | null;
          title: string;
        };
        Update: {
          app_key?: string;
          config?: Json;
          enabled?: boolean;
          icon?: string | null;
          id?: string;
          panel_key?: string;
          project_id?: string;
          sort_order?: number;
          subtitle?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kw_project_panels_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "kw_projects";
            referencedColumns: ["id"];
          },
        ];
      };
      kw_project_resources: {
        Row: {
          app_key: string;
          created_at: string;
          id: string;
          label: string;
          metadata: Json;
          project_id: string;
          secret_ref: string | null;
          sort_order: number;
          type: string;
          updated_at: string;
          url: string | null;
          value: string | null;
          workspace_id: string;
        };
        Insert: {
          app_key: string;
          created_at?: string;
          id?: string;
          label: string;
          metadata?: Json;
          project_id: string;
          secret_ref?: string | null;
          sort_order?: number;
          type: string;
          updated_at?: string;
          url?: string | null;
          value?: string | null;
          workspace_id: string;
        };
        Update: {
          app_key?: string;
          created_at?: string;
          id?: string;
          label?: string;
          metadata?: Json;
          project_id?: string;
          secret_ref?: string | null;
          sort_order?: number;
          type?: string;
          updated_at?: string;
          url?: string | null;
          value?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kw_project_resources_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "kw_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kw_project_resources_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "kw_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      kw_projects: {
        Row: {
          app_key: string;
          archived: boolean;
          client_id: string | null;
          created_at: string;
          description: string | null;
          due_date: string | null;
          id: string;
          metadata: Json;
          name: string;
          owner_id: string | null;
          priority: string;
          start_date: string | null;
          status: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          app_key: string;
          archived?: boolean;
          client_id?: string | null;
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          metadata?: Json;
          name: string;
          owner_id?: string | null;
          priority?: string;
          start_date?: string | null;
          status?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          app_key?: string;
          archived?: boolean;
          client_id?: string | null;
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          metadata?: Json;
          name?: string;
          owner_id?: string | null;
          priority?: string;
          start_date?: string | null;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kw_projects_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "kw_clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kw_projects_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "kw_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      kw_tasks: {
        Row: {
          app_key: string;
          assignee_id: string | null;
          completed_at: string | null;
          created_at: string;
          description: string | null;
          due_at: string | null;
          id: string;
          metadata: Json;
          priority: string;
          project_id: string | null;
          sort_order: number;
          status: string;
          title: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          app_key: string;
          assignee_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          due_at?: string | null;
          id?: string;
          metadata?: Json;
          priority?: string;
          project_id?: string | null;
          sort_order?: number;
          status?: string;
          title: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          app_key?: string;
          assignee_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          due_at?: string | null;
          id?: string;
          metadata?: Json;
          priority?: string;
          project_id?: string | null;
          sort_order?: number;
          status?: string;
          title?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kw_tasks_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "kw_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kw_tasks_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "kw_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      kw_workspace_members: {
        Row: {
          created_at: string;
          role: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          role?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          role?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kw_workspace_members_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "kw_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      kw_workspaces: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      plan_catalog: {
        Row: {
          active: boolean;
          default_price: number | null;
          display_name: string;
          editable: boolean;
          plan_type: Database["public"]["Enums"]["care_plan_type"];
          sort_order: number;
        };
        Insert: {
          active?: boolean;
          default_price?: number | null;
          display_name: string;
          editable?: boolean;
          plan_type: Database["public"]["Enums"]["care_plan_type"];
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          default_price?: number | null;
          display_name?: string;
          editable?: boolean;
          plan_type?: Database["public"]["Enums"]["care_plan_type"];
          sort_order?: number;
        };
        Relationships: [];
      };
      plugin_snapshots: {
        Row: {
          active: boolean;
          available_version: string | null;
          diagnostic_id: string;
          id: string;
          name: string | null;
          slug: string;
          update_available: boolean;
          version: string | null;
        };
        Insert: {
          active?: boolean;
          available_version?: string | null;
          diagnostic_id: string;
          id?: string;
          name?: string | null;
          slug: string;
          update_available?: boolean;
          version?: string | null;
        };
        Update: {
          active?: boolean;
          available_version?: string | null;
          diagnostic_id?: string;
          id?: string;
          name?: string | null;
          slug?: string;
          update_available?: boolean;
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "plugin_snapshots_diagnostic_id_fkey";
            columns: ["diagnostic_id"];
            isOneToOne: false;
            referencedRelation: "diagnostics";
            referencedColumns: ["id"];
          },
        ];
      };
      site_activity: {
        Row: {
          action_type: string;
          created_at: string;
          detail: string | null;
          id: string;
          site_id: string;
          status: string;
          title: string;
        };
        Insert: {
          action_type?: string;
          created_at?: string;
          detail?: string | null;
          id?: string;
          site_id: string;
          status?: string;
          title: string;
        };
        Update: {
          action_type?: string;
          created_at?: string;
          detail?: string | null;
          id?: string;
          site_id?: string;
          status?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "site_activity_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "site_overview";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_activity_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      site_notes: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          site_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          site_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          site_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "site_notes_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "site_overview";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_notes_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      sites: {
        Row: {
          active: boolean;
          client_name: string;
          created_at: string;
          custom_plan_name: string | null;
          domain: string;
          id: string;
          monthly_price: number;
          plan_type: Database["public"]["Enums"]["care_plan_type"];
          status: Database["public"]["Enums"]["site_status"];
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          client_name: string;
          created_at?: string;
          custom_plan_name?: string | null;
          domain: string;
          id?: string;
          monthly_price?: number;
          plan_type?: Database["public"]["Enums"]["care_plan_type"];
          status?: Database["public"]["Enums"]["site_status"];
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          client_name?: string;
          created_at?: string;
          custom_plan_name?: string | null;
          domain?: string;
          id?: string;
          monthly_price?: number;
          plan_type?: Database["public"]["Enums"]["care_plan_type"];
          status?: Database["public"]["Enums"]["site_status"];
          updated_at?: string;
        };
        Relationships: [];
      };
      theme_snapshots: {
        Row: {
          active: boolean;
          author: string | null;
          available_version: string | null;
          diagnostic_id: string;
          id: string;
          name: string | null;
          parent_theme: string | null;
          slug: string;
          update_available: boolean;
          version: string | null;
        };
        Insert: {
          active?: boolean;
          author?: string | null;
          available_version?: string | null;
          diagnostic_id: string;
          id?: string;
          name?: string | null;
          parent_theme?: string | null;
          slug: string;
          update_available?: boolean;
          version?: string | null;
        };
        Update: {
          active?: boolean;
          author?: string | null;
          available_version?: string | null;
          diagnostic_id?: string;
          id?: string;
          name?: string | null;
          parent_theme?: string | null;
          slug?: string;
          update_available?: boolean;
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "theme_snapshots_diagnostic_id_fkey";
            columns: ["diagnostic_id"];
            isOneToOne: false;
            referencedRelation: "diagnostics";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      site_overview: {
        Row: {
          active: boolean | null;
          client_name: string | null;
          connected_at: string | null;
          created_at: string | null;
          critical_alerts: number | null;
          custom_plan_name: string | null;
          domain: string | null;
          https: boolean | null;
          id: string | null;
          last_diagnostic_at: string | null;
          last_seen_at: string | null;
          monthly_price: number | null;
          open_alerts: number | null;
          php_version: string | null;
          plan_type: Database["public"]["Enums"]["care_plan_type"] | null;
          plugin_version: string | null;
          site_kit_status: string | null;
          status: Database["public"]["Enums"]["site_status"] | null;
          updated_at: string | null;
          wp_version: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      agent_finish_action: {
        Args: {
          p_action_id: string;
          p_api_token: string;
          p_ok: boolean;
          p_result?: Json;
        };
        Returns: boolean;
      };
      agent_next_action: {
        Args: { p_api_token: string };
        Returns: {
          action_type: string;
          id: string;
          requested_payload: Json;
          site_id: string;
          target_slug: string;
          target_type: string;
        }[];
      };
      agent_progress_action: {
        Args: {
          p_action_id: string;
          p_api_token: string;
          p_message: string;
          p_stage: string;
        };
        Returns: boolean;
      };
      agent_start_action: {
        Args: { p_action_id: string; p_api_token: string };
        Returns: boolean;
      };
      alert_action_kind: {
        Args: { p_code: string; p_title: string };
        Returns: string;
      };
      alert_action_label: {
        Args: { p_code: string; p_title: string };
        Returns: string;
      };
      create_site_with_pairing: {
        Args: {
          p_client_name: string;
          p_custom_plan_name?: string;
          p_domain: string;
          p_monthly_price?: number;
          p_plan_type?: Database["public"]["Enums"]["care_plan_type"];
        };
        Returns: {
          pairing_code: string;
          site_id: string;
        }[];
      };
      enqueue_workspace_care_action: { Args: { p_care_site_id: string; p_action_type: string; p_target?: string | null }; Returns: string };
      cancel_workspace_care_action: { Args: { p_action_id: string }; Returns: boolean };
      enqueue_care_action: {
        Args: { p_action_type: string; p_site_id: string; p_targets?: Json };
        Returns: string;
      };
      ingest_diagnostic: {
        Args: { p_api_token: string; p_payload: Json };
        Returns: boolean;
      };
      kw_is_workspace_admin: { Args: { ws: string }; Returns: boolean };
      kw_is_workspace_member: { Args: { ws: string }; Returns: boolean };
      pair_installation: {
        Args: {
          p_home_url: string;
          p_installation_uuid: string;
          p_pairing_code: string;
          p_plugin_version: string;
        };
        Returns: {
          api_token: string;
          site_id: string;
        }[];
      };
    };
    Enums: {
      alert_severity: "info" | "warning" | "critical";
      alert_status: "open" | "resolved" | "dismissed";
      care_plan_type: "care" | "care_plus" | "custom";
      site_status:
        | "pending"
        | "ok"
        | "attention"
        | "incident"
        | "disconnected"
        | "inactive";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      alert_severity: ["info", "warning", "critical"],
      alert_status: ["open", "resolved", "dismissed"],
      care_plan_type: ["care", "care_plus", "custom"],
      site_status: [
        "pending",
        "ok",
        "attention",
        "incident",
        "disconnected",
        "inactive",
      ],
    },
  },
} as const;
