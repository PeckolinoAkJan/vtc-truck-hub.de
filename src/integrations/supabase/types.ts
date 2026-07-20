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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      driver_tracks: {
        Row: {
          game: string | null
          points: Json
          session_started_at: string
          updated_at: string
          user_id: string
          vtc_id: string | null
        }
        Insert: {
          game?: string | null
          points?: Json
          session_started_at?: string
          updated_at?: string
          user_id: string
          vtc_id?: string | null
        }
        Update: {
          game?: string | null
          points?: Json
          session_started_at?: string
          updated_at?: string
          user_id?: string
          vtc_id?: string | null
        }
        Relationships: []
      }
      game_cities: {
        Row: {
          country: string | null
          game: string
          id: number
          name: string
          x: number
          z: number
        }
        Insert: {
          country?: string | null
          game: string
          id?: number
          name: string
          x: number
          z: number
        }
        Update: {
          country?: string | null
          game?: string
          id?: number
          name?: string
          x?: number
          z?: number
        }
        Relationships: []
      }
      game_pois: {
        Row: {
          game: string
          id: number
          kind: string
          name: string
          x: number
          z: number
        }
        Insert: {
          game: string
          id?: number
          kind: string
          name: string
          x: number
          z: number
        }
        Update: {
          game?: string
          id?: number
          kind?: string
          name?: string
          x?: number
          z?: number
        }
        Relationships: []
      }
      global_stats: {
        Row: {
          active_drivers: number
          active_jobs: number
          id: number
          total_jobs: number
          total_km: number
          total_profit: number
          total_revenue: number
          updated_at: string
        }
        Insert: {
          active_drivers?: number
          active_jobs?: number
          id?: number
          total_jobs?: number
          total_km?: number
          total_profit?: number
          total_revenue?: number
          updated_at?: string
        }
        Update: {
          active_drivers?: number
          active_jobs?: number
          id?: number
          total_jobs?: number
          total_km?: number
          total_profit?: number
          total_revenue?: number
          updated_at?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          cargo: string
          cargo_mass_kg: number | null
          created_at: string
          damage_pct: number
          dest_city: string
          distance_km: number
          driver_id: string
          finished_at: string | null
          fuel_cost: number
          game: Database["public"]["Enums"]["game_type"]
          id: string
          odometer_end_km: number | null
          odometer_start_km: number | null
          paid_at: string | null
          payout_amount: number | null
          revenue: number
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_city: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          submitted_at: string
          truck: string | null
          updated_at: string
          vtc_id: string
        }
        Insert: {
          cargo: string
          cargo_mass_kg?: number | null
          created_at?: string
          damage_pct?: number
          dest_city: string
          distance_km?: number
          driver_id: string
          finished_at?: string | null
          fuel_cost?: number
          game?: Database["public"]["Enums"]["game_type"]
          id?: string
          odometer_end_km?: number | null
          odometer_start_km?: number | null
          paid_at?: string | null
          payout_amount?: number | null
          revenue?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_city: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          submitted_at?: string
          truck?: string | null
          updated_at?: string
          vtc_id: string
        }
        Update: {
          cargo?: string
          cargo_mass_kg?: number | null
          created_at?: string
          damage_pct?: number
          dest_city?: string
          distance_km?: number
          driver_id?: string
          finished_at?: string | null
          fuel_cost?: number
          game?: Database["public"]["Enums"]["game_type"]
          id?: string
          odometer_end_km?: number | null
          odometer_start_km?: number | null
          paid_at?: string | null
          payout_amount?: number | null
          revenue?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_city?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          submitted_at?: string
          truck?: string | null
          updated_at?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          created_at: string
          id: string
          message: string
          sender_id: string
          sender_name: string
          vtc_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          sender_id: string
          sender_name: string
          vtc_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          sender_id?: string
          sender_name?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_secrets: {
        Row: {
          client_key: string
          created_at: string
          rotated_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_key?: string
          created_at?: string
          rotated_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_key?: string
          created_at?: string
          rotated_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          balance: number
          created_at: string
          discord_id: string | null
          display_name: string
          live_visibility: Database["public"]["Enums"]["live_visibility"]
          real_name: string | null
          share_live_track: boolean
          steam_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          balance?: number
          created_at?: string
          discord_id?: string | null
          display_name: string
          live_visibility?: Database["public"]["Enums"]["live_visibility"]
          real_name?: string | null
          share_live_track?: boolean
          steam_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          balance?: number
          created_at?: string
          discord_id?: string | null
          display_name?: string
          live_visibility?: Database["public"]["Enums"]["live_visibility"]
          real_name?: string | null
          share_live_track?: boolean
          steam_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      settlement_activity: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          meta: Json
          settlement_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          meta?: Json
          settlement_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          meta?: Json
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_activity_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_adjustments: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["settlement_adjustment_kind"]
          note: string | null
          settlement_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["settlement_adjustment_kind"]
          note?: string | null
          settlement_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["settlement_adjustment_kind"]
          note?: string | null
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_adjustments_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_disputes: {
        Row: {
          created_at: string
          id: string
          message: string
          opened_by: string
          responded_at: string | null
          responded_by: string | null
          response: string | null
          settlement_id: string
          status: Database["public"]["Enums"]["settlement_dispute_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          opened_by: string
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          settlement_id: string
          status?: Database["public"]["Enums"]["settlement_dispute_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          opened_by?: string
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          settlement_id?: string
          status?: Database["public"]["Enums"]["settlement_dispute_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_disputes_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_jobs: {
        Row: {
          created_at: string
          job_id: string
          settlement_id: string
        }
        Insert: {
          created_at?: string
          job_id: string
          settlement_id: string
        }
        Update: {
          created_at?: string
          job_id?: string
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_jobs_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          base_pay: number
          bonus_total: number
          created_at: string
          created_by: string | null
          deduction_total: number
          driver_id: string
          final_amount: number | null
          id: string
          jobs_count: number
          note: string | null
          number: string | null
          paid_at: string | null
          paid_by: string | null
          pay_model: Database["public"]["Enums"]["settlement_pay_model"]
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["settlement_status"]
          total_km: number
          updated_at: string
          vtc_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          base_pay?: number
          bonus_total?: number
          created_at?: string
          created_by?: string | null
          deduction_total?: number
          driver_id: string
          final_amount?: number | null
          id?: string
          jobs_count?: number
          note?: string | null
          number?: string | null
          paid_at?: string | null
          paid_by?: string | null
          pay_model?: Database["public"]["Enums"]["settlement_pay_model"]
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["settlement_status"]
          total_km?: number
          updated_at?: string
          vtc_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          base_pay?: number
          bonus_total?: number
          created_at?: string
          created_by?: string | null
          deduction_total?: number
          driver_id?: string
          final_amount?: number | null
          id?: string
          jobs_count?: number
          note?: string | null
          number?: string | null
          paid_at?: string | null
          paid_by?: string | null
          pay_model?: Database["public"]["Enums"]["settlement_pay_model"]
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["settlement_status"]
          total_km?: number
          updated_at?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visits: {
        Row: {
          count: number
          id: number
          updated_at: string
        }
        Insert: {
          count?: number
          id?: number
          updated_at?: string
        }
        Update: {
          count?: number
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      telemetry_data: {
        Row: {
          cargo: string | null
          cargo_mass_kg: number | null
          created_at: string
          damage_cabin: number | null
          damage_chassis: number | null
          damage_engine: number | null
          damage_pct: number | null
          damage_transmission: number | null
          damage_wheels: number | null
          dest_city: string | null
          driver_id: string
          driving_time_today_min: number | null
          fuel: number | null
          fuel_capacity: number | null
          fuel_consumption_avg: number | null
          fuel_level: number | null
          game: string | null
          heading: number | null
          id: string
          job_distance_km: number | null
          job_remaining_km: number | null
          position_x: number | null
          position_y: number | null
          position_z: number | null
          raw: Json
          rest_time_remaining_min: number | null
          source_city: string | null
          speed_kmh: number | null
          status: string
          truck_brand: string | null
          truck_model: string | null
          truck_plate: string | null
          updated_at: string
          vehicle_id: string | null
          vtc_id: string
        }
        Insert: {
          cargo?: string | null
          cargo_mass_kg?: number | null
          created_at?: string
          damage_cabin?: number | null
          damage_chassis?: number | null
          damage_engine?: number | null
          damage_pct?: number | null
          damage_transmission?: number | null
          damage_wheels?: number | null
          dest_city?: string | null
          driver_id: string
          driving_time_today_min?: number | null
          fuel?: number | null
          fuel_capacity?: number | null
          fuel_consumption_avg?: number | null
          fuel_level?: number | null
          game?: string | null
          heading?: number | null
          id?: string
          job_distance_km?: number | null
          job_remaining_km?: number | null
          position_x?: number | null
          position_y?: number | null
          position_z?: number | null
          raw?: Json
          rest_time_remaining_min?: number | null
          source_city?: string | null
          speed_kmh?: number | null
          status?: string
          truck_brand?: string | null
          truck_model?: string | null
          truck_plate?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vtc_id: string
        }
        Update: {
          cargo?: string | null
          cargo_mass_kg?: number | null
          created_at?: string
          damage_cabin?: number | null
          damage_chassis?: number | null
          damage_engine?: number | null
          damage_pct?: number | null
          damage_transmission?: number | null
          damage_wheels?: number | null
          dest_city?: string | null
          driver_id?: string
          driving_time_today_min?: number | null
          fuel?: number | null
          fuel_capacity?: number | null
          fuel_consumption_avg?: number | null
          fuel_level?: number | null
          game?: string | null
          heading?: number | null
          id?: string
          job_distance_km?: number | null
          job_remaining_km?: number | null
          position_x?: number | null
          position_y?: number | null
          position_z?: number | null
          raw?: Json
          rest_time_remaining_min?: number | null
          source_city?: string | null
          speed_kmh?: number | null
          status?: string
          truck_brand?: string | null
          truck_model?: string | null
          truck_plate?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_data_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_data_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_data_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      telemetry_events: {
        Row: {
          driver_id: string | null
          event_type: string
          id: string
          job_id: string | null
          payload: Json
          received_at: string
          vtc_id: string
        }
        Insert: {
          driver_id?: string | null
          event_type: string
          id?: string
          job_id?: string | null
          payload?: Json
          received_at?: string
          vtc_id: string
        }
        Update: {
          driver_id?: string | null
          event_type?: string
          id?: string
          job_id?: string | null
          payload?: Json
          received_at?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_events_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_events_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_events_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_condition: {
        Row: {
          body_pct: number | null
          brakes_pct: number | null
          chassis_pct: number | null
          created_at: string
          engine_pct: number | null
          gearbox_pct: number | null
          tires_pct: number | null
          updated_at: string
          vehicle_id: string
          vtc_id: string
        }
        Insert: {
          body_pct?: number | null
          brakes_pct?: number | null
          chassis_pct?: number | null
          created_at?: string
          engine_pct?: number | null
          gearbox_pct?: number | null
          tires_pct?: number | null
          updated_at?: string
          vehicle_id: string
          vtc_id: string
        }
        Update: {
          body_pct?: number | null
          brakes_pct?: number | null
          chassis_pct?: number | null
          created_at?: string
          engine_pct?: number | null
          gearbox_pct?: number | null
          tires_pct?: number | null
          updated_at?: string
          vehicle_id?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_condition_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_condition_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_condition_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_condition_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_details: {
        Row: {
          axles: number | null
          color: string | null
          created_at: string
          cylinders: number | null
          dlc: string[] | null
          engine_hp: number | null
          engine_torque_nm: number | null
          fuel_level_pct: number | null
          fuel_tank_l: number | null
          game: string | null
          gearbox: string | null
          image_url: string | null
          location: string | null
          notes: string | null
          odometer_km: number | null
          purchase_date: string | null
          purchase_price: number | null
          reserved_by: string | null
          reserved_until: string | null
          retired_at: string | null
          updated_at: string
          vehicle_code: string | null
          vehicle_id: string
          vtc_id: string
          year: number | null
        }
        Insert: {
          axles?: number | null
          color?: string | null
          created_at?: string
          cylinders?: number | null
          dlc?: string[] | null
          engine_hp?: number | null
          engine_torque_nm?: number | null
          fuel_level_pct?: number | null
          fuel_tank_l?: number | null
          game?: string | null
          gearbox?: string | null
          image_url?: string | null
          location?: string | null
          notes?: string | null
          odometer_km?: number | null
          purchase_date?: string | null
          purchase_price?: number | null
          reserved_by?: string | null
          reserved_until?: string | null
          retired_at?: string | null
          updated_at?: string
          vehicle_code?: string | null
          vehicle_id: string
          vtc_id: string
          year?: number | null
        }
        Update: {
          axles?: number | null
          color?: string | null
          created_at?: string
          cylinders?: number | null
          dlc?: string[] | null
          engine_hp?: number | null
          engine_torque_nm?: number | null
          fuel_level_pct?: number | null
          fuel_tank_l?: number | null
          game?: string | null
          gearbox?: string | null
          image_url?: string | null
          location?: string | null
          notes?: string | null
          odometer_km?: number | null
          purchase_date?: string | null
          purchase_price?: number | null
          reserved_by?: string | null
          reserved_until?: string | null
          retired_at?: string | null
          updated_at?: string
          vehicle_code?: string | null
          vehicle_id?: string
          vtc_id?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_details_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_details_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_details_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_details_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_documents: {
        Row: {
          created_at: string
          doc_type: string
          file_size: number | null
          id: string
          mime_type: string | null
          storage_path: string
          title: string
          uploader_id: string | null
          valid_until: string | null
          vehicle_id: string
          version: number
          vtc_id: string
        }
        Insert: {
          created_at?: string
          doc_type: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          storage_path: string
          title: string
          uploader_id?: string | null
          valid_until?: string | null
          vehicle_id: string
          version?: number
          vtc_id: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          storage_path?: string
          title?: string
          uploader_id?: string | null
          valid_until?: string | null
          vehicle_id?: string
          version?: number
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_documents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_documents_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_documents_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_documents_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_history: {
        Row: {
          actor_id: string | null
          cost: number | null
          created_at: string
          description: string | null
          driver_id: string | null
          event_type: string
          id: string
          meta: Json | null
          odometer_km: number | null
          vehicle_id: string
          vtc_id: string
        }
        Insert: {
          actor_id?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          driver_id?: string | null
          event_type: string
          id?: string
          meta?: Json | null
          odometer_km?: number | null
          vehicle_id: string
          vtc_id: string
        }
        Update: {
          actor_id?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          driver_id?: string | null
          event_type?: string
          id?: string
          meta?: Json | null
          odometer_km?: number | null
          vehicle_id?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_history_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_history_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_history_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_history_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_maintenance_schedule: {
        Row: {
          created_at: string
          id: string
          interval_days: number | null
          interval_km: number | null
          kind: string
          last_service_at: string | null
          last_service_km: number | null
          next_due_at: string | null
          next_due_km: number | null
          note: string | null
          updated_at: string
          vehicle_id: string
          vtc_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          interval_days?: number | null
          interval_km?: number | null
          kind: string
          last_service_at?: string | null
          last_service_km?: number | null
          next_due_at?: string | null
          next_due_km?: number | null
          note?: string | null
          updated_at?: string
          vehicle_id: string
          vtc_id: string
        }
        Update: {
          created_at?: string
          id?: string
          interval_days?: number | null
          interval_km?: number | null
          kind?: string
          last_service_at?: string | null
          last_service_km?: number | null
          next_due_at?: string | null
          next_due_km?: number | null
          note?: string | null
          updated_at?: string
          vehicle_id?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_maintenance_schedule_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_schedule_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_schedule_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_schedule_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          brand: string | null
          created_at: string
          current_driver_id: string | null
          id: string
          last_seen_at: string | null
          model: string | null
          name: string
          plate: string | null
          status: string
          updated_at: string
          vtc_id: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          current_driver_id?: string | null
          id?: string
          last_seen_at?: string | null
          model?: string | null
          name: string
          plate?: string | null
          status?: string
          updated_at?: string
          vtc_id: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          current_driver_id?: string | null
          id?: string
          last_seen_at?: string | null
          model?: string | null
          name?: string
          plate?: string | null
          status?: string
          updated_at?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_career_achievements: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          key: string
          metric: string
          name: string
          rarity: string
          threshold: number
          updated_at: string
          vtc_id: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          key: string
          metric: string
          name: string
          rarity?: string
          threshold?: number
          updated_at?: string
          vtc_id: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          key?: string
          metric?: string
          name?: string
          rarity?: string
          threshold?: number
          updated_at?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_career_achievements_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_career_achievements_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_career_achievements_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_career_badges: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          key: string
          metric: string
          name: string
          rarity: string
          threshold: number
          updated_at: string
          vtc_id: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          key: string
          metric: string
          name: string
          rarity?: string
          threshold?: number
          updated_at?: string
          vtc_id: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          key?: string
          metric?: string
          name?: string
          rarity?: string
          threshold?: number
          updated_at?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_career_badges_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_career_badges_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_career_badges_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_career_goals: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          metric: string
          name: string
          period: string
          target: number
          updated_at: string
          vtc_id: string
          xp_reward: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          metric: string
          name: string
          period: string
          target: number
          updated_at?: string
          vtc_id: string
          xp_reward?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          metric?: string
          name?: string
          period?: string
          target?: number
          updated_at?: string
          vtc_id?: string
          xp_reward?: number
        }
        Relationships: [
          {
            foreignKeyName: "vtc_career_goals_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_career_goals_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_career_goals_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_career_history: {
        Row: {
          created_at: string
          description: string | null
          event_type: string
          id: string
          meta: Json
          title: string
          user_id: string
          vtc_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          meta?: Json
          title: string
          user_id: string
          vtc_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          meta?: Json
          title?: string
          user_id?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_career_history_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_career_history_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_career_history_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_career_ranks: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          max_xp: number | null
          min_xp: number
          name: string
          sort: number
          updated_at: string
          vtc_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          max_xp?: number | null
          min_xp?: number
          name: string
          sort?: number
          updated_at?: string
          vtc_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          max_xp?: number | null
          min_xp?: number
          name?: string
          sort?: number
          updated_at?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_career_ranks_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_career_ranks_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_career_ranks_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_career_seasons: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          name: string
          starts_at: string
          status: string
          updated_at: string
          vtc_id: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          name: string
          starts_at: string
          status?: string
          updated_at?: string
          vtc_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          name?: string
          starts_at?: string
          status?: string
          updated_at?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_career_seasons_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_career_seasons_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_career_seasons_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_career_xp_rules: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          rule_key: string
          updated_at: string
          vtc_id: string
          xp_amount: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: string
          rule_key: string
          updated_at?: string
          vtc_id: string
          xp_amount?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          rule_key?: string
          updated_at?: string
          vtc_id?: string
          xp_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "vtc_career_xp_rules_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_career_xp_rules_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_career_xp_rules_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_channel_messages: {
        Row: {
          body: string
          channel_id: string
          created_at: string
          id: string
          is_system: boolean
          parent_id: string | null
          user_id: string
          vtc_id: string
        }
        Insert: {
          body: string
          channel_id: string
          created_at?: string
          id?: string
          is_system?: boolean
          parent_id?: string | null
          user_id: string
          vtc_id: string
        }
        Update: {
          body?: string
          channel_id?: string
          created_at?: string
          id?: string
          is_system?: boolean
          parent_id?: string | null
          user_id?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_channel_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "vtc_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_channel_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "vtc_channel_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_channel_messages_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_channel_messages_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_channel_messages_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_channels: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          is_private: boolean
          name: string
          sort: number
          updated_at: string
          vtc_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          is_private?: boolean
          name: string
          sort?: number
          updated_at?: string
          vtc_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          is_private?: boolean
          name?: string
          sort?: number
          updated_at?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_channels_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_channels_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_channels_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_cost_settings: {
        Row: {
          brake_interval_km: number
          created_at: string
          damage_rate_per_pct: number
          default_fuel_price: number
          inspection_interval_km: number
          notifications_enabled: boolean
          notify_brakes: boolean
          notify_high_consumption: boolean
          notify_high_repair: boolean
          notify_inspection: boolean
          notify_oil: boolean
          notify_tires: boolean
          notify_tuv: boolean
          oil_interval_km: number
          tax_rate: number
          tire_interval_km: number
          tuv_interval_days: number
          updated_at: string
          vtc_id: string
        }
        Insert: {
          brake_interval_km?: number
          created_at?: string
          damage_rate_per_pct?: number
          default_fuel_price?: number
          inspection_interval_km?: number
          notifications_enabled?: boolean
          notify_brakes?: boolean
          notify_high_consumption?: boolean
          notify_high_repair?: boolean
          notify_inspection?: boolean
          notify_oil?: boolean
          notify_tires?: boolean
          notify_tuv?: boolean
          oil_interval_km?: number
          tax_rate?: number
          tire_interval_km?: number
          tuv_interval_days?: number
          updated_at?: string
          vtc_id: string
        }
        Update: {
          brake_interval_km?: number
          created_at?: string
          damage_rate_per_pct?: number
          default_fuel_price?: number
          inspection_interval_km?: number
          notifications_enabled?: boolean
          notify_brakes?: boolean
          notify_high_consumption?: boolean
          notify_high_repair?: boolean
          notify_inspection?: boolean
          notify_oil?: boolean
          notify_tires?: boolean
          notify_tuv?: boolean
          oil_interval_km?: number
          tax_rate?: number
          tire_interval_km?: number
          tuv_interval_days?: number
          updated_at?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_cost_settings_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: true
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_cost_settings_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: true
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_cost_settings_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: true
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_damage_logs: {
        Row: {
          cause: string | null
          created_at: string
          created_by: string | null
          damage_pct: number | null
          damage_type: string
          driver_id: string | null
          id: string
          insurance_status: Database["public"]["Enums"]["vtc_insurance_status"]
          job_id: string | null
          notes: string | null
          occurred_at: string
          repair_cost: number
          screenshot_url: string | null
          updated_at: string
          vehicle_id: string | null
          vtc_id: string
          work_status: Database["public"]["Enums"]["vtc_damage_work_status"]
        }
        Insert: {
          cause?: string | null
          created_at?: string
          created_by?: string | null
          damage_pct?: number | null
          damage_type: string
          driver_id?: string | null
          id?: string
          insurance_status?: Database["public"]["Enums"]["vtc_insurance_status"]
          job_id?: string | null
          notes?: string | null
          occurred_at?: string
          repair_cost?: number
          screenshot_url?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vtc_id: string
          work_status?: Database["public"]["Enums"]["vtc_damage_work_status"]
        }
        Update: {
          cause?: string | null
          created_at?: string
          created_by?: string | null
          damage_pct?: number | null
          damage_type?: string
          driver_id?: string | null
          id?: string
          insurance_status?: Database["public"]["Enums"]["vtc_insurance_status"]
          job_id?: string | null
          notes?: string | null
          occurred_at?: string
          repair_cost?: number
          screenshot_url?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vtc_id?: string
          work_status?: Database["public"]["Enums"]["vtc_damage_work_status"]
        }
        Relationships: [
          {
            foreignKeyName: "vtc_damage_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_damage_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_damage_logs_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_damage_logs_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_damage_logs_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_document_folder_map: {
        Row: {
          created_at: string
          document_id: string
          folder_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          folder_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          folder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_document_folder_map_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "vtc_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_document_folder_map_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "vtc_document_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_document_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          sort: number
          updated_at: string
          vtc_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort?: number
          updated_at?: string
          vtc_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort?: number
          updated_at?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_document_folders_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_document_folders_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_document_folders_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_documents: {
        Row: {
          created_at: string
          id: string
          mime_type: string | null
          name: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string
          vtc_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mime_type?: string | null
          name: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by: string
          vtc_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mime_type?: string | null
          name?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_documents_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_documents_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_documents_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_event_feedback: {
        Row: {
          comment: string | null
          created_at: string
          event_id: string
          id: string
          rating: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          event_id: string
          id?: string
          rating: number
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          event_id?: string
          id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_event_feedback_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "vtc_events"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_event_media: {
        Row: {
          caption: string | null
          created_at: string
          event_id: string
          id: string
          kind: string | null
          uploaded_by: string
          url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          event_id: string
          id?: string
          kind?: string | null
          uploaded_by: string
          url: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          event_id?: string
          id?: string
          kind?: string | null
          uploaded_by?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_event_media_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "vtc_events"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_event_participants: {
        Row: {
          convoy_role: string | null
          event_id: string
          id: string
          joined_at: string
          notes: string | null
          rsvp: string | null
          user_id: string
        }
        Insert: {
          convoy_role?: string | null
          event_id: string
          id?: string
          joined_at?: string
          notes?: string | null
          rsvp?: string | null
          user_id: string
        }
        Update: {
          convoy_role?: string | null
          event_id?: string
          id?: string
          joined_at?: string
          notes?: string | null
          rsvp?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "vtc_events"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_event_reminders: {
        Row: {
          created_at: string
          event_id: string
          id: string
          offset_minutes: number
          sent_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          offset_minutes: number
          sent_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          offset_minutes?: number
          sent_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_event_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "vtc_events"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_event_stops: {
        Row: {
          arrive_at: string | null
          created_at: string
          event_id: string
          id: string
          kind: string | null
          name: string
          note: string | null
          position: number
        }
        Insert: {
          arrive_at?: string | null
          created_at?: string
          event_id: string
          id?: string
          kind?: string | null
          name: string
          note?: string | null
          position?: number
        }
        Update: {
          arrive_at?: string | null
          created_at?: string
          event_id?: string
          id?: string
          kind?: string | null
          name?: string
          note?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "vtc_event_stops_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "vtc_events"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_events: {
        Row: {
          banner_url: string | null
          contact_person: string | null
          created_at: string
          created_by: string
          description: string | null
          destination: string
          difficulty: string | null
          discord_link: string | null
          dlc_requirements: string[] | null
          ends_at: string | null
          game: string | null
          id: string
          max_participants: number | null
          meeting_point: string
          registration_deadline: string | null
          route: string | null
          route_link: string | null
          server: string | null
          starts_at: string
          status: string
          title: string
          updated_at: string
          visibility: string
          voice_server: string | null
          vtc_id: string
        }
        Insert: {
          banner_url?: string | null
          contact_person?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          destination: string
          difficulty?: string | null
          discord_link?: string | null
          dlc_requirements?: string[] | null
          ends_at?: string | null
          game?: string | null
          id?: string
          max_participants?: number | null
          meeting_point: string
          registration_deadline?: string | null
          route?: string | null
          route_link?: string | null
          server?: string | null
          starts_at: string
          status?: string
          title: string
          updated_at?: string
          visibility?: string
          voice_server?: string | null
          vtc_id: string
        }
        Update: {
          banner_url?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          destination?: string
          difficulty?: string | null
          discord_link?: string | null
          dlc_requirements?: string[] | null
          ends_at?: string | null
          game?: string | null
          id?: string
          max_participants?: number | null
          meeting_point?: string
          registration_deadline?: string | null
          route?: string | null
          route_link?: string | null
          server?: string | null
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
          visibility?: string
          voice_server?: string | null
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_events_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_events_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_events_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_fuel_logs: {
        Row: {
          created_at: string
          created_by: string | null
          driver_id: string | null
          fuel_level_pct: number | null
          game: string | null
          id: string
          liters: number
          notes: string | null
          occurred_at: string
          odometer_km: number | null
          price_per_liter: number
          station: string | null
          total_cost: number
          updated_at: string
          vehicle_id: string | null
          vtc_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          fuel_level_pct?: number | null
          game?: string | null
          id?: string
          liters: number
          notes?: string | null
          occurred_at?: string
          odometer_km?: number | null
          price_per_liter: number
          station?: string | null
          total_cost: number
          updated_at?: string
          vehicle_id?: string | null
          vtc_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          fuel_level_pct?: number | null
          game?: string | null
          id?: string
          liters?: number
          notes?: string | null
          occurred_at?: string
          odometer_km?: number | null
          price_per_liter?: number
          station?: string | null
          total_cost?: number
          updated_at?: string
          vehicle_id?: string | null
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_fuel_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_fuel_logs_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_fuel_logs_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_fuel_logs_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          role: Database["public"]["Enums"]["vtc_role"]
          vtc_id: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["vtc_role"]
          vtc_id: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["vtc_role"]
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_invites_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_invites_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_invites_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_join_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          message: string | null
          status: Database["public"]["Enums"]["vtc_join_request_status"]
          user_id: string
          vtc_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          message?: string | null
          status?: Database["public"]["Enums"]["vtc_join_request_status"]
          user_id: string
          vtc_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          message?: string | null
          status?: Database["public"]["Enums"]["vtc_join_request_status"]
          user_id?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_join_requests_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_join_requests_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_join_requests_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_members: {
        Row: {
          joined_at: string
          role: Database["public"]["Enums"]["vtc_role"]
          user_id: string
          vtc_id: string
        }
        Insert: {
          joined_at?: string
          role?: Database["public"]["Enums"]["vtc_role"]
          user_id: string
          vtc_id: string
        }
        Update: {
          joined_at?: string
          role?: Database["public"]["Enums"]["vtc_role"]
          user_id?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_members_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_members_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_members_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "vtc_channel_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          user_id: string
          vtc_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          user_id: string
          vtc_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          user_id?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_messages_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_messages_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_messages_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_news: {
        Row: {
          content: string
          created_at: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      vtc_secrets: {
        Row: {
          api_key: string
          created_at: string
          rotated_at: string | null
          updated_at: string
          vtc_id: string
        }
        Insert: {
          api_key?: string
          created_at?: string
          rotated_at?: string | null
          updated_at?: string
          vtc_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          rotated_at?: string | null
          updated_at?: string
          vtc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtc_secrets_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: true
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_secrets_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: true
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_secrets_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: true
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtc_service_logs: {
        Row: {
          cost: number
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          notes: string | null
          occurred_at: string
          odometer_km: number | null
          responsible_id: string | null
          service_type: Database["public"]["Enums"]["vtc_service_type"]
          updated_at: string
          vehicle_id: string | null
          vtc_id: string
          workshop: string | null
        }
        Insert: {
          cost?: number
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          id?: string
          notes?: string | null
          occurred_at?: string
          odometer_km?: number | null
          responsible_id?: string | null
          service_type: Database["public"]["Enums"]["vtc_service_type"]
          updated_at?: string
          vehicle_id?: string | null
          vtc_id: string
          workshop?: string | null
        }
        Update: {
          cost?: number
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          id?: string
          notes?: string | null
          occurred_at?: string
          odometer_km?: number | null
          responsible_id?: string | null
          service_type?: Database["public"]["Enums"]["vtc_service_type"]
          updated_at?: string
          vehicle_id?: string | null
          vtc_id?: string
          workshop?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vtc_service_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_service_logs_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_service_logs_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vtc_service_logs_vtc_id_fkey"
            columns: ["vtc_id"]
            isOneToOne: false
            referencedRelation: "vtcs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vtcs: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          discord_url: string | null
          id: string
          instagram_url: string | null
          is_demo: boolean
          logo_url: string | null
          name: string
          plan: string
          slug: string
          tag: string
          trial_ends_at: string | null
          trial_starts_at: string | null
          trial_status: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          discord_url?: string | null
          id?: string
          instagram_url?: string | null
          is_demo?: boolean
          logo_url?: string | null
          name: string
          plan?: string
          slug: string
          tag: string
          trial_ends_at?: string | null
          trial_starts_at?: string | null
          trial_status?: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          discord_url?: string | null
          id?: string
          instagram_url?: string | null
          is_demo?: boolean
          logo_url?: string | null
          name?: string
          plan?: string
          slug?: string
          tag?: string
          trial_ends_at?: string | null
          trial_starts_at?: string | null
          trial_status?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      vtcs_directory: {
        Row: {
          created_at: string | null
          description: string | null
          discord_url: string | null
          id: string | null
          instagram_url: string | null
          logo_url: string | null
          name: string | null
          slug: string | null
          tag: string | null
          website_url: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          discord_url?: string | null
          id?: string | null
          instagram_url?: string | null
          logo_url?: string | null
          name?: string | null
          slug?: string | null
          tag?: string | null
          website_url?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          discord_url?: string | null
          id?: string | null
          instagram_url?: string | null
          logo_url?: string | null
          name?: string | null
          slug?: string | null
          tag?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      vtcs_public: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          discord_url: string | null
          id: string | null
          instagram_url: string | null
          logo_url: string | null
          name: string | null
          slug: string | null
          tag: string | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discord_url?: string | null
          id?: string | null
          instagram_url?: string | null
          logo_url?: string | null
          name?: string | null
          slug?: string | null
          tag?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discord_url?: string | null
          id?: string | null
          instagram_url?: string | null
          logo_url?: string | null
          name?: string | null
          slug?: string | null
          tag?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_vtc_invite: {
        Args: { _code: string }
        Returns: {
          slug: string
          vtc_id: string
        }[]
      }
      accept_vtc_join_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
      get_public_vtc: {
        Args: { _slug: string }
        Returns: {
          created_at: string
          description: string
          discord_url: string
          id: string
          instagram_url: string
          logo_url: string
          name: string
          slug: string
          tag: string
          website_url: string
        }[]
      }
      get_top_drivers: {
        Args: { _limit?: number }
        Returns: {
          avatar_url: string
          display_name: string
          total_jobs: number
          total_km: number
          total_revenue: number
          user_id: string
        }[]
      }
      get_top_vtcs: {
        Args: { _limit?: number }
        Returns: {
          id: string
          logo_url: string
          name: string
          slug: string
          tag: string
          total_jobs: number
          total_km: number
          total_revenue: number
        }[]
      }
      increment_site_visits: { Args: never; Returns: number }
      list_public_vtcs: {
        Args: never
        Returns: {
          created_at: string
          description: string
          id: string
          logo_url: string
          name: string
          slug: string
          tag: string
        }[]
      }
      pay_driver_jobs: {
        Args: {
          _actor_id: string
          _amount: number
          _driver_id: string
          _job_ids: string[]
          _vtc_id: string
        }
        Returns: undefined
      }
      pay_settlement: { Args: { _settlement_id: string }; Returns: undefined }
    }
    Enums: {
      game_type: "ets2" | "ats" | "other"
      job_status:
        | "in_progress"
        | "submitted"
        | "approved"
        | "rejected"
        | "cancelled"
      live_visibility: "private" | "vtc" | "public" | "hidden"
      settlement_adjustment_kind: "bonus" | "deduction"
      settlement_dispute_status: "open" | "answered" | "resolved"
      settlement_pay_model: "per_km" | "per_job" | "fixed" | "manual"
      settlement_status:
        | "draft"
        | "pending"
        | "ready"
        | "approved"
        | "paid"
        | "disputed"
        | "archived"
      vtc_damage_work_status: "open" | "in_progress" | "done"
      vtc_insurance_status: "none" | "pending" | "approved" | "denied"
      vtc_join_request_status: "pending" | "accepted" | "rejected" | "cancelled"
      vtc_role: "owner" | "admin" | "dispatcher" | "driver"
      vtc_service_type:
        | "oil"
        | "tires"
        | "tuv"
        | "brakes"
        | "inspection"
        | "engine"
        | "gearbox"
        | "other"
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
      game_type: ["ets2", "ats", "other"],
      job_status: [
        "in_progress",
        "submitted",
        "approved",
        "rejected",
        "cancelled",
      ],
      live_visibility: ["private", "vtc", "public", "hidden"],
      settlement_adjustment_kind: ["bonus", "deduction"],
      settlement_dispute_status: ["open", "answered", "resolved"],
      settlement_pay_model: ["per_km", "per_job", "fixed", "manual"],
      settlement_status: [
        "draft",
        "pending",
        "ready",
        "approved",
        "paid",
        "disputed",
        "archived",
      ],
      vtc_damage_work_status: ["open", "in_progress", "done"],
      vtc_insurance_status: ["none", "pending", "approved", "denied"],
      vtc_join_request_status: ["pending", "accepted", "rejected", "cancelled"],
      vtc_role: ["owner", "admin", "dispatcher", "driver"],
      vtc_service_type: [
        "oil",
        "tires",
        "tuv",
        "brakes",
        "inspection",
        "engine",
        "gearbox",
        "other",
      ],
    },
  },
} as const
