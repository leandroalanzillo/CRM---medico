import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { useProfessionals, useNotificationSettings } from "@/lib/hooks";
import { WA_STATUS } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { Loader2, Lock, MessageSquare } from "lucide-react";

export function NotificationSettings() {
  const { clinic, hasRole } = useApp();
  const isAdmin = hasRole("admin", "manager");
  const { data: settings } = useNotificationSettings(clinic?.id);
  const { data: professionals } = useProfessionals(clinic?.id);
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    notify_patient_email: true,
    notify_patient_whatsapp: true,
    notify_patient_sms: false,
    reminder_enabled: true,
    reminder_hours_before: 18,
    notify_professional: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        notify_patient_email: settings.notify_patient_email,
        notify_patient_whatsapp: settings.notify_patient_whatsapp,
        notify_patient_sms: settings.notify_patient_sms,
        reminder_enabled: settings.reminder_enabled,
        reminder_hours_before: settings.reminder_hours_before,
        notify_professional: settings.notify_professional,
      });
    }
  }, [settings]);

  const { data: wa } = useQuery({
    queryKey: ["wa-conn", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_connections")
        .select("*")
        .eq("clinic_id", clinic!.id)
        .maybeSingle();
      return data;
    },
  });

  async function save() {
    if (!clinic) return;
    setSaving(true);
    const { error } = await supabase
      .from("notification_settings")
      .upsert({ clinic_id: clinic.id, ...form }, { onConflict: "clinic_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["notification-settings", clinic.id] });
    toast.success("Preferências de notificação salvas.");
  }

  if (!isAdmin) {
    return (
      <EmptyState
        icon={Lock}
        title="Acesso restrito"
        description="Apenas administradores e gestores ajustam as notificações."
      />
    );
  }

  const waStatus = WA_STATUS[wa?.status ?? "disconnected"];

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notificações de agendamento</CardTitle>
          <CardDescription>Avisos enviados ao paciente ao criar um agendamento.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between">
            <Label className="font-normal">Notificar paciente por e-mail</Label>
            <Switch
              checked={form.notify_patient_email}
              onCheckedChange={(v) => setForm((f) => ({ ...f, notify_patient_email: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="font-normal">Notificar paciente por WhatsApp</Label>
            <Switch
              checked={form.notify_patient_whatsapp}
              onCheckedChange={(v) => setForm((f) => ({ ...f, notify_patient_whatsapp: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="font-normal">Notificar paciente por SMS</Label>
            <Switch
              checked={form.notify_patient_sms}
              onCheckedChange={(v) => setForm((f) => ({ ...f, notify_patient_sms: v }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lembrete de confirmação</CardTitle>
          <CardDescription>
            Enviado quando faltar a quantidade de horas configurada para a consulta.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between">
            <Label className="font-normal">Ativar lembrete automático</Label>
            <Switch
              checked={form.reminder_enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, reminder_enabled: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="font-normal">Também avisar o profissional (colaborador)</Label>
            <Switch
              checked={form.notify_professional}
              onCheckedChange={(v) => setForm((f) => ({ ...f, notify_professional: v }))}
            />
          </div>
          <div className="flex max-w-xs items-center justify-between gap-3">
            <Label className="font-normal">Horas antes da consulta</Label>
            <Input
              type="number"
              min={1}
              max={72}
              className="w-24"
              value={form.reminder_hours_before}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  reminder_hours_before: Math.min(72, Math.max(1, Number(e.target.value) || 1)),
                }))
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Ex.: 18 = lembrete disparado 18 horas antes do horário da consulta (verificação
            horária).
          </p>
        </CardContent>
      </Card>

      <div>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />} Salvar preferências
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="size-4" /> Conexão WhatsApp
          </CardTitle>
          <CardDescription>Envio via Meta WhatsApp Cloud API.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Badge className={waStatus.className}>{waStatus.label}</Badge>
          <p className="text-sm text-muted-foreground">
            As credenciais da Cloud API são configuradas com segurança no servidor. Sem elas, os
            envios de WhatsApp ficam registrados como falha no histórico.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SMS</CardTitle>
          <CardDescription>Envio via provedor compatível com Twilio.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_FROM_NUMBER no servidor para
            ativar o envio. Sem essas credenciais, os envios de SMS ficam registrados como falha no
            histórico — o app não trava por isso.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contato dos profissionais</CardTitle>
          <CardDescription>Necessário para avisar o colaborador na véspera.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {professionals?.map((p) => (
            <ProfessionalContact key={p.id} pro={p} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ProfessionalContact({
  pro,
}: {
  pro: { id: string; name: string; email: string | null; phone: string | null };
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(pro.email ?? "");
  const [phone, setPhone] = useState(pro.phone ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = email !== (pro.email ?? "") || phone !== (pro.phone ?? "");

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("professionals")
      .update({ email: email || null, phone: phone || null })
      .eq("id", pro.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["professionals"] });
    toast.success(`Contato de ${pro.name} atualizado.`);
  }

  return (
    <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{pro.name} — e-mail</Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@exemplo.com"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">WhatsApp/telefone</Label>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="55 11 99999-0000"
        />
      </div>
      <Button size="sm" variant="outline" onClick={save} disabled={!dirty || saving}>
        {saving && <Loader2 className="size-4 animate-spin" />} Salvar
      </Button>
    </div>
  );
}
