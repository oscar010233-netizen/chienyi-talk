// Auto-generated shape: hand-written from lib/db/schema.ts.
// Re-run `supabase gen types typescript --project-id pmoyvpnbbitnigchvluz > lib/db/database.types.ts`
// after any migration to keep this in sync.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          tenant_id: string
          role: string
          display_name: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          role: string
          display_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          role?: string
          display_name?: string | null
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "profiles_tenant_id_fkey"; columns: ["tenant_id"]; referencedRelation: "tenants"; referencedColumns: ["id"] }
        ]
      }
      classes: {
        Row: {
          id: string
          tenant_id: string
          class_name: string
          class_code: string | null
          department: string | null
          level: string | null
          class_type: string | null
          weekday1: number | null
          weekday2: number | null
          system_sessions: number | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          class_name: string
          class_code?: string | null
          department?: string | null
          level?: string | null
          class_type?: string | null
          weekday1?: number | null
          weekday2?: number | null
          system_sessions?: number | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          class_name?: string
          class_code?: string | null
          department?: string | null
          level?: string | null
          class_type?: string | null
          weekday1?: number | null
          weekday2?: number | null
          system_sessions?: number | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "classes_tenant_id_fkey"; columns: ["tenant_id"]; referencedRelation: "tenants"; referencedColumns: ["id"] }
        ]
      }
      students: {
        Row: {
          id: string
          tenant_id: string
          chinese_name: string
          english_name: string | null
          status: string
          school: string | null
          grade: string | null
          note: string | null
          parent_name: string | null
          parent_phone: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          chinese_name: string
          english_name?: string | null
          status?: string
          school?: string | null
          grade?: string | null
          note?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          chinese_name?: string
          english_name?: string | null
          status?: string
          school?: string | null
          grade?: string | null
          note?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "students_tenant_id_fkey"; columns: ["tenant_id"]; referencedRelation: "tenants"; referencedColumns: ["id"] }
        ]
      }
      class_enrollments: {
        Row: {
          id: string
          tenant_id: string
          class_id: string
          student_id: string
          status: string
          slot_order: number | null
          joined_at: string | null
          left_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          class_id: string
          student_id: string
          status?: string
          slot_order?: number | null
          joined_at?: string | null
          left_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          class_id?: string
          student_id?: string
          status?: string
          slot_order?: number | null
          joined_at?: string | null
          left_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "class_enrollments_class_id_fkey"; columns: ["class_id"]; referencedRelation: "classes"; referencedColumns: ["id"] },
          { foreignKeyName: "class_enrollments_student_id_fkey"; columns: ["student_id"]; referencedRelation: "students"; referencedColumns: ["id"] }
        ]
      }
      class_tasks: {
        Row: {
          id: string
          tenant_id: string
          class_id: string
          default_attendance_id: string | null
          week_label: string | null
          lesson_label: string | null
          task_type: string
          task_name: string | null
          threshold_value: number | null
          max_score: number | null
          threshold_text: string | null
          display_order: number | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          class_id: string
          default_attendance_id?: string | null
          week_label?: string | null
          lesson_label?: string | null
          task_type: string
          task_name?: string | null
          threshold_value?: number | null
          max_score?: number | null
          threshold_text?: string | null
          display_order?: number | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          class_id?: string
          default_attendance_id?: string | null
          week_label?: string | null
          lesson_label?: string | null
          task_type?: string
          task_name?: string | null
          threshold_value?: number | null
          max_score?: number | null
          threshold_text?: string | null
          display_order?: number | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "class_tasks_class_id_fkey"; columns: ["class_id"]; referencedRelation: "classes"; referencedColumns: ["id"] },
          { foreignKeyName: "class_tasks_default_attendance_id_fkey"; columns: ["default_attendance_id"]; referencedRelation: "default_attendance"; referencedColumns: ["id"] }
        ]
      }
      student_task_records: {
        Row: {
          id: string
          tenant_id: string
          class_task_id: string
          student_id: string
          status: string | null
          latest_result: string | null
          result_history: Json | null
          teacher_note: string | null
          comment_text: string | null
          comment_status: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          class_task_id: string
          student_id: string
          status?: string | null
          latest_result?: string | null
          result_history?: Json | null
          teacher_note?: string | null
          comment_text?: string | null
          comment_status?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          class_task_id?: string
          student_id?: string
          status?: string | null
          latest_result?: string | null
          result_history?: Json | null
          teacher_note?: string | null
          comment_text?: string | null
          comment_status?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "student_task_records_class_task_id_fkey"; columns: ["class_task_id"]; referencedRelation: "class_tasks"; referencedColumns: ["id"] },
          { foreignKeyName: "student_task_records_student_id_fkey"; columns: ["student_id"]; referencedRelation: "students"; referencedColumns: ["id"] }
        ]
      }
      rooms: {
        Row: {
          id: string
          tenant_id: string
          name: string
          room_type: string | null
          display_order: number | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          room_type?: string | null
          display_order?: number | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          room_type?: string | null
          display_order?: number | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_days: {
        Row: {
          id: string
          tenant_id: string
          date: string
          weekday: number | null
          note: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          date: string
          weekday?: number | null
          note?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          date?: string
          weekday?: number | null
          note?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_events: {
        Row: {
          id: string
          tenant_id: string
          schedule_day_id: string
          room_id: string | null
          class_id: string | null
          title: string | null
          event_type: string | null
          start_time: string | null
          end_time: string | null
          color: string | null
          note: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          schedule_day_id: string
          room_id?: string | null
          class_id?: string | null
          title?: string | null
          event_type?: string | null
          start_time?: string | null
          end_time?: string | null
          color?: string | null
          note?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          schedule_day_id?: string
          room_id?: string | null
          class_id?: string | null
          title?: string | null
          event_type?: string | null
          start_time?: string | null
          end_time?: string | null
          color?: string | null
          note?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "schedule_events_schedule_day_id_fkey"; columns: ["schedule_day_id"]; referencedRelation: "schedule_days"; referencedColumns: ["id"] },
          { foreignKeyName: "schedule_events_class_id_fkey"; columns: ["class_id"]; referencedRelation: "classes"; referencedColumns: ["id"] },
          { foreignKeyName: "schedule_events_room_id_fkey"; columns: ["room_id"]; referencedRelation: "rooms"; referencedColumns: ["id"] }
        ]
      }
      schedule_event_teachers: {
        Row: {
          id: string
          tenant_id: string
          schedule_event_id: string
          teacher_id: string
          start_time: string | null
          end_time: string | null
          color: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          schedule_event_id: string
          teacher_id: string
          start_time?: string | null
          end_time?: string | null
          color?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          schedule_event_id?: string
          teacher_id?: string
          start_time?: string | null
          end_time?: string | null
          color?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "schedule_event_teachers_schedule_event_id_fkey"; columns: ["schedule_event_id"]; referencedRelation: "schedule_events"; referencedColumns: ["id"] }
        ]
      }
      day_entries: {
        Row: {
          id: string
          tenant_id: string
          schedule_day_id: string
          type: string | null
          person: string | null
          content: string | null
          done: boolean | null
          notes: string | null
          sort_order: number | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          schedule_day_id: string
          type?: string | null
          person?: string | null
          content?: string | null
          done?: boolean | null
          notes?: string | null
          sort_order?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          schedule_day_id?: string
          type?: string | null
          person?: string | null
          content?: string | null
          done?: boolean | null
          notes?: string | null
          sort_order?: number | null
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "day_entries_schedule_day_id_fkey"; columns: ["schedule_day_id"]; referencedRelation: "schedule_days"; referencedColumns: ["id"] }
        ]
      }
      billing_seasons: {
        Row: {
          id: string
          tenant_id: string
          season_code: string
          year: number | null
          quarter: number | null
          start_date: string | null
          end_date: string | null
          label: string | null
          status: string
          holiday_dates: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          season_code: string
          year?: number | null
          quarter?: number | null
          start_date?: string | null
          end_date?: string | null
          label?: string | null
          status?: string
          holiday_dates?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          season_code?: string
          year?: number | null
          quarter?: number | null
          start_date?: string | null
          end_date?: string | null
          label?: string | null
          status?: string
          holiday_dates?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      default_attendance: {
        Row: {
          id: string
          tenant_id: string
          season_id: string
          class_id: string
          session_index: number | null
          default_date: string | null
          original_date: string | null
          period_key: string | null
          status: string
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          season_id: string
          class_id: string
          session_index?: number | null
          default_date?: string | null
          original_date?: string | null
          period_key?: string | null
          status?: string
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          season_id?: string
          class_id?: string
          session_index?: number | null
          default_date?: string | null
          original_date?: string | null
          period_key?: string | null
          status?: string
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "default_attendance_season_id_fkey"; columns: ["season_id"]; referencedRelation: "billing_seasons"; referencedColumns: ["id"] },
          { foreignKeyName: "default_attendance_class_id_fkey"; columns: ["class_id"]; referencedRelation: "classes"; referencedColumns: ["id"] }
        ]
      }
      payment_bags: {
        Row: {
          id: string
          tenant_id: string
          season_id: string
          class_id: string
          bag_code: string | null
          issue_date: string | null
          due_date: string | null
          status: string
          tuition_note: string | null
          note: string | null
          print_count: number | null
          last_printed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          season_id: string
          class_id: string
          bag_code?: string | null
          issue_date?: string | null
          due_date?: string | null
          status?: string
          tuition_note?: string | null
          note?: string | null
          print_count?: number | null
          last_printed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          season_id?: string
          class_id?: string
          bag_code?: string | null
          issue_date?: string | null
          due_date?: string | null
          status?: string
          tuition_note?: string | null
          note?: string | null
          print_count?: number | null
          last_printed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "payment_bags_season_id_fkey"; columns: ["season_id"]; referencedRelation: "billing_seasons"; referencedColumns: ["id"] },
          { foreignKeyName: "payment_bags_class_id_fkey"; columns: ["class_id"]; referencedRelation: "classes"; referencedColumns: ["id"] }
        ]
      }
      payment_bag_lines: {
        Row: {
          id: string
          tenant_id: string
          bag_id: string
          student_id: string
          student_order: number | null
          session_count: number | null
          rate_per_session: number | null
          tuition_amount: number | null
          book_name: string | null
          book_fee: number | null
          misc_label: string | null
          misc_fee: number | null
          discount_label: string | null
          discount_amount: number | null
          carryover_amount: number | null
          carryover_note: string | null
          adjustment_label: string | null
          adjustment_amount: number | null
          total_amount: number | null
          issue_status: string | null
          paid_amount: number | null
          intro_card_received: boolean | null
          handler: string | null
          payment_status: string | null
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          bag_id: string
          student_id: string
          student_order?: number | null
          session_count?: number | null
          rate_per_session?: number | null
          tuition_amount?: number | null
          book_name?: string | null
          book_fee?: number | null
          misc_label?: string | null
          misc_fee?: number | null
          discount_label?: string | null
          discount_amount?: number | null
          carryover_amount?: number | null
          carryover_note?: string | null
          adjustment_label?: string | null
          adjustment_amount?: number | null
          total_amount?: number | null
          issue_status?: string | null
          paid_amount?: number | null
          intro_card_received?: boolean | null
          handler?: string | null
          payment_status?: string | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          bag_id?: string
          student_id?: string
          student_order?: number | null
          session_count?: number | null
          rate_per_session?: number | null
          tuition_amount?: number | null
          book_name?: string | null
          book_fee?: number | null
          misc_label?: string | null
          misc_fee?: number | null
          discount_label?: string | null
          discount_amount?: number | null
          carryover_amount?: number | null
          carryover_note?: string | null
          adjustment_label?: string | null
          adjustment_amount?: number | null
          total_amount?: number | null
          issue_status?: string | null
          paid_amount?: number | null
          intro_card_received?: boolean | null
          handler?: string | null
          payment_status?: string | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "payment_bag_lines_bag_id_fkey"; columns: ["bag_id"]; referencedRelation: "payment_bags"; referencedColumns: ["id"] },
          { foreignKeyName: "payment_bag_lines_student_id_fkey"; columns: ["student_id"]; referencedRelation: "students"; referencedColumns: ["id"] }
        ]
      }
      billing_fee_presets: {
        Row: {
          id: string
          tenant_id: string
          class_id: string | null
          name: string
          tuition_amount: number | null
          book_rows: Json | null
          misc_rows: Json | null
          discount_rows: Json | null
          is_default: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          class_id?: string | null
          name: string
          tuition_amount?: number | null
          book_rows?: Json | null
          misc_rows?: Json | null
          discount_rows?: Json | null
          is_default?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          class_id?: string | null
          name?: string
          tuition_amount?: number | null
          book_rows?: Json | null
          misc_rows?: Json | null
          discount_rows?: Json | null
          is_default?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "billing_fee_presets_class_id_fkey"; columns: ["class_id"]; referencedRelation: "classes"; referencedColumns: ["id"] }
        ]
      }
      audit_log: {
        Row: {
          id: number
          table_name: string
          op: string
          row_id: string | null
          changed_columns: string[] | null
          old_data: Json | null
          new_data: Json | null
          actor: string | null
          created_at: string
        }
        Insert: {
          id?: number
          table_name: string
          op: string
          row_id?: string | null
          changed_columns?: string[] | null
          old_data?: Json | null
          new_data?: Json | null
          actor?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          table_name?: string
          op?: string
          row_id?: string | null
          changed_columns?: string[] | null
          old_data?: Json | null
          new_data?: Json | null
          actor?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

// Convenience helpers — same pattern as Supabase-generated files.
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
