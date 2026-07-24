import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { useProfessionals, useProcedures } from "@/lib/hooks";
import { addTimeline, addAudit } from "@/lib/crm";
import { formatCPF, formatPhone, isValidCPF, isValidEmail } from "@/lib/validators";
import type { Database } from "@/integrations/supabase/types";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";

type Patient = Database["public"]["Tables"]["patients"]["Row"];

const SOURCES = ["Instagram", "Google", "Indicação", "WhatsApp", "Facebook", "Site", "Outro"];
const empty = {
  full_name: "",
  phone: "",
  whatsapp: "",
  email: "",
  cpf: "",
  birth_date: "",
  source: "",
  professional_id: "",
  preferred_procedure_id: "",
  notes: "",
  kind: "lead" as "lead" | "patient",
  address: "",
  occupation: "",
  insurance: "",
  insurance_card: "",
  emergency_contact: "",
  active: true,
};

export function PatientDialog({
  open,
  onOpenChange,
  patient,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  patient?: Patient | null;
  /** Fired only for a brand-new patient (not on edit), with their id and assigned professional so the caller can offer to schedule right away. */
  onCreated?: (patientId: string, professionalId: string | null) => void;
}) {
  const { clinic, userId } = useApp();
  const { data: professionals } = useProfessionals(clinic?.id);
  const { data: procedures } = useProcedures(clinic?.id);
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (open) {
      setForm(
        patient
          ? {
              full_name: patient.full_name ?? "",
              phone: patient.phone ?? "",
              whatsapp: patient.whatsapp ?? "",
              email: patient.email ?? "",
              cpf: patient.cpf ?? "",
              birth_date: patient.birth_date ?? "",
              source: patient.source ?? "",
              professional_id: patient.professional_id ?? "",
              preferred_procedure_id: patient.preferred_procedure_id ?? "",
              notes: patient.notes ?? "",
              kind: patient.kind,
              address: patient.address ?? "",
              occupation: patient.occupation ?? "",
              insurance: patient.insurance ?? "",
              insurance_card: patient.insurance_card ?? "",
              emergency_contact: patient.emergency_contact ?? "",
              active: patient.active ?? true,
            }
          : empty,
      );
    }
  }, [open, patient]);

  const set = (k: keyof typeof empty, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!clinic) return;
    if (form.full_name.trim().length < 2) return toast.error("Informe o nome completo.");
    if (!isValidCPF(form.cpf)) return toast.error("CPF inválido. Confira os números digitados.");
    if (!isValidEmail(form.email)) return toast.error("E-mail inválido.");

    setLoading(true);

    // Referential/uniqueness check: CPF must be unique within the clinic.
    const cpfDigits = form.cpf.replace(/\D/g, "");
    if (cpfDigits) {
      const { data: dup } = await supabase
        .from("patients")
        .select("id, full_name")
        .eq("clinic_id", clinic.id)
        .eq("cpf", form.cpf)
        .neq("id", patient?.id ?? "00000000-0000-0000-0000-000000000000")
        .maybeSingle();
      if (dup) {
        setLoading(false);
        return toast.error(`Este CPF já está cadastrado para ${dup.full_name}.`);
      }
    }

    const payload = {
      clinic_id: clinic.id,
      full_name: form.full_name.trim(),
      phone: form.phone || null,
      whatsapp: form.whatsapp || null,
      email: form.email || null,
      cpf: form.cpf || null,
      birth_date: form.birth_date || null,
      source: form.source || null,
      professional_id: form.professional_id || null,
      preferred_procedure_id: form.preferred_procedure_id || null,
      notes: form.notes || null,
      kind: form.kind,
      address: form.address || null,
      occupation: form.occupation || null,
      insurance: form.insurance || null,
      insurance_card: form.insurance_card || null,
      emergency_contact: form.emergency_contact || null,
      active: form.active,
    };

    try {
      if (patient) {
        const { error } = await supabase.from("patients").update(payload).eq("id", patient.id);
        if (error) throw error;
        await addTimeline({
          clinicId: clinic.id,
          patientId: patient.id,
          eventType: "update",
          description: "Cadastro atualizado.",
          actorId: userId,
        });
        await addAudit({
          clinicId: clinic.id,
          userId,
          action: "update",
          resourceType: "patient",
          resourceId: patient.id,
        });
        toast.success("Paciente atualizado.");
      } else {
        const { data: created, error } = await supabase
          .from("patients")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        await addTimeline({
          clinicId: clinic.id,
          patientId: created.id,
          eventType: "created",
          description: `${form.kind === "lead" ? "Lead" : "Paciente"} criado${form.source ? ` via ${form.source}` : ""}.`,
          actorId: userId,
        });
        await addAudit({
          clinicId: clinic.id,
          userId,
          action: "create",
          resourceType: "patient",
          resourceId: created.id,
        });

        // create a pipeline card in the first stage for new leads
        const { data: stage } = await supabase
          .from("pipeline_stages")
          .select("id")
          .eq("clinic_id", clinic.id)
          .order("position")
          .limit(1)
          .maybeSingle();
        if (stage) {
          await supabase.from("pipeline_cards").insert({
            clinic_id: clinic.id,
            patient_id: created.id,
            stage_id: stage.id,
            professional_id: form.professional_id || null,
          });
        }
        toast.success("Lead criado e adicionado ao CRM.");
        onCreated?.(created.id, form.professional_id || null);
      }
      queryClient.invalidateQueries();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{patient ? "Editar paciente" : "Novo lead / paciente"}</DialogTitle>
          <DialogDescription>Dados cadastrais e comerciais.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Nome completo *</Label>
              <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={form.phone}
                onChange={(e) => set("phone", formatPhone(e.target.value))}
                maxLength={15}
              />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp</Label>
              <Input
                value={form.whatsapp}
                onChange={(e) => set("whatsapp", formatPhone(e.target.value))}
                maxLength={15}
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className={
                  form.email && !isValidEmail(form.email) ? "border-destructive" : undefined
                }
              />
            </div>
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input
                value={form.cpf}
                onChange={(e) => set("cpf", formatCPF(e.target.value))}
                maxLength={14}
                placeholder="000.000.000-00"
                className={form.cpf && !isValidCPF(form.cpf) ? "border-destructive" : undefined}
              />
            </div>
            <div className="space-y-2">
              <Label>Origem</Label>
              <Select value={form.source} onValueChange={(v) => set("source", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Profissional responsável</Label>
              <Select value={form.professional_id} onValueChange={(v) => set("professional_id", v)}>
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
            </div>
            <div className="space-y-2">
              <Label>Procedimento de interesse</Label>
              <Select
                value={form.preferred_procedure_id}
                onValueChange={(v) => set("preferred_procedure_id", v)}
              >
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
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={form.kind} onValueChange={(v) => set("kind", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="patient">Paciente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nascimento</Label>
              <Input
                type="date"
                value={form.birth_date}
                onChange={(e) => set("birth_date", e.target.value)}
              />
            </div>
          </div>

          <Accordion type="single" collapsible>
            <AccordionItem value="more" className="border-none">
              <AccordionTrigger className="text-sm">Mais informações</AccordionTrigger>
              <AccordionContent className="grid gap-4 sm:grid-cols-2 pt-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Endereço</Label>
                  <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Profissão</Label>
                  <Input
                    value={form.occupation}
                    onChange={(e) => set("occupation", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Convênio</Label>
                  <Input
                    value={form.insurance}
                    onChange={(e) => set("insurance", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Carteirinha</Label>
                  <Input
                    value={form.insurance_card}
                    onChange={(e) => set("insurance_card", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contato de emergência</Label>
                  <Input
                    value={form.emergency_contact}
                    onChange={(e) => set("emergency_contact", e.target.value)}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="space-y-2">
            <Label>Observações administrativas</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>

          {patient && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm">Cadastro ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Inative em vez de excluir para preservar o histórico de consultas e negociações.
                </p>
              </div>
              <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
