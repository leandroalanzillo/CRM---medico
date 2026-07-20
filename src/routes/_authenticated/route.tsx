import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppProvider, useApp } from "@/lib/app-context";
import { AppShell } from "@/components/app-shell";
import { Onboarding } from "@/components/onboarding";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
  },
  component: () => (
    <AppProvider>
      <Gate />
    </AppProvider>
  ),
});

function Gate() {
  const { loading, needsOnboarding } = useApp();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-4">
          <span className="flex size-12 animate-pulse items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground">
            <Activity className="size-6" />
          </span>
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    );
  }

  if (needsOnboarding) return <Onboarding />;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
