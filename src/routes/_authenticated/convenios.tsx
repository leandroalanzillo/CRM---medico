import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { useInsuranceProviders } from "@/lib/hooks";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatCard } from "@/components/stat-card";
import {
  ShieldPlus,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Phone,
  Mail,
  Loader2,
  Users,
  UserRound,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type InsuranceProvider = Database["public"]["Tables"]["insurance_providers"]["Row"];

export const Route = createFileRoute("/_authenticated/convenios")({ component: ConveniosPage });

function ConveniosPage() {
  const { clinic, hasRole } = useApp();
  const isAdmin = hasRole("admin", "manager");
  const queryClient = useQueryClient();
  const { data, isLoading } = useInsuranceProviders(clinic?.id);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InsuranceProvider | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InsuranceProvider | null>(null);

  // Live patient counts per convênio. This is what "atualiza automaticamente"
  // really means here: it's just a query keyed on the patients table, so the
  // moment a patient's convênio is set/changed elsewhere in the app, this
  // view reflects it on the next fetch/focus — no separate sync needed.
  const { data: patientCounts } = useQuery({
    queryKey: ["patients-by-insurance", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, insurance_provider_id, insurance, active")
        .eq("clinic_id", clinic!.id);
      const rows = data ?? [];
      const byProvider = new Map<string, number>();
      let particular = 0;
      let activeTotal = 0;
      for (const p of rows) {
        if (p.active === false) continue;
        activeTotal++;
        if (p.insurance_provider_id) {
          byProvider.set(
            p.insurance_provider_id,
            (byProvider.get(p.insurance_provider_id) ?? 0) + 1,
          );
        } else if (!p.insurance?.trim()) {
          particular++;
        }
      }
      return { byProvider, particular, activeTotal };
    },
  });

  async function remove() {
    if (!deleteTarget) return;
    const { error } = await supabase.from("insurance_providers").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error("Não foi possível excluir: pode haver pacientes vinculados a este convênio.");
    } else {
      toast.success("Convênio excluído.");
      queryClient.invalidateQueries({ queryKey: ["insurance-providers", clinic?.id] });
    }
    setDeleteTarget(null);
  }

  return (
    <div>
      <PageHeader
        title="Convênios"
        description="Planos de saúde aceitos pela clínica."
        actions={
          isAdmin ? (
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="size-4" /> Novo convênio
            </Button>
          ) : undefined
        }
      />

      {patientCounts && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Pacientes ativos"
            value={patientCounts.activeTotal}
            icon={Users}
            accent="primary"
          />
          <StatCard
            label="Com convênio"
            value={patientCounts.activeTotal - patientCounts.particular}
            icon={ShieldPlus}
            accent="info"
          />
          <StatCard
            label="Particular"
            value={patientCounts.particular}
            icon={UserRound}
            accent="warning"
          />
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={ShieldPlus}
          title="Nenhum convênio cadastrado"
          description="Cadastre os planos de saúde aceitos para vincular aos pacientes."
          action={
            isAdmin ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <Plus className="size-4" /> Novo convênio
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => (
            <Card key={c.id} className={`p-4 shadow-soft ${!c.active ? "opacity-60" : ""}`}>
              <CardContent className="flex items-start justify-between p-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{c.name}</p>
                    {!c.active && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inativo
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-primary">
                    <Users className="size-3" />
                    {patientCounts?.byProvider.get(c.id) ?? 0} paciente(s) vinculado(s)
                  </p>
                  {c.ans_registry && (
                    <p className="text-xs text-muted-foreground">Registro ANS: {c.ans_registry}</p>
                  )}
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {c.phone && (
                      <p className="flex items-center gap-1">
                        <Phone className="size-3" /> {c.phone}
                      </p>
                    )}
                    {c.email && (
                      <p className="flex items-center gap-1">
                        <Mail className="size-3" /> {c.email}
                      </p>
                    )}
                    {c.reimbursement_days != null && <p>Repasse em ~{c.reimbursement_days} dias</p>}
                  </div>
                </div>
                {isAdmin && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditing(c);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="size-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteTarget(c)}
                      >
                        <Trash2 className="size-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <InsuranceDialog open={open} onOpenChange={setOpen} provider={editing} />

      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir convênio?</DialogTitle>
            <DialogDescription>
              Remove {deleteTarget?.name} da lista. Pacientes vinculados a este convênio impedem a
              exclusão — desvincule-os primeiro.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={remove}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InsuranceDialog({
  open,
  onOpenChange,
  provider,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  provider: InsuranceProvider | null;
}) {
  const { clinic } = useApp();
  const queryClient = useQueryClient();
  const isEdit = !!provider;
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [ans, setAns] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [days, setDays] = useState("");
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(provider?.name ?? "");
    setAns(provider?.ans_registry ?? "");
    setPhone(provider?.phone ?? "");
    setEmail(provider?.email ?? "");
    setDays(provider?.reimbursement_days != null ? String(provider.reimbursement_days) : "");
    setActive(provider?.active ?? true);
    setNotes(provider?.notes ?? "");
  }, [open, provider]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!clinic) return;
    if (!name.trim()) return toast.error("Informe o nome do convênio.");
    setLoading(true);

    const payload = {
      clinic_id: clinic.id,
      name: name.trim(),
      ans_registry: ans.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      reimbursement_days: days ? Number(days) : null,
      active,
      notes: notes.trim() || null,
    };

    const { error } = isEdit
      ? await supabase.from("insurance_providers").update(payload).eq("id", provider!.id)
      : await supabase.from("insurance_providers").insert(payload);

    setLoading(false);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["insurance-providers", clinic.id] });
    toast.success(isEdit ? "Convênio atualizado." : "Convênio criado.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar convênio" : "Novo convênio"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Unimed, Bradesco Saúde..."
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Registro ANS</Label>
              <Input value={ans} onChange={(e) => setAns(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Prazo de repasse (dias)</Label>
              <Input type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="font-normal">Convênio ativo</Label>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}{" "}
              {isEdit ? "Salvar" : "Criar convênio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
