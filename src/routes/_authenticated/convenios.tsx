import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { ShieldPlus, Plus, MoreVertical, Pencil, Trash2, Phone, Mail, Loader2 } from "lucide-react";
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
