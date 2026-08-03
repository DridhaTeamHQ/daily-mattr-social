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
          created_at: string;
          updated_at: string;
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
          created_at?: string;
          updated_at?: string;
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
          created_at?: string;
          updated_at?: string;
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
          created_by: string | null;
          created_at: string;
          updated_at: string;
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
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
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
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
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
          type: Enums<"task_type">;
          points: number;
          instructions: string | null;
          required: boolean;
          order_index: number;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          type: Enums<"task_type">;
          points?: number;
          instructions?: string | null;
          required?: boolean;
          order_index?: number;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          type?: Enums<"task_type">;
          points?: number;
          instructions?: string | null;
          required?: boolean;
          order_index?: number;
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
          screenshot_path: string;
          sha256: string;
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
        };
        Insert: {
          id?: string;
          campaign_task_id: string;
          ambassador_id: string;
          attempt?: number;
          screenshot_path: string;
          sha256: string;
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
        };
        /** Voiding a conversion is the only edit; the fact of it stays. */
        Update: {
          status?: Enums<"conversion_status">;
          notes?: string | null;
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
    };

    Enums: {
      user_role: "admin" | "ambassador";
      user_status: "invited" | "active" | "suspended";
      ledger_reason:
        | "survey_response"
        | "instagram_task"
        | "referral"
        | "manual_adjust"
        | "revoke";
      survey_status: "draft" | "live" | "closed";
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
      campaign_status: "draft" | "live" | "ended";
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
