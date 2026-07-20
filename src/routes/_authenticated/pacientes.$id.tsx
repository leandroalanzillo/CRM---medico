import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { PatientDialog } from "@/components/patient-dialog";
import { AppointmentDialog } from "@/components/appointment-dialog";
import { NegotiationDialog } from "@/components/negotiation-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import {
  fmtDate,
  fmtDateTime,
  initials,
  brl,
  APPOINTMENT_STATUS,
  NEGOTIATION_STATUS,
} from "@/lib/format";
import { addTimeline } from "@/lib/crm";
import {
  ArrowLeft,
  Pencil,
  Clock,
  FileHeart,
  Lock,
  Calendar,
  Handshake,
  Plus,
  ShieldCheck,
  Loader2,
  Paperclip,
  Download,
  Trash2,
  Upload,
  CalendarPlus,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/pacientes/$id")({
  component: PatientProfile,
});

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );
}

function PatientProfile() {
  const { id } = useParams({ from: "/_authenticated/pacientes/$id" });
  const { clinic, canViewClinical } = useApp();
  const [edit, setEdit] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [negOpen, setNegOpen] = useState(false);

  const { data: patient, isLoading } = useQuery({
    queryKey: ["patient", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*, professional:professionals(name, color)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: timeline } = useQuery({
    queryKey: ["timeline", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_timeline")
        .select("*")
        .eq("patient_id", id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: appointments } = useQuery({
    queryKey: ["patient-appts", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("*, professional:professionals(name)")
        .eq("patient_id", id)
        .order("starts_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: negotiations } = useQuery({
    queryKey: ["patient-negs", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("negotiations")
        .select("*")
        .eq("patient_id", id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  if (isLoading || !patient) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-3">
        <Link to="/pacientes">
          <ArrowLeft className="size-4" /> Pacientes
        </Link>
      </Button>

      <Card className="mb-6 shadow-soft">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <Avatar className="size-16">
            <AvatarFallback className="bg-primary/15 text-primary text-lg font-bold">
              {initials(patient.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{patient.full_name}</h1>
              <Badge variant={patient.kind === "patient" ? "default" : "secondary"}>
                {patient.kind === "patient" ? "Paciente" : "Lead"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {patient.phone} {patient.professional && <>· {patient.professional.name}</>}
              {patient.source && <> · Origem: {patient.source}</>}
            </p>
          </div>
          <Button onClick={() => setScheduleOpen(true)}>
            <CalendarPlus className="size-4" /> Agendar consulta
          </Button>
          <Button variant="outline" onClick={() => setEdit(true)}>
            <Pencil className="size-4" /> Editar
          </Button>
        </CardContent>
      </Card>

      <AppointmentDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        initialPatientId={patient.id}
      />

      <Tabs defaultValue="overview">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="records">Prontuário</TabsTrigger>
          <TabsTrigger value="appts">Agendamentos</TabsTrigger>
          <TabsTrigger value="negs">Negociações</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="grid gap-5 p-6 sm:grid-cols-3">
              <Field label="CPF" value={patient.cpf} />
              <Field
                label="Nascimento"
                value={patient.birth_date ? fmtDate(patient.birth_date) : null}
              />
              <Field label="E-mail" value={patient.email} />
              <Field label="WhatsApp" value={patient.whatsapp} />
              <Field label="Convênio" value={patient.insurance} />
              <Field label="Carteirinha" value={patient.insurance_card} />
              <Field label="Profissão" value={patient.occupation} />
              <Field label="Contato emergência" value={patient.emergency_contact} />
              <Field label="Endereço" value={patient.address} />
              <div className="sm:col-span-3">
                <Field label="Observações" value={patient.notes} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          {timeline && timeline.length > 0 ? (
            <Card>
              <CardContent className="p-6">
                <ol className="relative space-y-6 border-l pl-6">
                  {timeline.map((t) => (
                    <li key={t.id} className="relative">
                      <span className="absolute -left-[27px] top-1 flex size-4 items-center justify-center rounded-full bg-primary/15 ring-4 ring-background">
                        <span className="size-2 rounded-full bg-primary" />
                      </span>
                      <p className="text-sm">{t.description}</p>
                      <p className="text-xs text-muted-foreground">{fmtDateTime(t.created_at)}</p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ) : (
            <EmptyState
              icon={Clock}
              title="Sem eventos ainda"
              description="As interações do paciente aparecem aqui."
            />
          )}
        </TabsContent>

        <TabsContent value="records">
          {canViewClinical ? (
            <ClinicalSection patientId={id} clinicId={clinic!.id} />
          ) : (
            <EmptyState
              icon={Lock}
              title="Acesso restrito"
              description="Somente profissionais de saúde, gestores e administradores podem acessar o prontuário."
            />
          )}
        </TabsContent>

        <TabsContent value="appts">
          {appointments && appointments.length > 0 ? (
            <div className="grid gap-3">
              {appointments.map((a) => (
                <Card key={a.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{a.title || "Consulta"}</p>
                    <p className="text-sm text-muted-foreground">
                      {fmtDateTime(a.starts_at)} · {a.professional?.name}
                    </p>
                  </div>
                  <Badge className={APPOINTMENT_STATUS[a.status].className}>
                    {APPOINTMENT_STATUS[a.status].label}
                  </Badge>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState icon={Calendar} title="Sem agendamentos" />
          )}
        </TabsContent>

        <TabsContent value="negs">
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={() => setNegOpen(true)}>
              <Plus className="size-4" /> Nova negociação
            </Button>
          </div>
          {negotiations && negotiations.length > 0 ? (
            <div className="grid gap-3">
              {negotiations.map((n) => (
                <Card key={n.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{n.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {brl(n.final_value)} · {fmtDate(n.created_at)}
                    </p>
                  </div>
                  <Badge className={NEGOTIATION_STATUS[n.status].className}>
                    {NEGOTIATION_STATUS[n.status].label}
                  </Badge>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState icon={Handshake} title="Sem negociações" />
          )}
        </TabsContent>
      </Tabs>

      <PatientDialog open={edit} onOpenChange={setEdit} patient={patient} />
      <NegotiationDialog open={negOpen} onOpenChange={setNegOpen} defaultPatientId={id} />
    </div>
  );
}

function ClinicalSection({ patientId, clinicId }: { patientId: string; clinicId: string }) {
  const { userId } = useApp();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("medical_record_access_logs").insert({
      clinic_id: clinicId,
      patient_id: patientId,
      user_id: userId,
      action: "view_record",
    });
  }, [patientId, clinicId, userId]);

  const { data: record } = useQuery({
    queryKey: ["record", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("medical_records")
        .select("*")
        .eq("patient_id", patientId)
        .maybeSingle();
      return data;
    },
  });

  const { data: evolutions } = useQuery({
    queryKey: ["evolutions", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clinical_evolutions")
        .select("*, professional:professionals(name)")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  async function addEvolution() {
    if (content.trim().length < 3) return;
    setSaving(true);
    const { error } = await supabase.from("clinical_evolutions").insert({
      clinic_id: clinicId,
      patient_id: patientId,
      author_id: userId,
      content: content.trim(),
    });
    setSaving(false);
    if (error) return toast.error("Erro ao registrar evolução.");
    await addTimeline({
      clinicId,
      patientId,
      eventType: "clinical",
      description: "Nova evolução clínica registrada.",
      actorId: userId,
    });
    setContent("");
    queryClient.invalidateQueries({ queryKey: ["evolutions", patientId] });
    toast.success("Evolução registrada.");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 rounded-lg border bg-info/5 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 text-info" /> Dados clínicos sensíveis — todo acesso é
        registrado. Evoluções não podem ser excluídas.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Anamnese & histórico</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Field label="Anamnese" value={record?.anamnesis} />
            <Field label="Histórico clínico" value={record?.clinical_history} />
            <Field label="Alergias" value={record?.allergies} />
            <Field label="Medicamentos em uso" value={record?.medications} />
            <Field label="Condições preexistentes" value={record?.conditions} />
            <Field label="Plano de tratamento" value={record?.treatment_plan} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nova evolução clínica</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={5}
              placeholder="Descreva a evolução do atendimento..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <Button onClick={addEvolution} disabled={saving} className="w-full">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{" "}
              Registrar evolução
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de evoluções</CardTitle>
        </CardHeader>
        <CardContent>
          {evolutions && evolutions.length > 0 ? (
            <div className="space-y-4">
              {evolutions.map((e) => (
                <div key={e.id} className="rounded-lg border p-4">
                  <p className="whitespace-pre-wrap text-sm">{e.content}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {e.professional?.name ? `${e.professional.name} · ` : ""}
                    {fmtDateTime(e.created_at)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma evolução registrada.
            </p>
          )}
        </CardContent>
      </Card>

      <ClinicalFiles patientId={patientId} clinicId={clinicId} />
    </div>
  );
}

const FILE_KINDS = [
  { value: "prontuario", label: "Prontuário" },
  { value: "receita", label: "Receita" },
  { value: "exame", label: "Exame" },
  { value: "outro", label: "Outro" },
];

function ClinicalFiles({ patientId, clinicId }: { patientId: string; clinicId: string }) {
  const { userId } = useApp();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState("prontuario");
  const [uploading, setUploading] = useState(false);

  const { data: files, isLoading } = useQuery({
    queryKey: ["clinical-files", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinical_files")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return toast.error("Arquivo maior que 20MB.");
    setUploading(true);

    // Path prefix ("<clinic_id>/<patient_id>/...") is what the storage RLS
    // policies check — see supabase/migrations/20260720120000_*.sql.
    const safeName = file.name.replace(/[^\w.-]+/g, "_");
    const path = `${clinicId}/${patientId}/${Date.now()}-${safeName}`;

    const { error: upErr } = await supabase.storage.from("clinical-files").upload(path, file);
    if (upErr) {
      setUploading(false);
      return toast.error(`Falha no upload: ${upErr.message}`);
    }

    const { error: dbErr } = await supabase.from("clinical_files").insert({
      clinic_id: clinicId,
      patient_id: patientId,
      name: file.name,
      storage_path: path,
      file_type: kind,
      uploaded_by: userId,
    });
    setUploading(false);
    if (dbErr) {
      await supabase.storage.from("clinical-files").remove([path]); // don't leave an orphaned blob
      return toast.error(dbErr.message);
    }
    queryClient.invalidateQueries({ queryKey: ["clinical-files", patientId] });
    toast.success("Arquivo anexado.");
  }

  async function download(f: { storage_path: string; name: string }) {
    const { data, error } = await supabase.storage
      .from("clinical-files")
      .createSignedUrl(f.storage_path, 60);
    if (error || !data) return toast.error("Não foi possível gerar o link de download.");
    window.open(data.signedUrl, "_blank");
  }

  async function remove(f: { id: string; storage_path: string }) {
    const { error: storageErr } = await supabase.storage
      .from("clinical-files")
      .remove([f.storage_path]);
    if (storageErr) return toast.error(storageErr.message);
    const { error: dbErr } = await supabase.from("clinical_files").delete().eq("id", f.id);
    if (dbErr) return toast.error(dbErr.message);
    queryClient.invalidateQueries({ queryKey: ["clinical-files", patientId] });
    toast.success("Arquivo removido.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Paperclip className="size-4" /> Prontuário e receitas (anexos)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Tipo do arquivo</p>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILE_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label>
            <Button asChild disabled={uploading} className="cursor-pointer">
              <span>
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}{" "}
                Anexar arquivo
              </span>
            </Button>
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
          <p className="text-xs text-muted-foreground">PDF, imagem ou documento — até 20MB.</p>
        </div>

        {isLoading ? (
          <Skeleton className="h-16" />
        ) : !files || files.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nenhum arquivo anexado ainda.
          </p>
        ) : (
          <div className="space-y-2">
            {files.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{f.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {FILE_KINDS.find((k) => k.value === f.file_type)?.label ?? "Arquivo"} ·{" "}
                      {fmtDateTime(f.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    title="Baixar"
                    onClick={() => download(f)}
                  >
                    <Download className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    title="Remover"
                    onClick={() => remove(f)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
