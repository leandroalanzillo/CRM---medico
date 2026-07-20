import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { bootstrapClinic } from "@/lib/onboarding.functions";
import { useApp } from "@/lib/app-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Loader2, Stethoscope, Smile } from "lucide-react";
import { cn } from "@/lib/utils";

export function Onboarding() {
  const { email, refetch } = useApp();
  const run = useServerFn(bootstrapClinic);
  const [loading, setLoading] = useState(false);
  const [clinicName, setClinicName] = useState("");
  const [fullName, setFullName] = useState("");
  const [type, setType] = useState<"medical" | "dental">("medical");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await run({ data: { clinicName, fullName, clinicType: type } });
      toast.success("Clínica configurada!");
      refetch();
    } catch {
      toast.error("Não foi possível criar a clínica.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-surface p-6">
      <Card className="w-full max-w-lg shadow-card">
        <CardHeader className="space-y-3 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground">
            <Activity className="size-6" />
          </span>
          <CardTitle className="text-2xl">Vamos configurar sua clínica</CardTitle>
          <CardDescription>
            {email} — crie o espaço da sua clínica para começar a usar o CRM.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label>Seu nome completo</Label>
              <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Dra. Maria Silva" />
            </div>
            <div className="space-y-2">
              <Label>Nome da clínica</Label>
              <Input required value={clinicName} onChange={(e) => setClinicName(e.target.value)} placeholder="Clínica Vida" />
            </div>
            <div className="space-y-2">
              <Label>Tipo de clínica</Label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { v: "medical", label: "Médica", icon: Stethoscope },
                  { v: "dental", label: "Odontológica", icon: Smile },
                ] as const).map((o) => (
                  <button
                    type="button"
                    key={o.v}
                    onClick={() => setType(o.v)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors",
                      type === o.v ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted",
                    )}
                  >
                    <o.icon className="size-4" /> {o.label}
                  </button>
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />} Criar clínica
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
