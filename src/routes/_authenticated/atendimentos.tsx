import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, ExternalLink, Info } from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/atendimentos")({ component: AtendimentosPage });

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
    "Olá! Aqui é da clínica. Tudo bem? Podemos confirmar seu atendimento?"
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
      (p) => p.full_name.toLowerCase().includes(q) || onlyDigits(p.phone).includes(onlyDigits(q))
    );
  }, [patients, search]);

  return (
    <div>
      <PageHeader title="Atendimentos" description="Abra conversas de WhatsApp com seus pacientes em um clique." />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="size-4" /> Como funciona
            </CardTitle>
            <CardDescription>Modo gratuito, sem QR Code.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Ao clicar em <strong>Abrir WhatsApp</strong>, o WhatsApp Web (ou app do celular) abre já com o número
              do paciente e uma mensagem sugerida.
            </p>
            <p>
              As respostas acontecem no próprio WhatsApp — não voltam para dentro do CRM. Para receber mensagens
              aqui, seria necessário contratar um provedor pago (Cloud API oficial ou Evolution/Z-API).
            </p>
            <div className="space-y-2 pt-2">
              <label className="text-xs font-medium text-foreground">Mensagem padrão</label>
              <Input value={template} onChange={(e) => setTemplate(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="gap-2">
            <CardTitle className="text-base">Pacientes com WhatsApp</CardTitle>
            <Input
              placeholder="Buscar por nome ou telefone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </CardHeader>
          <CardContent>
            {filtered.length > 0 ? (
              <div className="divide-y">
                {filtered.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.full_name}</p>
                      <p className="text-sm text-muted-foreground">{p.phone}</p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <a href={waLink(p.phone ?? "", template)} target="_blank" rel="noreferrer">
                        <MessageCircle className="size-4" /> Abrir WhatsApp
                        <ExternalLink className="size-3 opacity-60" />
                      </a>
                    </Button>
                  </div>
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
