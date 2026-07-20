import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";
import {
  Bell,
  Calendar,
  CalendarX,
  CalendarCheck,
  Handshake,
  Info,
  CheckCheck,
} from "lucide-react";

const TYPE_ICON = {
  appointment_reminder: Calendar,
  appointment_confirmed: CalendarCheck,
  appointment_cancelled: CalendarX,
  appointment_no_show: CalendarX,
  negotiation_update: Handshake,
  system: Info,
} as const;

export function NotificationBell() {
  const { userId } = useApp();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["app-notifications", userId],
    enabled: !!userId,
    // Polling keeps this simple and reliable without wiring a realtime
    // channel; 30s is frequent enough for "consulta em Xh" style reminders.
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const items = data ?? [];
  const unreadCount = items.filter((n) => !n.read_at).length;

  async function markAsRead(id: string) {
    await supabase
      .from("app_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["app-notifications", userId] });
  }

  async function markAllAsRead() {
    const unreadIds = items.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase
      .from("app_notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);
    queryClient.invalidateQueries({ queryKey: ["app-notifications", userId] });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive p-0 text-[10px] text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notificações</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={markAllAsRead}>
              <CheckCheck className="size-3.5" /> Marcar todas
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Nenhuma notificação por aqui.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {items.map((n) => {
              const Icon = TYPE_ICON[n.type as keyof typeof TYPE_ICON] ?? Info;
              const content = (
                <div className={`flex gap-3 rounded-md p-2 ${!n.read_at ? "bg-primary/5" : ""}`}>
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">{n.title}</p>
                    {n.body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {fmtDateTime(n.created_at)}
                    </p>
                  </div>
                  {!n.read_at && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  )}
                </div>
              );
              return (
                <DropdownMenuItem
                  key={n.id}
                  className="cursor-pointer p-0 focus:bg-transparent"
                  onClick={() => markAsRead(n.id)}
                  asChild
                >
                  {n.link ? (
                    <Link to={n.link} className="block w-full rounded-md hover:bg-accent">
                      {content}
                    </Link>
                  ) : (
                    <div className="w-full">{content}</div>
                  )}
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
