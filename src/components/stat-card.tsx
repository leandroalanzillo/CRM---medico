import { type ComponentType } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label, value, icon: Icon, hint, accent = "primary",
}: {
  label: string;
  value: string | number;
  icon?: ComponentType<{ className?: string }>;
  hint?: string;
  accent?: "primary" | "success" | "warning" | "info" | "destructive";
}) {
  const accentMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    info: "bg-info/15 text-info",
    destructive: "bg-destructive/10 text-destructive",
  };
  return (
    <Card className="flex items-center gap-4 p-5 shadow-soft">
      {Icon && (
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", accentMap[accent])}>
          <Icon className="size-5" />
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  );
}
