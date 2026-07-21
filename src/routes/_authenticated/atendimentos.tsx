import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, ExternalLink, QrCode, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { WA_STATUS } from "@/lib/format";
import { WhatsAppConnectDialog } from "@/components/whatsapp-connect-dialog";

export const Route = createFileRoute("/_authenticated/atendimentos")({
  component: AtendimentosPage,
});

function onlyDigits(s: string | null | undefined) {
  return (s ?? "").replace(/\D+/g, "");
}

function waLink(phone: string, message?: string) {
  const num = onlyDigits(phone);
  const q = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${num}${q}`;
}

function AtendimentosPage() {
  const { clinic } = useApp();
  const [search, setSearch] = useState("");
  const [template, setTemplate] = useState(
    "Olá! Aqui é da clínica. Tudo bem? Podemos confirmar seu atendimento?",
  );

  const { data: patients } = useQuery({
    queryKey: ["patients-wa", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, full_name, phone")
        .eq("clinic_id", clinic!.id)
        .order("full_name");
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const withPhone = (patients ?? []).filter((p) => onlyDigits(p.phone).length >= 10);
    if (!q) return withPhone;
    return withPhone.filter(
      (p) => p.full_name.toLowerCase().includes(q) || onlyDigits(p.phone).includes(onlyDigits(q)),
    );
  }, [patients, search]);

  const { data: waConn } = useQuery({
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
  const [waDialogOpen, setWaDialogOpen] = useState(false);
  const waStatus = WA_STATUS[waConn?.status ?? "disconnected"];

  return (
    <div>
      <PageHeader
        title="Atendimentos"
        description="Abra conversas de WhatsApp com seus pacientes em um clique."
        actions={
          <Button variant="outline" onClick={() => setWaDialogOpen(true)}>
            <QrCode className="size-4" />
            {waConn?.status === "connected" ? "WhatsApp conectado" : "Conectar WhatsApp"}
            <Badge className={`${waStatus.className} ml-1`}>{waStatus.label}</Badge>
          </Button>
        }
      />

      <WhatsAppConnectDialog open={waDialogOpen} onOpenChange={setWaDialogOpen} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="size-4" /> Mensagem padrão
            </CardTitle>
            <CardDescription>Enviada junto ao abrir o WhatsApp de um paciente.</CardDescription>
          </CardHeader>
          <CardContent>
            <Input value={template} onChange={(e) => setTemplate(e.target.value)} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="gap-2">
            <CardTitle className="text-base">Pacientes com WhatsApp</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar paciente por nome ou telefone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {search && (
              <p className="text-xs text-muted-foreground">
                {filtered.length} paciente{filtered.length === 1 ? "" : "s"} encontrado
                {filtered.length === 1 ? "" : "s"} — clique em um para abrir o WhatsApp.
              </p>
            )}
          </CardHeader>
          <CardContent>
            {filtered.length > 0 ? (
              <div className="divide-y">
                {filtered.map((p) => (
                  <a
                    key={p.id}
                    href={waLink(p.phone ?? "", template)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.full_name}</p>
                      <p className="text-sm text-muted-foreground">{p.phone}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      tabIndex={-1}
                      className="pointer-events-none"
                    >
                      <MessageCircle className="size-4" /> Abrir WhatsApp
                      <ExternalLink className="size-3 opacity-60" />
                    </Button>
                  </a>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={MessageCircle}
                title="Nenhum paciente com telefone"
                description="Cadastre o telefone (com DDD e DDI, ex.: 55 11 99999-0000) na ficha do paciente para abrir conversas por aqui."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
