export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      appointment_status_history: {
        Row: {
          appointment_id: string;
          changed_by: string | null;
          clinic_id: string;
          created_at: string;
          from_status: Database["public"]["Enums"]["appointment_status"] | null;
          id: string;
          to_status: Database["public"]["Enums"]["appointment_status"];
        };
        Insert: {
          appointment_id: string;
          changed_by?: string | null;
          clinic_id: string;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["appointment_status"] | null;
          id?: string;
          to_status: Database["public"]["Enums"]["appointment_status"];
        };
        Update: {
          appointment_id?: string;
          changed_by?: string | null;
          clinic_id?: string;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["appointment_status"] | null;
          id?: string;
          to_status?: Database["public"]["Enums"]["appointment_status"];
        };
        Relationships: [
          {
            foreignKeyName: "appointment_status_history_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_status_history_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          clinic_id: string;
          created_at: string;
          created_by: string | null;
          ends_at: string;
          id: string;
          notes: string | null;
          patient_id: string;
          procedure_id: string | null;
          produced_value: number | null;
          professional_id: string;
          starts_at: string;
          status: Database["public"]["Enums"]["appointment_status"];
          title: string | null;
          updated_at: string;
        };
        Insert: {
          clinic_id: string;
          created_at?: string;
          created_by?: string | null;
          ends_at: string;
          id?: string;
          notes?: string | null;
          patient_id: string;
          procedure_id?: string | null;
          produced_value?: number | null;
          professional_id: string;
          starts_at: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          created_by?: string | null;
          ends_at?: string;
          id?: string;
          notes?: string | null;
          patient_id?: string;
          procedure_id?: string | null;
          produced_value?: number | null;
          professional_id?: string;
          starts_at?: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_procedure_id_fkey";
            columns: ["procedure_id"];
            isOneToOne: false;
            referencedRelation: "procedures";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          changes: Json | null;
          clinic_id: string | null;
          created_at: string;
          id: string;
          ip: string | null;
          resource_id: string | null;
          resource_type: string;
          user_id: string | null;
        };
        Insert: {
          action: string;
          changes?: Json | null;
          clinic_id?: string | null;
          created_at?: string;
          id?: string;
          ip?: string | null;
          resource_id?: string | null;
          resource_type: string;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          changes?: Json | null;
          clinic_id?: string | null;
          created_at?: string;
          id?: string;
          ip?: string | null;
          resource_id?: string | null;
          resource_type?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      clinical_evolutions: {
        Row: {
          author_id: string | null;
          clinic_id: string;
          content: string;
          created_at: string;
          edit_history: Json;
          id: string;
          patient_id: string;
          professional_id: string | null;
          updated_at: string;
        };
        Insert: {
          author_id?: string | null;
          clinic_id: string;
          content: string;
          created_at?: string;
          edit_history?: Json;
          id?: string;
          patient_id: string;
          professional_id?: string | null;
          updated_at?: string;
        };
        Update: {
          author_id?: string | null;
          clinic_id?: string;
          content?: string;
          created_at?: string;
          edit_history?: Json;
          id?: string;
          patient_id?: string;
          professional_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinical_evolutions_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clinical_evolutions_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clinical_evolutions_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id"];
          },
        ];
      };
      clinical_files: {
        Row: {
          clinic_id: string;
          created_at: string;
          file_type: string | null;
          id: string;
          name: string;
          patient_id: string;
          storage_path: string;
          uploaded_by: string | null;
        };
        Insert: {
          clinic_id: string;
          created_at?: string;
          file_type?: string | null;
          id?: string;
          name: string;
          patient_id: string;
          storage_path: string;
          uploaded_by?: string | null;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          file_type?: string | null;
          id?: string;
          name?: string;
          patient_id?: string;
          storage_path?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "clinical_files_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clinical_files_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      clinics: {
        Row: {
          address: string | null;
          created_at: string;
          document: string | null;
          id: string;
          name: string;
          phone: string | null;
          type: Database["public"]["Enums"]["clinic_type"];
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          document?: string | null;
          id?: string;
          name: string;
          phone?: string | null;
          type?: Database["public"]["Enums"]["clinic_type"];
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          document?: string | null;
          id?: string;
          name?: string;
          phone?: string | null;
          type?: Database["public"]["Enums"]["clinic_type"];
          updated_at?: string;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          assigned_to: string | null;
          bot_active: boolean;
          bot_state: Json | null;
          clinic_id: string;
          contact_name: string | null;
          created_at: string;
          id: string;
          last_message: string | null;
          last_message_at: string | null;
          patient_id: string | null;
          phone: string;
          unread_count: number;
          updated_at: string;
        };
        Insert: {
          assigned_to?: string | null;
          bot_active?: boolean;
          bot_state?: Json | null;
          clinic_id: string;
          contact_name?: string | null;
          created_at?: string;
          id?: string;
          last_message?: string | null;
          last_message_at?: string | null;
          patient_id?: string | null;
          phone: string;
          unread_count?: number;
          updated_at?: string;
        };
        Update: {
          assigned_to?: string | null;
          bot_active?: boolean;
          bot_state?: Json | null;
          clinic_id?: string;
          contact_name?: string | null;
          created_at?: string;
          id?: string;
          last_message?: string | null;
          last_message_at?: string | null;
          patient_id?: string | null;
          phone?: string;
          unread_count?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      medical_record_access_logs: {
        Row: {
          action: string;
          clinic_id: string;
          created_at: string;
          id: string;
          patient_id: string;
          user_id: string | null;
        };
        Insert: {
          action: string;
          clinic_id: string;
          created_at?: string;
          id?: string;
          patient_id: string;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          clinic_id?: string;
          created_at?: string;
          id?: string;
          patient_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "medical_record_access_logs_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "medical_record_access_logs_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      medical_records: {
        Row: {
          allergies: string | null;
          anamnesis: string | null;
          clinic_id: string;
          clinical_history: string | null;
          conditions: string | null;
          created_at: string;
          id: string;
          medications: string | null;
          patient_id: string;
          treatment_plan: string | null;
          updated_at: string;
        };
        Insert: {
          allergies?: string | null;
          anamnesis?: string | null;
          clinic_id: string;
          clinical_history?: string | null;
          conditions?: string | null;
          created_at?: string;
          id?: string;
          medications?: string | null;
          patient_id: string;
          treatment_plan?: string | null;
          updated_at?: string;
        };
        Update: {
          allergies?: string | null;
          anamnesis?: string | null;
          clinic_id?: string;
          clinical_history?: string | null;
          conditions?: string | null;
          created_at?: string;
          id?: string;
          medications?: string | null;
          patient_id?: string;
          treatment_plan?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "medical_records_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "medical_records_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: true;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          body: string;
          clinic_id: string;
          conversation_id: string;
          created_at: string;
          direction: string;
          id: string;
          sent_by: string | null;
        };
        Insert: {
          body: string;
          clinic_id: string;
          conversation_id: string;
          created_at?: string;
          direction?: string;
          id?: string;
          sent_by?: string | null;
        };
        Update: {
          body?: string;
          clinic_id?: string;
          conversation_id?: string;
          created_at?: string;
          direction?: string;
          id?: string;
          sent_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      negotiation_history: {
        Row: {
          actor_id: string | null;
          clinic_id: string;
          created_at: string;
          description: string;
          id: string;
          metadata: Json | null;
          negotiation_id: string;
        };
        Insert: {
          actor_id?: string | null;
          clinic_id: string;
          created_at?: string;
          description: string;
          id?: string;
          metadata?: Json | null;
          negotiation_id: string;
        };
        Update: {
          actor_id?: string | null;
          clinic_id?: string;
          created_at?: string;
          description?: string;
          id?: string;
          metadata?: Json | null;
          negotiation_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "negotiation_history_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "negotiation_history_negotiation_id_fkey";
            columns: ["negotiation_id"];
            isOneToOne: false;
            referencedRelation: "negotiations";
            referencedColumns: ["id"];
          },
        ];
      };
      negotiation_items: {
        Row: {
          clinic_id: string;
          created_at: string;
          description: string;
          id: string;
          negotiation_id: string;
          procedure_id: string | null;
          quantity: number;
          unit_price: number;
        };
        Insert: {
          clinic_id: string;
          created_at?: string;
          description: string;
          id?: string;
          negotiation_id: string;
          procedure_id?: string | null;
          quantity?: number;
          unit_price?: number;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          description?: string;
          id?: string;
          negotiation_id?: string;
          procedure_id?: string | null;
          quantity?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "negotiation_items_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "negotiation_items_negotiation_id_fkey";
            columns: ["negotiation_id"];
            isOneToOne: false;
            referencedRelation: "negotiations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "negotiation_items_procedure_id_fkey";
            columns: ["procedure_id"];
            isOneToOne: false;
            referencedRelation: "procedures";
            referencedColumns: ["id"];
          },
        ];
      };
      negotiations: {
        Row: {
          clinic_id: string;
          created_at: string;
          created_by: string | null;
          discount: number;
          final_value: number;
          id: string;
          installments: number | null;
          original_value: number;
          patient_id: string;
          payment_method: string | null;
          professional_id: string | null;
          status: Database["public"]["Enums"]["negotiation_status"];
          title: string;
          updated_at: string;
          valid_until: string | null;
        };
        Insert: {
          clinic_id: string;
          created_at?: string;
          created_by?: string | null;
          discount?: number;
          final_value?: number;
          id?: string;
          installments?: number | null;
          original_value?: number;
          patient_id: string;
          payment_method?: string | null;
          professional_id?: string | null;
          status?: Database["public"]["Enums"]["negotiation_status"];
          title?: string;
          updated_at?: string;
          valid_until?: string | null;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          created_by?: string | null;
          discount?: number;
          final_value?: number;
          id?: string;
          installments?: number | null;
          original_value?: number;
          patient_id?: string;
          payment_method?: string | null;
          professional_id?: string | null;
          status?: Database["public"]["Enums"]["negotiation_status"];
          title?: string;
          updated_at?: string;
          valid_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "negotiations_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "negotiations_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "negotiations_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_log: {
        Row: {
          appointment_id: string | null;
          channel: string;
          clinic_id: string;
          created_at: string;
          error: string | null;
          id: string;
          kind: string;
          recipient: string | null;
          recipient_type: string;
          status: string;
        };
        Insert: {
          appointment_id?: string | null;
          channel: string;
          clinic_id: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          kind: string;
          recipient?: string | null;
          recipient_type: string;
          status: string;
        };
        Update: {
          appointment_id?: string | null;
          channel?: string;
          clinic_id?: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          kind?: string;
          recipient?: string | null;
          recipient_type?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_log_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_log_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_settings: {
        Row: {
          clinic_id: string;
          created_at: string;
          id: string;
          notify_patient_email: boolean;
          notify_patient_sms: boolean;
          notify_patient_whatsapp: boolean;
          notify_professional: boolean;
          reminder_enabled: boolean;
          reminder_hour: number;
          reminder_hours_before: number;
          updated_at: string;
        };
        Insert: {
          clinic_id: string;
          created_at?: string;
          id?: string;
          notify_patient_email?: boolean;
          notify_patient_sms?: boolean;
          notify_patient_whatsapp?: boolean;
          notify_professional?: boolean;
          reminder_enabled?: boolean;
          reminder_hour?: number;
          reminder_hours_before?: number;
          updated_at?: string;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          id?: string;
          notify_patient_email?: boolean;
          notify_patient_sms?: boolean;
          notify_patient_whatsapp?: boolean;
          notify_professional?: boolean;
          reminder_enabled?: boolean;
          reminder_hour?: number;
          reminder_hours_before?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_settings_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: true;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      patient_tags: {
        Row: {
          clinic_id: string;
          patient_id: string;
          tag_id: string;
        };
        Insert: {
          clinic_id: string;
          patient_id: string;
          tag_id: string;
        };
        Update: {
          clinic_id?: string;
          patient_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patient_tags_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_tags_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      patient_timeline: {
        Row: {
          actor_id: string | null;
          clinic_id: string;
          created_at: string;
          description: string;
          event_type: string;
          id: string;
          metadata: Json | null;
          patient_id: string;
        };
        Insert: {
          actor_id?: string | null;
          clinic_id: string;
          created_at?: string;
          description: string;
          event_type: string;
          id?: string;
          metadata?: Json | null;
          patient_id: string;
        };
        Update: {
          actor_id?: string | null;
          clinic_id?: string;
          created_at?: string;
          description?: string;
          event_type?: string;
          id?: string;
          metadata?: Json | null;
          patient_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patient_timeline_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_timeline_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      patients: {
        Row: {
          active: boolean;
          address: string | null;
          avatar_url: string | null;
          birth_date: string | null;
          clinic_id: string;
          cpf: string | null;
          created_at: string;
          email: string | null;
          emergency_contact: string | null;
          full_name: string;
          id: string;
          insurance: string | null;
          insurance_card: string | null;
          insurance_provider_id: string | null;
          kind: Database["public"]["Enums"]["patient_kind"];
          last_contact_at: string | null;
          notes: string | null;
          occupation: string | null;
          phone: string | null;
          professional_id: string | null;
          source: string | null;
          updated_at: string;
          whatsapp: string | null;
        };
        Insert: {
          active?: boolean;
          address?: string | null;
          avatar_url?: string | null;
          birth_date?: string | null;
          clinic_id: string;
          cpf?: string | null;
          created_at?: string;
          email?: string | null;
          emergency_contact?: string | null;
          full_name: string;
          id?: string;
          insurance?: string | null;
          insurance_card?: string | null;
          insurance_provider_id?: string | null;
          kind?: Database["public"]["Enums"]["patient_kind"];
          last_contact_at?: string | null;
          notes?: string | null;
          occupation?: string | null;
          phone?: string | null;
          professional_id?: string | null;
          source?: string | null;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Update: {
          active?: boolean;
          address?: string | null;
          avatar_url?: string | null;
          birth_date?: string | null;
          clinic_id?: string;
          cpf?: string | null;
          created_at?: string;
          email?: string | null;
          emergency_contact?: string | null;
          full_name?: string;
          id?: string;
          insurance?: string | null;
          insurance_card?: string | null;
          insurance_provider_id?: string | null;
          kind?: Database["public"]["Enums"]["patient_kind"];
          last_contact_at?: string | null;
          notes?: string | null;
          occupation?: string | null;
          phone?: string | null;
          professional_id?: string | null;
          source?: string | null;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patients_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patients_insurance_provider_id_fkey";
            columns: ["insurance_provider_id"];
            isOneToOne: false;
            referencedRelation: "insurance_providers";
            referencedColumns: ["id"];
          },
        ];
      };
      insurance_providers: {
        Row: {
          active: boolean;
          ans_registry: string | null;
          clinic_id: string;
          created_at: string;
          email: string | null;
          id: string;
          name: string;
          notes: string | null;
          phone: string | null;
          reimbursement_days: number | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          ans_registry?: string | null;
          clinic_id: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          phone?: string | null;
          reimbursement_days?: number | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          ans_registry?: string | null;
          clinic_id?: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          reimbursement_days?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "insurance_providers_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      pipeline_cards: {
        Row: {
          clinic_id: string;
          created_at: string;
          id: string;
          next_activity: string | null;
          next_activity_at: string | null;
          patient_id: string;
          position: number;
          potential_value: number | null;
          professional_id: string | null;
          stage_id: string;
          updated_at: string;
        };
        Insert: {
          clinic_id: string;
          created_at?: string;
          id?: string;
          next_activity?: string | null;
          next_activity_at?: string | null;
          patient_id: string;
          position?: number;
          potential_value?: number | null;
          professional_id?: string | null;
          stage_id: string;
          updated_at?: string;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          id?: string;
          next_activity?: string | null;
          next_activity_at?: string | null;
          patient_id?: string;
          position?: number;
          potential_value?: number | null;
          professional_id?: string | null;
          stage_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pipeline_cards_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pipeline_cards_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pipeline_cards_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pipeline_cards_stage_id_fkey";
            columns: ["stage_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["id"];
          },
        ];
      };
      pipeline_stages: {
        Row: {
          clinic_id: string;
          color: string;
          created_at: string;
          id: string;
          name: string;
          position: number;
          slug: string;
        };
        Insert: {
          clinic_id: string;
          color?: string;
          created_at?: string;
          id?: string;
          name: string;
          position?: number;
          slug: string;
        };
        Update: {
          clinic_id?: string;
          color?: string;
          created_at?: string;
          id?: string;
          name?: string;
          position?: number;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      procedures: {
        Row: {
          active: boolean;
          clinic_id: string;
          created_at: string;
          default_price: number | null;
          duration_minutes: number | null;
          id: string;
          name: string;
        };
        Insert: {
          active?: boolean;
          clinic_id: string;
          created_at?: string;
          default_price?: number | null;
          duration_minutes?: number | null;
          id?: string;
          name: string;
        };
        Update: {
          active?: boolean;
          clinic_id?: string;
          created_at?: string;
          default_price?: number | null;
          duration_minutes?: number | null;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "procedures_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      professionals: {
        Row: {
          active: boolean;
          clinic_id: string;
          color: string;
          created_at: string;
          email: string | null;
          id: string;
          name: string;
          phone: string | null;
          registration: string | null;
          specialty_id: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          active?: boolean;
          clinic_id: string;
          color?: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          name: string;
          phone?: string | null;
          registration?: string | null;
          specialty_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          active?: boolean;
          clinic_id?: string;
          color?: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string;
          phone?: string | null;
          registration?: string | null;
          specialty_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "professionals_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "professionals_specialty_id_fkey";
            columns: ["specialty_id"];
            isOneToOne: false;
            referencedRelation: "specialties";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          clinic_id: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          clinic_id?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          clinic_id?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      specialties: {
        Row: {
          clinic_id: string;
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          clinic_id: string;
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "specialties_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      tags: {
        Row: {
          clinic_id: string;
          color: string;
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          clinic_id: string;
          color?: string;
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          clinic_id?: string;
          color?: string;
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tags_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          clinic_id: string | null;
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          clinic_id?: string | null;
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          clinic_id?: string | null;
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      app_notifications: {
        Row: {
          appointment_id: string | null;
          body: string | null;
          clinic_id: string;
          created_at: string;
          id: string;
          link: string | null;
          read_at: string | null;
          recipient_id: string;
          title: string;
          type: Database["public"]["Enums"]["app_notification_type"];
        };
        Insert: {
          appointment_id?: string | null;
          body?: string | null;
          clinic_id: string;
          created_at?: string;
          id?: string;
          link?: string | null;
          read_at?: string | null;
          recipient_id: string;
          title: string;
          type?: Database["public"]["Enums"]["app_notification_type"];
        };
        Update: {
          appointment_id?: string | null;
          body?: string | null;
          clinic_id?: string;
          created_at?: string;
          id?: string;
          link?: string | null;
          read_at?: string | null;
          recipient_id?: string;
          title?: string;
          type?: Database["public"]["Enums"]["app_notification_type"];
        };
        Relationships: [
          {
            foreignKeyName: "app_notifications_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "app_notifications_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
        ];
      };
      waitlist: {
        Row: {
          clinic_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          notes: string | null;
          patient_id: string;
          preferred_period: string | null;
          procedure_id: string | null;
          professional_id: string | null;
          status: Database["public"]["Enums"]["waitlist_status"];
          updated_at: string;
        };
        Insert: {
          clinic_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          patient_id: string;
          preferred_period?: string | null;
          procedure_id?: string | null;
          professional_id?: string | null;
          status?: Database["public"]["Enums"]["waitlist_status"];
          updated_at?: string;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          patient_id?: string;
          preferred_period?: string | null;
          procedure_id?: string | null;
          professional_id?: string | null;
          status?: Database["public"]["Enums"]["waitlist_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "waitlist_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waitlist_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waitlist_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waitlist_procedure_id_fkey";
            columns: ["procedure_id"];
            isOneToOne: false;
            referencedRelation: "procedures";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_connections: {
        Row: {
          clinic_id: string;
          created_at: string;
          id: string;
          instance_name: string | null;
          last_connected_at: string | null;
          phone_number: string | null;
          provider: string | null;
          qr_code: string | null;
          qr_expires_at: string | null;
          status: Database["public"]["Enums"]["whatsapp_status"];
          updated_at: string;
        };
        Insert: {
          clinic_id: string;
          created_at?: string;
          id?: string;
          instance_name?: string | null;
          last_connected_at?: string | null;
          phone_number?: string | null;
          provider?: string | null;
          qr_code?: string | null;
          qr_expires_at?: string | null;
          status?: Database["public"]["Enums"]["whatsapp_status"];
          updated_at?: string;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          id?: string;
          instance_name?: string | null;
          last_connected_at?: string | null;
          phone_number?: string | null;
          provider?: string | null;
          qr_code?: string | null;
          qr_expires_at?: string | null;
          status?: Database["public"]["Enums"]["whatsapp_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: true;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      financial_categories: {
        Row: {
          clinic_id: string;
          color: string;
          created_at: string;
          id: string;
          name: string;
          type: Database["public"]["Enums"]["financial_type"];
        };
        Insert: {
          clinic_id: string;
          color?: string;
          created_at?: string;
          id?: string;
          name: string;
          type: Database["public"]["Enums"]["financial_type"];
        };
        Update: {
          clinic_id?: string;
          color?: string;
          created_at?: string;
          id?: string;
          name?: string;
          type?: Database["public"]["Enums"]["financial_type"];
        };
        Relationships: [
          {
            foreignKeyName: "financial_categories_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      financial_transactions: {
        Row: {
          amount: number;
          category_id: string | null;
          clinic_id: string;
          created_at: string;
          created_by: string | null;
          description: string;
          due_date: string;
          id: string;
          installment_group_id: string | null;
          installment_number: number | null;
          installment_total: number | null;
          negotiation_id: string | null;
          notes: string | null;
          paid_at: string | null;
          patient_id: string | null;
          payment_method: string | null;
          professional_id: string | null;
          status: Database["public"]["Enums"]["financial_status"];
          type: Database["public"]["Enums"]["financial_type"];
          updated_at: string;
        };
        Insert: {
          amount: number;
          category_id?: string | null;
          clinic_id: string;
          created_at?: string;
          created_by?: string | null;
          description: string;
          due_date: string;
          id?: string;
          installment_group_id?: string | null;
          installment_number?: number | null;
          installment_total?: number | null;
          negotiation_id?: string | null;
          notes?: string | null;
          paid_at?: string | null;
          patient_id?: string | null;
          payment_method?: string | null;
          professional_id?: string | null;
          status?: Database["public"]["Enums"]["financial_status"];
          type: Database["public"]["Enums"]["financial_type"];
          updated_at?: string;
        };
        Update: {
          amount?: number;
          category_id?: string | null;
          clinic_id?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          due_date?: string;
          id?: string;
          installment_group_id?: string | null;
          installment_number?: number | null;
          installment_total?: number | null;
          negotiation_id?: string | null;
          notes?: string | null;
          paid_at?: string | null;
          patient_id?: string | null;
          payment_method?: string | null;
          professional_id?: string | null;
          status?: Database["public"]["Enums"]["financial_status"];
          type?: Database["public"]["Enums"]["financial_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "financial_transactions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "financial_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_transactions_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_transactions_negotiation_id_fkey";
            columns: ["negotiation_id"];
            isOneToOne: false;
            referencedRelation: "negotiations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_transactions_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_transactions_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_view_clinical: { Args: never; Returns: boolean };
      get_my_clinic_id: { Args: never; Returns: string };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "manager" | "receptionist" | "professional" | "commercial";
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "waiting"
        | "in_progress"
        | "finished"
        | "cancelled"
        | "no_show";
      clinic_type: "medical" | "dental";
      app_notification_type:
        | "appointment_reminder"
        | "appointment_confirmed"
        | "appointment_cancelled"
        | "appointment_no_show"
        | "negotiation_update"
        | "system";
      financial_status: "pending" | "paid" | "cancelled";
      financial_type: "income" | "expense";
      negotiation_status: "negotiating" | "awaiting" | "accepted" | "rejected" | "expired";
      patient_kind: "lead" | "patient";
      waitlist_status: "waiting" | "contacted" | "scheduled" | "cancelled";
      whatsapp_status: "disconnected" | "awaiting_qr" | "connecting" | "connected" | "error";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
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
      app_role: ["admin", "manager", "receptionist", "professional", "commercial"],
      appointment_status: [
        "scheduled",
        "confirmed",
        "waiting",
        "in_progress",
        "finished",
        "cancelled",
        "no_show",
      ],
      clinic_type: ["medical", "dental"],
      negotiation_status: ["negotiating", "awaiting", "accepted", "rejected", "expired"],
      patient_kind: ["lead", "patient"],
      waitlist_status: ["waiting", "contacted", "scheduled", "cancelled"],
      whatsapp_status: ["disconnected", "awaiting_qr", "connecting", "connected", "error"],
    },
  },
} as const;
