import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { useProfessionals, useProcedures, useNotificationSettings } from "@/lib/hooks";
import { addTimeline, addAudit, moveCardToStageBySlug } from "@/lib/crm";
import { sendAppointmentConfirmation } from "@/lib/notifications.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";

export function AppointmentDialog({
  open,
  onOpenChange,
  defaultStart,
  initialPatientId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultStart?: string;
  /** Pre-selects a patient (and, transitively, their assigned professional) — used when opening this dialog from the patient's own page or right after creating one. */
  initialPatientId?: string;
}) {
  const { clinic, userId } = useApp();
  const { data: professionals } = useProfessionals(clinic?.id);
  const { data: procedures } = useProcedures(clinic?.id);
  const { data: notifSettings } = useNotificationSettings(clinic?.id);
  const queryClient = useQueryClient();
  const notifyConfirmation = useServerFn(sendAppointmentConfirmation);
  const [loading, setLoading] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [professionalTouched, setProfessionalTouched] = useState(false);
  const [procedureId, setProcedureId] = useState("");
  const [start, setStart] = useState(defaultStart ?? "");
  const [duration, setDuration] = useState(30);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(true);

  useEffect(() => {
    if (open && defaultStart) setStart(defaultStart);
  }, [open, defaultStart]);
  useEffect(() => {
    if (notifSettings) {
      setNotifyEmail(notifSettings.notify_patient_email);
      setNotifyWhatsapp(notifSettings.notify_patient_whatsapp);
    }
  }, [notifSettings]);
  useEffect(() => {
    if (open) {
      setPatientId(initialPatientId ?? "");
      setProfessionalTouched(false);
      if (!initialPatientId) setProfessionalId("");
    }
  }, [open, initialPatientId]);

  const { data: patients } = useQuery({
    queryKey: ["patients-min", clinic?.id],
    enabled: !!clinic?.id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, full_name, professional_id")
        .eq("clinic_id", clinic!.id)
        .order("full_name");
      return data ?? [];
    },
  });

  // The whole point of this fix: an appointment belongs on the calendar of
  // the professional the PATIENT is actually assigned to. Picking a patient
  // auto-fills their professional — the user can still override it
  // manually (e.g. a one-off with a different doctor), but the default is
  // no longer "whatever was last selected" or empty.
  useEffect(() => {
    if (!patientId || professionalTouched) return;
    const p = patients?.find((p) => p.id === patientId);
    if (p?.professional_id) setProfessionalId(p.professional_id);
  }, [patientId, patients, professionalTouched]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!clinic || !patientId || !professionalId || !start)
      return toast.error("Preencha paciente, profissional e horário.");
    setLoading(true);
    const startDate = new Date(start);
    const endDate = new Date(startDate.getTime() + duration * 60000);

    // conflict check
    const { data: conflicts } = await supabase
      .from("appointments")
      .select("id")
      .eq("professional_id", professionalId)
      .lt("starts_at", endDate.toISOString())
      .gt("ends_at", startDate.toISOString())
      .neq("status", "cancelled");
    if (conflicts && conflicts.length > 0) {
      setLoading(false);
      return toast.error("Conflito de horário para este profissional.");
    }

    const { data: created, error } = await supabase
      .from("appointments")
      .insert({
        clinic_id: clinic.id,
        patient_id: patientId,
        professional_id: professionalId,
        procedure_id: procedureId || null,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        status: "scheduled",
        created_by: userId,
        title: procedures?.find((p) => p.id === procedureId)?.name ?? "Consulta",
      })
      .select("id")
      .single();
    setLoading(false);
    if (error) return toast.error(error.message);

    await addTimeline({
      clinicId: clinic.id,
      patientId,
      eventType: "appointment",
      description: `Consulta agendada para ${startDate.toLocaleString("pt-BR")}.`,
      actorId: userId,
    });
    await addAudit({
      clinicId: clinic.id,
      userId,
      action: "create",
      resourceType: "appointment",
      resourceId: created.id,
    });
    // AUTOMATION: move card to "Consulta Agendada"
    await moveCardToStageBySlug({
      clinicId: clinic.id,
      patientId,
      slug: "agendada",
      reason: "após criação do agendamento",
      actorId: userId,
      auto: true,
    });

    // NOTIFY: send scheduling confirmation to the patient (email + WhatsApp)
    if (notifyEmail || notifyWhatsapp) {
      try {
        const res = await notifyConfirmation({
          data: {
            appointmentId: created.id,
            emailPatient: notifyEmail,
            whatsappPatient: notifyWhatsapp,
          },
        });
        if (res.sent > 0) toast.success(`Confirmação enviada ao paciente (${res.sent}).`);
        else if (res.failed > 0)
          toast.warning("Agendamento criado, mas falha ao notificar o paciente.");
      } catch (e) {
        console.error(
          "[appointment-dialog] confirmation notification failed:",
          (e as Error).message,
        );
        toast.warning("Agendamento criado, mas a notificação não pôde ser enviada.");
      }
    }

    queryClient.invalidateQueries();
    toast.success("Agendamento criado.");
    setPatientId("");
    setProfessionalId("");
    setProfessionalTouched(false);
    setProcedureId("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo agendamento</DialogTitle>
          <DialogDescription>Sem conflito de horários por profissional.</DialogDescription>
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
          <div className="space-y-2">
            <Label>Profissional *</Label>
            <Select
              value={professionalId}
              onValueChange={(v) => {
                setProfessionalId(v);
                setProfessionalTouched(true);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {professionals?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!professionalTouched && patientId && professionalId && (
              <p className="text-xs text-muted-foreground">
                Preenchido automaticamente com o profissional deste paciente — pode trocar se
                necessário.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Procedimento</Label>
            <Select value={procedureId} onValueChange={setProcedureId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Início *</Label>
              <Input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Duração (min)</Label>
              <Input
                type="number"
                min={10}
                step={5}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-medium">Notificar o paciente</p>
            <div className="flex items-center justify-between">
              <Label htmlFor="notify-email" className="font-normal text-muted-foreground">
                Por e-mail
              </Label>
              <Switch id="notify-email" checked={notifyEmail} onCheckedChange={setNotifyEmail} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="notify-wpp" className="font-normal text-muted-foreground">
                Por WhatsApp
              </Label>
              <Switch
                id="notify-wpp"
                checked={notifyWhatsapp}
                onCheckedChange={setNotifyWhatsapp}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />} Agendar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
