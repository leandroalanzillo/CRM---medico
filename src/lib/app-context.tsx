import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Clinic = Database["public"]["Tables"]["clinics"]["Row"];

export interface AppContextValue {
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  clinic: Clinic | null;
  roles: AppRole[];
  loading: boolean;
  needsOnboarding: boolean;
  hasRole: (...r: AppRole[]) => boolean;
  canViewClinical: boolean;
  refetch: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

async function loadContext() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { user: null, profile: null, clinic: null, roles: [] as AppRole[] };

  const [{ data: profile }, { data: rolesData }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  let clinic: Clinic | null = null;
  if (profile?.clinic_id) {
    const { data } = await supabase.from("clinics").select("*").eq("id", profile.clinic_id).maybeSingle();
    clinic = data ?? null;
  }
  return {
    user,
    profile: profile ?? null,
    clinic,
    roles: (rolesData ?? []).map((r) => r.role as AppRole),
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["app-context"],
    queryFn: loadContext,
    staleTime: 30_000,
  });

  const roles = data?.roles ?? [];
  const value: AppContextValue = {
    userId: data?.user?.id ?? null,
    email: data?.user?.email ?? null,
    profile: data?.profile ?? null,
    clinic: data?.clinic ?? null,
    roles,
    loading: isLoading,
    needsOnboarding: !isLoading && !!data?.user && !data?.clinic,
    hasRole: (...r: AppRole[]) => r.some((role) => roles.includes(role)),
    canViewClinical: roles.some((r) => r === "admin" || r === "manager" || r === "professional"),
    refetch: () => void refetch(),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
