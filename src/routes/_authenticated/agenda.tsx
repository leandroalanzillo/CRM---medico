import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { useProfessionals } from "@/lib/hooks";
import { addTimeline, moveCardToStageBySlug } from "@/lib/crm";
import { PageHeader } from "@/components/page-header";
import { AppointmentDialog } from "@/components/appointment-dialog";
import { WaitlistCard } from "@/components/waitlist-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtTime, APPOINTMENT_STATUS } from "@/lib/format";
import { Plus, Calendar, ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agenda")({ component: AgendaPage });

const NEXT: Record<string, string> = {
  scheduled: "confirmed",
  confirmed: "in_progress",
  in_progress: "finished",
};

function AgendaPage() {
  const { clinic, userId } = useApp();
  const { data: professionals } = useProfessionals(clinic?.id);
  const queryClient = useQueryClient();
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [prof, setProf] = useState("all");
  const [open, setOpen] = useState(false);

  const dayStart = new Date(day + "T00:00:00");
  const dayEnd = new Date(day + "T23:59:59");

  const { data: appts, isLoading } = useQuery({
    queryKey: ["agenda", clinic?.id, day, prof],
    enabled: !!clinic?.id,
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select("*, patient:patients(id, full_name), professional:professionals(name, color)")
        .eq("clinic_id", clinic!.id)
        .gte("starts_at", dayStart.toISOString())
        .lte("starts_at", dayEnd.toISOString())
        .order("starts_at");
      if (prof !== "all") q = q.eq("professional_id", prof);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  function shift(d: number) {
    const nd = new Date(day);
    nd.setDate(nd.getDate() + d);
    setDay(nd.toISOString().slice(0, 10));
  }

  async function advance(a: { id: string; status: string; patient: { id: string } | null }) {
    const next = NEXT[a.status];
    if (!next || !clinic) return;
    await supabase
      .from("appointments")
      .update({ status: next as never })
      .eq("id", a.id);
    await supabase.from("appointment_status_history").insert({
      clinic_id: clinic.id,
      appointment_id: a.id,
      from_status: a.status as never,
      to_status: next as never,
      changed_by: userId,
    });
    if (a.patient) {
      if (next === "in_progress")
        await moveCardToStageBySlug({
          clinicId: clinic.id,
          patientId: a.patient.id,
          slug: "em_consulta",
          reason: "atendimento iniciado",
          actorId: userId,
          auto: true,
        });
      if (next === "finished") {
        await addTimeline({
          clinicId: clinic.id,
          patientId: a.patient.id,
          eventType: "appointment",
          description: "Consulta finalizada.",
          actorId: userId,
        });
        await moveCardToStageBySlug({
          clinicId: clinic.id,
          patientId: a.patient.id,
          slug: "negociacao",
          reason: "consulta finalizada com proposta pendente",
          actorId: userId,
          auto: true,
        });
      }
    }
    queryClient.invalidateQueries();
    toast.success("Status atualizado.");
  }

  return (
    <div>
      <PageHeader
        title="Agenda"
        description="Agendamentos dos profissionais por dia."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Agendar
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => shift(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <Input
          type="date"
          className="w-auto"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
        <Button variant="outline" size="icon" onClick={() => shift(1)}>
          <ChevronRight className="size-4" />
        </Button>
        <Select value={prof} onValueChange={setProf}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os profissionais</SelectItem>
            {professionals?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (appts ?? []).length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Nenhum agendamento neste dia"
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Agendar
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {appts!.map((a) => (
            <Card
              key={a.id}
              className="flex items-center gap-4 p-4 shadow-soft"
              style={{ borderLeft: `4px solid ${a.professional?.color ?? "#2dd4bf"}` }}
            >
              <div className="w-16 text-center">
                <p className="text-lg font-bold">{fmtTime(a.starts_at)}</p>
                <p className="text-xs text-muted-foreground">{fmtTime(a.ends_at)}</p>
              </div>
              <div className="flex-1">
                <p className="font-semibold">{a.patient?.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  {a.title} · {a.professional?.name}
                </p>
              </div>
              <Badge className={APPOINTMENT_STATUS[a.status].className}>
                {APPOINTMENT_STATUS[a.status].label}
              </Badge>
              {NEXT[a.status] && (
                <Button size="sm" variant="outline" onClick={() => advance(a)}>
                  {a.status === "scheduled"
                    ? "Confirmar"
                    : a.status === "confirmed"
                      ? "Iniciar"
                      : "Finalizar"}
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6">
        <WaitlistCard />
      </div>

      <AppointmentDialog open={open} onOpenChange={setOpen} defaultStart={`${day}T09:00`} />
    </div>
  );
}
