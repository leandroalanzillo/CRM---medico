import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { useProcedures, usePatientsMin, useProfessionals } from "@/lib/hooks";
import { AppointmentDialog } from "@/components/appointment-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListPlus, Plus, X, CalendarPlus } from "lucide-react";

export function WaitlistCard() {
  const { clinic } = useApp();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);

  const { data: waitlist, isLoading } = useQuery({
    queryKey: ["waitlist", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waitlist")
        .select(
          "*, patient:patients(id, full_name, phone), professional:professionals(name), procedure:procedures(name)",
        )
        .eq("clinic_id", clinic!.id)
        .eq("status", "waiting")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  async function remove(id: string) {
    const { error } = await supabase.from("waitlist").update({ status: "cancelled" }).eq("id", id);
    if (error) return toast.error("Não foi possível remover.");
    queryClient.invalidateQueries({ queryKey: ["waitlist", clinic?.id] });
  }

  async function markScheduled(id: string) {
    await supabase.from("waitlist").update({ status: "scheduled" }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["waitlist", clinic?.id] });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListPlus className="size-4" /> Lista de espera
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Adicionar
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? null : !waitlist || waitlist.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Ninguém na lista de espera no momento.
            </p>
          ) : (
            <div className="grid gap-2">
              {waitlist.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{w.patient?.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {w.professional?.name ?? "Qualquer profissional"}
                      {w.procedure?.name && ` · ${w.procedure.name}`}
                      {w.preferred_period && ` · Prefere: ${w.preferred_period}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setScheduleFor(w.patient?.id ?? null);
                        markScheduled(w.id);
                      }}
                    >
                      <CalendarPlus className="size-4" /> Agendar
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => remove(w.id)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddToWaitlistDialog open={addOpen} onOpenChange={setAddOpen} />

      <AppointmentDialog
        open={!!scheduleFor}
        onOpenChange={(v) => !v && setScheduleFor(null)}
        initialPatientId={scheduleFor ?? undefined}
      />
    </>
  );
}

function AddToWaitlistDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { clinic, userId } = useApp();
  const queryClient = useQueryClient();
  const { data: patients } = usePatientsMin(clinic?.id, open);
  const { data: professionals } = useProfessionals(clinic?.id);
  const { data: procedures } = useProcedures(clinic?.id);
  const [patientId, setPatientId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [procedureId, setProcedureId] = useState("");
  const [preferredPeriod, setPreferredPeriod] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!clinic) return;
    if (!patientId) return toast.error("Selecione um paciente.");
    setLoading(true);
    const { error } = await supabase.from("waitlist").insert({
      clinic_id: clinic.id,
      patient_id: patientId,
      professional_id: professionalId || null,
      procedure_id: procedureId || null,
      preferred_period: preferredPeriod.trim() || null,
      notes: notes.trim() || null,
      created_by: userId,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Adicionado à lista de espera.");
    queryClient.invalidateQueries({ queryKey: ["waitlist", clinic.id] });
    setPatientId("");
    setProfessionalId("");
    setProcedureId("");
    setPreferredPeriod("");
    setNotes("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar à lista de espera</DialogTitle>
          <DialogDescription>Para encaixar assim que abrir um horário.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label>Paciente *</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {patients?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Profissional</Label>
              <Select value={professionalId} onValueChange={setProfessionalId}>
                <SelectTrigger>
                  <SelectValue placeholder="Qualquer um" />
                </SelectTrigger>
                <SelectContent>
                  {professionals?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Procedimento</Label>
              <Select value={procedureId} onValueChange={setProcedureId}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  {procedures?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Preferência de horário</Label>
            <Input
              value={preferredPeriod}
              onChange={(e) => setPreferredPeriod(e.target.value)}
              placeholder="Ex.: manhãs, quinta à tarde..."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              Adicionar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
