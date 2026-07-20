import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Activity } from "lucide-react";

// "/" has no content of its own — it only decides where to send the
// visitor: back to the logged-in area if a session already exists,
// or to the login screen otherwise. Runs client-side only (ssr: false)
// because the Supabase session lives in localStorage (see
// integrations/supabase/client.ts), same as `_authenticated/route.tsx`.
export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/dashboard" });
    throw redirect({ to: "/auth" });
  },
  component: RedirectingPlaceholder,
});

// beforeLoad always throws a redirect, so this only flashes for an
// instant (or not at all) while the auth check resolves.
function RedirectingPlaceholder() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <span className="flex size-12 animate-pulse items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground">
        <Activity className="size-6" />
      </span>
    </div>
  );
}
