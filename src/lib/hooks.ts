import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProfessionals(clinicId?: string | null) {
  return useQuery({
    queryKey: ["professionals", clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("*, specialty:specialties(name)")
        .eq("clinic_id", clinicId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useStages(clinicId?: string | null) {
  return useQuery({
    queryKey: ["stages", clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("clinic_id", clinicId!)
        .order("position");
      if (error) throw error;
      return data;
    },
  });
}

export function useTags(clinicId?: string | null) {
  return useQuery({
    queryKey: ["tags", clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .eq("clinic_id", clinicId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useProcedures(clinicId?: string | null) {
  return useQuery({
    queryKey: ["procedures", clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("procedures")
        .select("*")
        .eq("clinic_id", clinicId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useNotificationSettings(clinicId?: string | null) {
  return useQuery({
    queryKey: ["notification-settings", clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_settings")
        .select("*")
        .eq("clinic_id", clinicId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function usePatientsMin(clinicId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["patients-min", clinicId],
    enabled: !!clinicId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, full_name, kind, professional_id")
        .eq("clinic_id", clinicId!)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFinancialCategories(clinicId?: string | null) {
  return useQuery({
    queryKey: ["financial-categories", clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_categories")
        .select("*")
        .eq("clinic_id", clinicId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}
