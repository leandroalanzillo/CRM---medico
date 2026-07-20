import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { addTimeline, addAudit, addNegotiationHistory } from "@/lib/crm";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { NegotiationDialog, type NegotiationEditable } from "@/components/negotiation-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brl, fmtDate, fmtDateTime, NEGOTIATION_STATUS } from "@/lib/format";
import { Handshake, Plus, Pencil, Check, X, Clock, CalendarClock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/negociacoes")({ component: NegPage });

type NegRow = {
  id: string; patient_id: string; professional_id: string | null; title: string; status: string;
  original_value: number; discount: number; final_value: number; payment_method: string | null;
  installments: number | null; valid_until: string | null; created_at: string;
  patient: { id: string; full_name: string; kind: string } | null;
  professional: { name: string } | null;
};

const FILTERS = [
  { value: "all", label: "Todas" },
  { value: "negotiating", label: "Em negociação" },
  { value: "awaiting", label: "Aguardando" },
  { value: "accepted", label: "Aceitas" },
  { value: "rejected", label: "Recusadas" },
];

function NegPage() {
  const { clinic } = useApp();
  const [filter, setFilter] = useState("all");
  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState<NegotiationEditable | null>(null);
  const [selected, setSelected] = useState<NegRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["negs", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { data } = await supabase.from("negotiations")
        .select("*, patient:patients(id, full_name, kind), professional:professionals(name)")
        .eq("clinic_id", clinic!.id).order("created_at", { ascending: false });
      return (data ?? []) as unknown as NegRow[];
    },
  });

  const rows = useMemo(
    () => (data ?? []).filter((n) => filter === "all" || n.status === filter),
    [data, filter],
  );

  const summary = useMemo(() => {
    const all = data ?? [];
    const open = all.filter((n) => ["negotiating", "awaiting"].includes(n.status));
    const accepted = all.filter((n) => n.status === "accepted");
    const decided = all.filter((n) => ["accepted", "rejected"].includes(n.status));
    return {
      openCount: open.length,
      openValue: open.reduce((s, n) => s + Number(n.final_value), 0),
      acceptedValue: accepted.reduce((s, n) => s + Number(n.final_value), 0),
      winRate: decided.length ? Math.round((accepted.length / decided.length) * 100) : 0,
    };
  }, [data]);

  return (
    <div>
      <PageHeader title="Negociações" description="Orçamentos e planos de tratamento."
        actions={<Button onClick={() => { setEditing(null); setOpenNew(true); }}><Plus className="size-4" /> Nova negociação</Button>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Em aberto" value={summary.openCount} icon={Handshake} accent="warning" />
        <StatCard label="Valor em aberto" value={brl(summary.openValue)} icon={CalendarClock} accent="info" />
        <StatCard label="Fechado (aceito)" value={brl(summary.acceptedValue)} icon={Check} accent="success" />
        <StatCard label="Taxa de fechamento" value={`${summary.winRate}%`} icon={Handshake} accent="primary" />
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList className="mb-4 flex-wrap">
          {FILTERS.map((f) => <TabsTrigger key={f.value} value={f.value}>{f.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="grid gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : rows.length > 0 ? (
        <div className="grid gap-3">
          {rows.map((n) => (
            <Card key={n.id} className="cursor-pointer p-4 shadow-soft transition-shadow hover:shadow-card" onClick={() => setSelected(n)}>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{n.patient?.full_name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {n.title} · {fmtDate(n.created_at)}
                    {n.professional && <> · {n.professional.name}</>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="font-semibold text-primary">{brl(n.final_value)}</span>
                  <Badge className={NEGOTIATION_STATUS[n.status].className}>{NEGOTIATION_STATUS[n.status].label}</Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={Handshake} title="Nenhuma negociação"
          description="Crie um orçamento manualmente ou finalize uma consulta com proposta pendente."
          action={<Button onClick={() => { setEditing(null); setOpenNew(true); }}><Plus className="size-4" /> Nova negociação</Button>} />
      )}

      <NegotiationDialog open={openNew} onOpenChange={setOpenNew} negotiation={editing} />
      <NegDrawer
        neg={selected}
        onClose={() => setSelected(null)}
        onEdit={(n) => { setSelected(null); setEditing(n); setOpenNew(true); }}
      />
    </div>
  );
}

function NegDrawer({ neg, onClose, onEdit }: { neg: NegRow | null; onClose: () => void; onEdit: (n: NegotiationEditable) => void }) {
  const { clinic, userId } = useApp();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: items } = useQuery({
    queryKey: ["neg-items", neg?.id],
    enabled: !!neg?.id,
    queryFn: async () => {
      const { data } = await supabase.from("negotiation_items").select("*").eq("negotiation_id", neg!.id).order("created_at");
      return data ?? [];
    },
  });
  const { data: history } = useQuery({
    queryKey: ["neg-history", neg?.id],
    enabled: !!neg?.id,
    queryFn: async () => {
      const { data } = await supabase.from("negotiation_history").select("*").eq("negotiation_id", neg!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  async function setStatus(status: "negotiating" | "awaiting" | "accepted" | "rejected", label: string) {
    if (!neg || !clinic) return;
    setBusy(true);
    const { error } = await supabase.from("negotiations").update({ status, updated_at: new Date().toISOString() }).eq("id", neg.id);
    if (error) { setBusy(false); return toast.error(error.message); }

    await addNegotiationHistory({ clinicId: clinic.id, negotiationId: neg.id, actorId: userId, description: `Status alterado para "${label}"` });
    if (neg.patient) {
      await addTimeline({
        clinicId: clinic.id, patientId: neg.patient.id, eventType: "negotiation", actorId: userId,
        description: `Negociação "${neg.title}" — ${label.toLowerCase()}.`,
      });
      // On acceptance, promote a lead to an active patient.
      if (status === "accepted" && neg.patient.kind === "lead") {
        await supabase.from("patients").update({ kind: "patient" }).eq("id", neg.patient.id);
        await addTimeline({ clinicId: clinic.id, patientId: neg.patient.id, eventType: "conversion", actorId: userId, description: "Lead convertido em paciente após aceite da proposta." });
      }
    }
    await addAudit({ clinicId: clinic.id, userId, action: "update", resourceType: "negotiation", resourceId: neg.id, changes: { status } });
    setBusy(false);
    queryClient.invalidateQueries();
    toast.success(`Negociação: ${label.toLowerCase()}.`);
    onClose();
  }

  return (
    <Sheet open={!!neg} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {neg && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center justify-between gap-2 pr-6">
                <span className="truncate">{neg.title}</span>
                <Badge className={NEGOTIATION_STATUS[neg.status].className}>{NEGOTIATION_STATUS[neg.status].label}</Badge>
              </SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-5 px-4 pb-8">
              <div className="text-sm">
                <Link to="/pacientes/$id" params={{ id: neg.patient?.id ?? "" }} className="font-semibold text-primary hover:underline">
                  {neg.patient?.full_name}
                </Link>
                {neg.professional && <span className="text-muted-foreground"> · {neg.professional.name}</span>}
              </div>

              <Card><CardContent className="p-4">
                {items && items.length > 0 ? (
                  <div className="space-y-2">
                    {items.map((i) => (
                      <div key={i.id} className="flex items-center justify-between text-sm">
                        <span>{i.quantity}× {i.description}</span>
                        <span className="font-medium">{brl(i.quantity * Number(i.unit_price))}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">Sem itens.</p>}
                <div className="mt-3 space-y-1 border-t pt-3 text-sm">
                  <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{brl(neg.original_value)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Desconto</span><span>- {brl(neg.discount)}</span></div>
                  <div className="flex justify-between font-bold text-primary"><span>Total</span><span>{brl(neg.final_value)}</span></div>
                </div>
              </CardContent></Card>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Pagamento</p><p className="font-medium">{neg.payment_method || "—"}{neg.installments && neg.installments > 1 ? ` · ${neg.installments}x` : ""}</p></div>
                <div><p className="text-xs text-muted-foreground">Validade</p><p className="font-medium">{neg.valid_until ? fmtDate(neg.valid_until) : "—"}</p></div>
              </div>

              {neg.status !== "accepted" && neg.status !== "rejected" && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy} onClick={() => setStatus("accepted", "Aceito")}><Check className="size-4" /> Aceitar</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus("awaiting", "Aguardando resposta")}><Clock className="size-4" /> Aguardando</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus("rejected", "Recusado")}><X className="size-4" /> Recusar</Button>
                </div>
              )}
              <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => onEdit({
                id: neg.id, patient_id: neg.patient_id, professional_id: neg.professional_id, title: neg.title,
                discount: neg.discount, payment_method: neg.payment_method, installments: neg.installments, valid_until: neg.valid_until,
              })}>
                <Pencil className="size-4" /> Editar orçamento
              </Button>

              <div>
                <p className="mb-2 text-sm font-semibold">Histórico</p>
                {history && history.length > 0 ? (
                  <ol className="relative space-y-4 border-l pl-5">
                    {history.map((h) => (
                      <li key={h.id} className="relative">
                        <span className="absolute -left-[22px] top-1 size-2.5 rounded-full bg-primary/40 ring-4 ring-background" />
                        <p className="text-sm">{h.description}</p>
                        <p className="text-xs text-muted-foreground">{fmtDateTime(h.created_at)}</p>
                      </li>
                    ))}
                  </ol>
                ) : <p className="text-sm text-muted-foreground">Sem registros.</p>}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
