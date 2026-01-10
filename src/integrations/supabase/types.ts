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
      arbitrage_notifications: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          last_notified_at: string | null
          profit_threshold: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          last_notified_at?: string | null
          profit_threshold?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          last_notified_at?: string | null
          profit_threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      markets: {
        Row: {
          close_time: string | null
          condition_id: string | null
          created_at: string | null
          end_time: string | null
          event_slug: string | null
          id: string
          kalshi_event_ticker: string | null
          kalshi_ticker: string | null
          last_price_updated_at: string | null
          last_updated: string | null
          market_slug: string | null
          platform: string
          side_a_label: string | null
          side_a_price: number | null
          side_a_probability: number | null
          side_a_token_id: string | null
          side_b_label: string | null
          side_b_price: number | null
          side_b_probability: number | null
          side_b_token_id: string | null
          start_time: string | null
          status: string | null
          title: string
          volume: number | null
          volume_24h: number | null
        }
        Insert: {
          close_time?: string | null
          condition_id?: string | null
          created_at?: string | null
          end_time?: string | null
          event_slug?: string | null
          id: string
          kalshi_event_ticker?: string | null
          kalshi_ticker?: string | null
          last_price_updated_at?: string | null
          last_updated?: string | null
          market_slug?: string | null
          platform: string
          side_a_label?: string | null
          side_a_price?: number | null
          side_a_probability?: number | null
          side_a_token_id?: string | null
          side_b_label?: string | null
          side_b_price?: number | null
          side_b_probability?: number | null
          side_b_token_id?: string | null
          start_time?: string | null
          status?: string | null
          title: string
          volume?: number | null
          volume_24h?: number | null
        }
        Update: {
          close_time?: string | null
          condition_id?: string | null
          created_at?: string | null
          end_time?: string | null
          event_slug?: string | null
          id?: string
          kalshi_event_ticker?: string | null
          kalshi_ticker?: string | null
          last_price_updated_at?: string | null
          last_updated?: string | null
          market_slug?: string | null
          platform?: string
          side_a_label?: string | null
          side_a_price?: number | null
          side_a_probability?: number | null
          side_a_token_id?: string | null
          side_b_label?: string | null
          side_b_price?: number | null
          side_b_probability?: number | null
          side_b_token_id?: string | null
          start_time?: string | null
          status?: string | null
          title?: string
          volume?: number | null
          volume_24h?: number | null
        }
        Relationships: []
      }
      mismatch_reports: {
        Row: {
          created_at: string
          device_id: string
          id: string
          kalshi_id: string
          kalshi_ticker: string | null
          kalshi_title: string
          match_reason: string | null
          match_score: number
          polymarket_id: string
          polymarket_slug: string | null
          polymarket_title: string
          report_reason: string | null
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          kalshi_id: string
          kalshi_ticker?: string | null
          kalshi_title: string
          match_reason?: string | null
          match_score: number
          polymarket_id: string
          polymarket_slug?: string | null
          polymarket_title: string
          report_reason?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          kalshi_id?: string
          kalshi_ticker?: string | null
          kalshi_title?: string
          match_reason?: string | null
          match_score?: number
          polymarket_id?: string
          polymarket_slug?: string | null
          polymarket_title?: string
          report_reason?: string | null
        }
        Relationships: []
      }
      scan_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          kalshi_found: number | null
          polymarket_found: number | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          kalshi_found?: number | null
          polymarket_found?: number | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          kalshi_found?: number | null
          polymarket_found?: number | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      watchlist_items: {
        Row: {
          created_at: string
          device_id: string
          display_name: string
          id: string
          kalshi_ticker: string
          match_score: number
          polymarket_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          display_name: string
          id?: string
          kalshi_ticker: string
          match_score?: number
          polymarket_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          display_name?: string
          id?: string
          kalshi_ticker?: string
          match_score?: number
          polymarket_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
