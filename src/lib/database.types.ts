/**
 * Database types for DailyMattr Socials.
 *
 * Hand-written to match `supabase/migrations/*.sql` exactly, in the shape
 * postgrest-js requires (`Row` / `Insert` / `Update` / `Relationships` per
 * table). Once the project is provisioned, regenerate with:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 *
 * and this file becomes disposable. Until then it is the source of truth for
 * the client, so keep it in step with the migrations.
 *
 * `Relationships` drives join inference — `select("*, profiles(full_name)")`
 * only type-checks for pairs listed here.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Append-only tables use this so `.update()` rejects every property. */
type NoUpdate = Record<string, never>;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          phone: string | null;
          college: string | null;
          role: Enums<"user_role">;
          status: Enums<"user_status">;
          referral_code: string;
          /** True while an admin-issued temporary password is still in use. */
          must_change_password: boolean;
          created_at: string;
          updated_at: string;
          city: string | null;
          batch: string | null;
          joined_as: Enums<"joined_as">;
          status_reason: string | null;
          status_changed_at: string | null;
          status_changed_by: string | null;
        };
        Insert: {
          id: string;
          full_name?: string;
          email: string;
          phone?: string | null;
          college?: string | null;
          role?: Enums<"user_role">;
          status?: Enums<"user_status">;
          referral_code?: string;
          must_change_password?: boolean;
          created_at?: string;
          updated_at?: string;
          city?: string | null;
          batch?: string | null;
          joined_as?: Enums<"joined_as">;
          status_reason?: string | null;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
        };
        Update: {
          id?: string;
          full_name?: string;
          email?: string;
          phone?: string | null;
          college?: string | null;
          role?: Enums<"user_role">;
          status?: Enums<"user_status">;
          referral_code?: string;
          must_change_password?: boolean;
          created_at?: string;
          updated_at?: string;
          city?: string | null;
          batch?: string | null;
          joined_as?: Enums<"joined_as">;
          status_reason?: string | null;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };

      app_settings: {
        Row: {
          key: string;
          value: Json;
          description: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          key: string;
          value: Json;
          description?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          key?: string;
          value?: Json;
          description?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      audit_log: {
        Row: {
          id: number;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          meta: Json;
          created_at: string;
        };
        Insert: {
          id?: number;
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          meta?: Json;
          created_at?: string;
        };
        /** History is not rewritten. */
        Update: NoUpdate;
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      /**
       * Append-only. The database rejects UPDATE outright and rejects DELETE
       * unless the owning profile is being cascaded away — reverse a credit by
       * inserting a compensating row with `reason: 'revoke'`.
       */
      point_ledger: {
        Row: {
          id: number;
          ambassador_id: string;
          delta: number;
          reason: Enums<"ledger_reason">;
          source_type: string | null;
          source_id: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
          /** Generated: sign(delta). +1 credit, -1 reversal. */
          direction: number;
          phase: Enums<"program_phase"> | null;
        };
        Insert: {
          id?: number;
          ambassador_id: string;
          delta: number;
          reason: Enums<"ledger_reason">;
          source_type?: string | null;
          source_id?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
          phase?: Enums<"program_phase"> | null;
        };
        Update: NoUpdate;
        Relationships: [
          {
            foreignKeyName: "point_ledger_ambassador_id_fkey";
            columns: ["ambassador_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_ledger_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      surveys: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          status: Enums<"survey_status">;
          points_per_response: number;
          require_email: boolean;
          require_phone: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          phase: Enums<"program_phase">;
          response_cap: number | null;
          audience: Enums<"survey_audience">;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          status?: Enums<"survey_status">;
          points_per_response?: number;
          require_email?: boolean;
          require_phone?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          phase?: Enums<"program_phase">;
          response_cap?: number | null;
          audience?: Enums<"survey_audience">;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          status?: Enums<"survey_status">;
          points_per_response?: number;
          require_email?: boolean;
          require_phone?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          phase?: Enums<"program_phase">;
          response_cap?: number | null;
          audience?: Enums<"survey_audience">;
        };
        Relationships: [
          {
            foreignKeyName: "surveys_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      survey_questions: {
        Row: {
          id: string;
          survey_id: string;
          order_index: number;
          type: Enums<"question_type">;
          prompt: string;
          help_text: string | null;
          /** Choice labels. Required (>= 2) for single_choice / multi_choice. */
          options: Json;
          required: boolean;
          max_select: number | null;
        };
        Insert: {
          id?: string;
          survey_id: string;
          order_index: number;
          type: Enums<"question_type">;
          prompt: string;
          help_text?: string | null;
          options?: Json;
          required?: boolean;
          max_select?: number | null;
        };
        Update: {
          id?: string;
          survey_id?: string;
          order_index?: number;
          type?: Enums<"question_type">;
          prompt?: string;
          help_text?: string | null;
          options?: Json;
          required?: boolean;
          max_select?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "survey_questions_survey_id_fkey";
            columns: ["survey_id"];
            isOneToOne: false;
            referencedRelation: "surveys";
            referencedColumns: ["id"];
          },
        ];
      };

      survey_links: {
        Row: {
          id: string;
          survey_id: string;
          ambassador_id: string;
          slug: string;
          click_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          survey_id: string;
          ambassador_id: string;
          slug?: string;
          click_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          survey_id?: string;
          ambassador_id?: string;
          slug?: string;
          click_count?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "survey_links_survey_id_fkey";
            columns: ["survey_id"];
            isOneToOne: false;
            referencedRelation: "surveys";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "survey_links_ambassador_id_fkey";
            columns: ["ambassador_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      survey_responses: {
        Row: {
          id: string;
          survey_link_id: string;
          survey_id: string;
          ambassador_id: string;
          respondent_name: string | null;
          respondent_email: string | null;
          respondent_phone: string | null;
          ip_hash: string | null;
          user_agent: string | null;
          status: Enums<"response_status">;
          flag_reason: string | null;
          submitted_at: string;
        };
        Insert: {
          id?: string;
          survey_link_id: string;
          survey_id: string;
          ambassador_id: string;
          respondent_name?: string | null;
          respondent_email?: string | null;
          respondent_phone?: string | null;
          ip_hash?: string | null;
          user_agent?: string | null;
          status?: Enums<"response_status">;
          flag_reason?: string | null;
          submitted_at?: string;
        };
        /** Only adjudication fields change after submission. */
        Update: {
          status?: Enums<"response_status">;
          flag_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "survey_responses_survey_link_id_fkey";
            columns: ["survey_link_id"];
            isOneToOne: false;
            referencedRelation: "survey_links";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "survey_responses_survey_id_fkey";
            columns: ["survey_id"];
            isOneToOne: false;
            referencedRelation: "surveys";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "survey_responses_ambassador_id_fkey";
            columns: ["ambassador_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      survey_answers: {
        Row: {
          id: string;
          response_id: string;
          question_id: string;
          value: Json;
        };
        Insert: {
          id?: string;
          response_id: string;
          question_id: string;
          value: Json;
        };
        Update: {
          id?: string;
          response_id?: string;
          question_id?: string;
          value?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "survey_answers_response_id_fkey";
            columns: ["response_id"];
            isOneToOne: false;
            referencedRelation: "survey_responses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "survey_answers_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "survey_questions";
            referencedColumns: ["id"];
          },
        ];
      };

      campaigns: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          instagram_url: string;
          /** Handle the screenshot must show, stored without the '@'. */
          expected_handle: string;
          caption_hint: string | null;
          thumbnail_path: string | null;
          status: Enums<"campaign_status">;
          starts_at: string;
          ends_at: string | null;
          /** First time this campaign left draft. Stamped by trigger. */
          published_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          phase: Enums<"program_phase">;
          platform: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          instagram_url: string;
          expected_handle?: string;
          caption_hint?: string | null;
          thumbnail_path?: string | null;
          status?: Enums<"campaign_status">;
          starts_at?: string;
          ends_at?: string | null;
          published_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          phase?: Enums<"program_phase">;
          platform?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          instagram_url?: string;
          expected_handle?: string;
          caption_hint?: string | null;
          thumbnail_path?: string | null;
          status?: Enums<"campaign_status">;
          starts_at?: string;
          ends_at?: string | null;
          published_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          phase?: Enums<"program_phase">;
          platform?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      campaign_tasks: {
        Row: {
          id: string;
          campaign_id: string;
          type: Enums<"task_type"> | null;
          points: number;
          instructions: string | null;
          required: boolean;
          order_index: number;
          library_id: string | null;
          label_override: string | null;
          proof_type: Enums<"proof_type"> | null;
          platform: string | null;
          /** When the admin added this task — the start of its turnaround clock. */
          posted_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          type: Enums<"task_type"> | null;
          points?: number;
          instructions?: string | null;
          required?: boolean;
          order_index?: number;
          library_id?: string | null;
          label_override?: string | null;
          proof_type?: Enums<"proof_type"> | null;
          platform?: string | null;
          posted_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          type?: Enums<"task_type"> | null;
          points?: number;
          instructions?: string | null;
          required?: boolean;
          order_index?: number;
          library_id?: string | null;
          label_override?: string | null;
          proof_type?: Enums<"proof_type"> | null;
          platform?: string | null;
          posted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_tasks_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
        ];
      };

      submissions: {
        Row: {
          id: string;
          campaign_task_id: string;
          ambassador_id: string;
          attempt: number;
          /** Object key in the private 'screenshots' bucket. */
          screenshot_path: string | null;
          sha256: string | null;
          /** 64-bit difference hash, as a bit-string. */
          phash: string | null;
          width: number | null;
          height: number | null;
          byte_size: number | null;
          mime_type: string | null;
          captured_at: string | null;
          uploaded_at: string;
          checks: Json;
          ai_verdict: Json | null;
          ai_confidence: number | null;
          ai_model: string | null;
          status: Enums<"submission_status">;
          reject_reason: string | null;
          reviewer_id: string | null;
          review_note: string | null;
          reviewed_at: string | null;
          proof_url: string | null;
          proof_text: string | null;
        };
        Insert: {
          id?: string;
          campaign_task_id: string;
          ambassador_id: string;
          attempt?: number;
          screenshot_path?: string | null;
          sha256?: string | null;
          phash?: string | null;
          width?: number | null;
          height?: number | null;
          byte_size?: number | null;
          mime_type?: string | null;
          captured_at?: string | null;
          uploaded_at?: string;
          checks?: Json;
          ai_verdict?: Json | null;
          ai_confidence?: number | null;
          ai_model?: string | null;
          status?: Enums<"submission_status">;
          reject_reason?: string | null;
          reviewer_id?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          proof_url?: string | null;
          proof_text?: string | null;
        };
        /**
         * The evidence itself is immutable — only verdict and review fields
         * move. Re-uploading means a new row with a higher `attempt`.
         */
        Update: {
          checks?: Json;
          ai_verdict?: Json | null;
          ai_confidence?: number | null;
          ai_model?: string | null;
          status?: Enums<"submission_status">;
          reject_reason?: string | null;
          reviewer_id?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          proof_url?: string | null;
          proof_text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "submissions_campaign_task_id_fkey";
            columns: ["campaign_task_id"];
            isOneToOne: false;
            referencedRelation: "campaign_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_ambassador_id_fkey";
            columns: ["ambassador_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_reviewer_id_fkey";
            columns: ["reviewer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      referral_imports: {
        Row: {
          id: string;
          filename: string;
          row_count: number;
          matched_count: number;
          skipped_count: number;
          /** Codes in the file with no matching ambassador. */
          unmatched: Json;
          imported_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          filename: string;
          row_count?: number;
          matched_count?: number;
          skipped_count?: number;
          unmatched?: Json;
          imported_by?: string | null;
          created_at?: string;
        };
        Update: {
          row_count?: number;
          matched_count?: number;
          skipped_count?: number;
          unmatched?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "referral_imports_imported_by_fkey";
            columns: ["imported_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      referral_conversions: {
        Row: {
          id: string;
          ambassador_id: string;
          code: string;
          /** The DailyMattr app's id for the new user. Makes re-import safe. */
          external_user_ref: string;
          source: Enums<"conversion_source">;
          status: Enums<"conversion_status">;
          converted_at: string;
          import_id: string | null;
          notes: string | null;
          created_at: string;
          store: Enums<"install_store">;
          onboarded_at: string | null;
          activated_at: string | null;
          day3_return_at: string | null;
          day7_return_at: string | null;
        };
        Insert: {
          id?: string;
          ambassador_id: string;
          code: string;
          external_user_ref: string;
          source?: Enums<"conversion_source">;
          status?: Enums<"conversion_status">;
          converted_at?: string;
          import_id?: string | null;
          notes?: string | null;
          created_at?: string;
          store?: Enums<"install_store">;
          onboarded_at?: string | null;
          activated_at?: string | null;
          day3_return_at?: string | null;
          day7_return_at?: string | null;
        };
        /** Voiding a conversion is the only edit; the fact of it stays. */
        Update: {
          status?: Enums<"conversion_status">;
          notes?: string | null;
          store?: Enums<"install_store">;
          onboarded_at?: string | null;
          activated_at?: string | null;
          day3_return_at?: string | null;
          day7_return_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "referral_conversions_ambassador_id_fkey";
            columns: ["ambassador_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "referral_conversions_import_id_fkey";
            columns: ["import_id"];
            isOneToOne: false;
            referencedRelation: "referral_imports";
            referencedColumns: ["id"];
          },
        ];
      };

      achievements: {
        Row: {
          id: string;
          ambassador_id: string;
          title: string;
          note: string | null;
          awarded_at: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ambassador_id: string;
          title: string;
          note?: string | null;
          awarded_at?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          title?: string;
          note?: string | null;
          awarded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "achievements_ambassador_id_fkey";
            columns: ["ambassador_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      notifications: {
        Row: {
          id: string;
          profile_id: string;
          type: Enums<"notification_type">;
          title: string;
          body: string | null;
          /** Relative path only — enforced by a CHECK constraint. */
          href: string | null;
          meta: Json;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          type: Enums<"notification_type">;
          title: string;
          body?: string | null;
          href?: string | null;
          meta?: Json;
          read_at?: string | null;
          created_at?: string;
        };
        /** Students may only mark them read. */
        Update: { read_at?: string | null };
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      push_subscriptions: {
        Row: {
          id: string;
          profile_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
          last_used: string | null;
        };
        Insert: {
          id?: string;
          profile_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          created_at?: string;
          last_used?: string | null;
        };
        Update: {
          p256dh?: string;
          auth?: string;
          user_agent?: string | null;
          last_used?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      task_library: {
        Row: {
          id: string;
          slug: string;
          label: string;
          platform: string | null;
          instructions: string | null;
          proof_type: Enums<"proof_type">;
          cadence: Enums<"task_cadence">;
          default_points: number;
          active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          label: string;
          platform?: string | null;
          instructions?: string | null;
          proof_type?: Enums<"proof_type">;
          cadence?: Enums<"task_cadence">;
          default_points?: number;
          active?: boolean;
          created_by?: string | null;
        };
        Update: {
          slug?: string;
          label?: string;
          platform?: string | null;
          instructions?: string | null;
          proof_type?: Enums<"proof_type">;
          cadence?: Enums<"task_cadence">;
          default_points?: number;
          active?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_library_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      referral_clicks: {
        Row: {
          id: string;
          ambassador_id: string | null;
          code: string;
          store: Enums<"install_store">;
          ip_hash: string | null;
          user_agent: string | null;
          clicked_at: string;
        };
        Insert: {
          id?: string;
          ambassador_id?: string | null;
          code: string;
          store?: Enums<"install_store">;
          ip_hash?: string | null;
          user_agent?: string | null;
          clicked_at?: string;
        };
        Update: NoUpdate;
        Relationships: [
          {
            foreignKeyName: "referral_clicks_ambassador_id_fkey";
            columns: ["ambassador_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      redemption_requests: {
        Row: {
          id: string;
          ambassador_id: string;
          points: number;
          amount_inr: number;
          status: Enums<"redemption_status">;
          method: string;
          payee_ref: string | null;
          note: string | null;
          decided_by: string | null;
          decided_at: string | null;
          decision_note: string | null;
          requested_at: string;
        };
        Insert: {
          id?: string;
          ambassador_id: string;
          points: number;
          amount_inr: number;
          status?: Enums<"redemption_status">;
          method?: string;
          payee_ref?: string | null;
          note?: string | null;
        };
        Update: {
          status?: Enums<"redemption_status">;
          decided_by?: string | null;
          decided_at?: string | null;
          decision_note?: string | null;
          payee_ref?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "redemption_requests_ambassador_id_fkey";
            columns: ["ambassador_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      payout_batches: {
        Row: {
          id: string;
          label: string;
          kind: string;
          period_month: string | null;
          status: Enums<"payout_status">;
          created_by: string | null;
          created_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          label: string;
          kind?: string;
          period_month?: string | null;
          status?: Enums<"payout_status">;
          created_by?: string | null;
        };
        Update: {
          label?: string;
          status?: Enums<"payout_status">;
          processed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payout_batches_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      payouts: {
        Row: {
          id: string;
          batch_id: string | null;
          ambassador_id: string;
          redemption_id: string | null;
          kind: string;
          amount_inr: number;
          status: Enums<"payout_status">;
          utr: string | null;
          failure_reason: string | null;
          processed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          batch_id?: string | null;
          ambassador_id: string;
          redemption_id?: string | null;
          kind?: string;
          amount_inr: number;
          status?: Enums<"payout_status">;
          utr?: string | null;
        };
        Update: {
          status?: Enums<"payout_status">;
          utr?: string | null;
          failure_reason?: string | null;
          processed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payouts_ambassador_id_fkey";
            columns: ["ambassador_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payouts_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "payout_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payouts_redemption_id_fkey";
            columns: ["redemption_id"];
            isOneToOne: false;
            referencedRelation: "redemption_requests";
            referencedColumns: ["id"];
          },
        ];
      };

      badges: {
        Row: {
          id: string;
          slug: string;
          label: string;
          description: string;
          icon: string;
          tone: string;
          criteria: Json;
          active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          label: string;
          description: string;
          icon?: string;
          tone?: string;
          criteria: Json;
          active?: boolean;
          sort_order?: number;
        };
        Update: {
          label?: string;
          description?: string;
          icon?: string;
          tone?: string;
          criteria?: Json;
          active?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };

      /** One row per student per day they opened the app. */
      active_days: {
        Row: {
          ambassador_id: string;
          day: string;
        };
        Insert: {
          ambassador_id: string;
          day?: string;
        };
        Update: {
          ambassador_id?: string;
          day?: string;
        };
        Relationships: [];
      };
      badge_awards: {
        Row: {
          id: string;
          badge_id: string;
          ambassador_id: string;
          awarded_at: string;
          meta: Json;
        };
        Insert: {
          id?: string;
          badge_id: string;
          ambassador_id: string;
          awarded_at?: string;
          meta?: Json;
        };
        Update: NoUpdate;
        Relationships: [
          {
            foreignKeyName: "badge_awards_ambassador_id_fkey";
            columns: ["ambassador_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "badge_awards_badge_id_fkey";
            columns: ["badge_id"];
            isOneToOne: false;
            referencedRelation: "badges";
            referencedColumns: ["id"];
          },
        ];
      };

    };

    Views: Record<never, never>;

    Functions: {
      gen_referral_code: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_active_ambassador: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      ambassador_points: {
        Args: { target: string };
        Returns: number;
      };
      leaderboard: {
        Args: { limit_count?: number };
        Returns: {
          position: number;
          ambassador_id: string;
          full_name: string;
          college: string | null;
          points: number;
          is_me: boolean;
        }[];
      };
      my_standing: {
        Args: Record<PropertyKey, never>;
        Returns: { points: number; position: number; total: number }[];
      };
      ensure_survey_links: {
        Args: { target_survey: string };
        Returns: number;
      };
      my_survey_stats: {
        Args: Record<PropertyKey, never>;
        Returns: {
          survey_id: string;
          survey_title: string;
          slug: string;
          click_count: number;
          valid_responses: number;
          flagged: number;
          points_earned: number;
        }[];
      };
      my_referral_stats: {
        Args: Record<PropertyKey, never>;
        Returns: {
          code: string;
          total_confirmed: number;
          points_earned: number;
          last_conversion: string | null;
        }[];
      };
      my_streak: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      find_similar_submissions: {
        Args: {
          probe: string;
          max_distance?: number;
          exclude_id?: string | null;
        };
        Returns: {
          id: string;
          ambassador_id: string;
          distance: number;
          status: Enums<"submission_status">;
          uploaded_at: string;
        }[];
      };
      leaderboard_window: {
        Args: {
          window_key?: string;
          city_filter?: string | null;
          batch_filter?: string | null;
          phase_filter?: Enums<"program_phase"> | null;
          limit_count?: number;
        };
        Returns: {
          position: number;
          ambassador_id: string;
          full_name: string;
          college: string | null;
          city: string | null;
          batch: string | null;
          points: number;
          is_me: boolean;
        }[];
      };
      my_standing_window: {
        Args: { window_key?: string; phase_filter?: Enums<"program_phase"> | null };
        Returns: { points: number; position: number; total: number }[];
      };
      ambassador_completion: {
        Args: { target: string };
        Returns: {
          total_tasks: number;
          approved_tasks: number;
          completion_pct: number;
        }[];
      };
      completion_leaderboard: {
        Args: { limit_count?: number };
        Returns: {
          position: number;
          ambassador_id: string;
          full_name: string;
          college: string | null;
          batch: string | null;
          total_tasks: number;
          approved_tasks: number;
          completion_pct: number;
          is_me: boolean;
        }[];
      };
      batch_standings: {
        Args: { window_key?: string };
        Returns: {
          batch: string;
          members: number;
          points: number;
          avg_points: number;
          downloads: number;
        }[];
      };
      stipend_eligibility: {
        Args: { period_start: string };
        Returns: {
          ambassador_id: string;
          full_name: string;
          city: string | null;
          batch: string | null;
          total_tasks: number;
          approved_tasks: number;
          completion_pct: number;
          met: boolean;
          at_risk: boolean;
          total_inr: number;
          active_days: number;
          inactive: boolean;
        }[];
      };
      my_stipend_progress: {
        Args: { months_back?: number };
        Returns: {
          period: string;
          total_tasks: number;
          approved_tasks: number;
          completion_pct: number;
          met: boolean;
          total_inr: number;
          paid_status: string;
        }[];
      };
      /** Records that the signed-in student was on the app today. */
      touch_active_day: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      public_stats: {
        Args: Record<PropertyKey, never>;
        Returns: {
          ambassadors: number;
          responses: number;
          points: number;
          downloads: number;
        }[];
      };
      /** Atomic `click_count + 1`, so concurrent visits stop overwriting each other. */
      bump_survey_click: {
        Args: { link_id: string; amount?: number };
        Returns: undefined;
      };
      /** Atomically admits or rejects one survey response under a per-survey lock. */
      submit_survey_response_atomic: {
        Args: {
          p_survey_link_id: string;
          p_participant_user_id: string | null;
          p_respondent_name: string | null;
          p_respondent_email: string | null;
          p_respondent_phone: string | null;
          p_ip_hash: string | null;
          p_user_agent: string | null;
          p_ip_window_minutes: number;
        };
        Returns: {
          outcome: string;
          response_id: string | null;
          response_status: string | null;
        }[];
      };
      /** Atomically approves one submission and settles its point credit. */
      approve_submission_atomic: {
        Args: {
          p_submission_id: string;
          p_actor_id: string;
          p_note: string | null;
        };
        Returns: {
          outcome: string;
          ambassador_id: string | null;
          points: number;
          credited: number;
        }[];
      };
    };

    Enums: {
      program_phase: "phase_1" | "phase_2";
      joined_as: "student" | "professional";
      install_store: "play_store" | "app_store" | "unknown";
      proof_type: "screenshot" | "link" | "text" | "none";
      task_cadence: "daily" | "twice_weekly" | "weekly" | "milestone" | "once";
      payout_status: "pending" | "processing" | "paid" | "failed";
      redemption_status: "requested" | "approved" | "rejected" | "paid";
      user_role: "admin" | "ambassador";
      user_status: "invited" | "active" | "suspended";
      ledger_reason:
        | "survey_response"
        | "instagram_task"
        | "referral"
        | "manual_adjust"
        | "revoke";
      survey_status: "draft" | "live" | "closed";
      survey_audience: "public" | "participant";
      response_status: "valid" | "duplicate" | "flagged" | "rejected";
      question_type:
        | "short_text"
        | "long_text"
        | "single_choice"
        | "multi_choice"
        | "rating"
        | "number"
        | "email"
        | "phone";
      campaign_status: "draft" | "live" | "ended" | "archived";
      task_type: "like" | "comment" | "share" | "story";
      submission_status:
        | "pending"
        | "auto_approved"
        | "needs_review"
        | "approved"
        | "rejected"
        | "revoked";
      notification_type:
        | "submission_approved"
        | "submission_rejected"
        | "submission_revoked"
        | "points_awarded"
        | "campaign_live"
        | "survey_live"
        | "rank_up"
        | "referral_confirmed"
        | "account";
      conversion_source: "csv_import" | "manual" | "api";
      conversion_status: "counted" | "void";
    };

    CompositeTypes: Record<never, never>;
  };
};

// ─── Convenience aliases ─────────────────────────────────────────────────────

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];

export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];

export type FunctionReturns<T extends keyof PublicSchema["Functions"]> =
  PublicSchema["Functions"][T]["Returns"];
