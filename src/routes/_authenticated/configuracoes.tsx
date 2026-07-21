import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp, type AppRole } from "@/lib/app-context";
import { useProfessionals, useProcedures } from "@/lib/hooks";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ProfessionalDialog } from "@/components/professional-dialog";
import { ProcedureDialog } from "@/components/procedure-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { initials, ROLE_LABELS, brl } from "@/lib/format";
import { formatRegistration } from "@/lib/validators";
import {
  Users,
  Lock,
  Plus,
  Pencil,
  UserX,
  UserCheck,
  Trash2,
  X,
  Stethoscope,
  Clock,
} from "lucide-react";
import { NotificationSettings } from "@/components/notification-settings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type Professional = Database["public"]["Tables"]["professionals"]["Row"];
type Procedure = Database["public"]["Tables"]["procedures"]["Row"];
const ALL_ROLES: AppRole[] = ["admin", "manager", "receptionist", "professional", "commercial"];

export const Route = createFileRoute("/_authenticated/configuracoes")({ component: ConfigPage });

function ConfigPage() {
  const { clinic, hasRole } = useApp();
  const queryClient = useQueryClient();
  const { data: professionals } = useProfessionals(clinic?.id);
  const { data: procedures } = useProcedures(clinic?.id);
  const isAdmin = hasRole("admin", "manager");

  // Profissionais
  const [profDialogOpen, setProfDialogOpen] = useState(false);
  const [editingProf, setEditingProf] = useState<Professional | null>(null);
  const [blockedProf, setBlockedProf] = useState<Professional | null>(null);

  function openNewProf() {
    setEditingProf(null);
    setProfDialogOpen(true);
  }
  function openEditProf(p: Professional) {
    setEditingProf(p);
    setProfDialogOpen(true);
  }

  async function toggleProfActive(p: Professional) {
    const { error } = await supabase
      .from("professionals")
      .update({ active: !p.active })
      .eq("id", p.id);
    if (error) return toast.error("Não foi possível atualizar o status.");
    toast.success(p.active ? "Profissional inativado." : "Profissional reativado.");
    queryClient.invalidateQueries({ queryKey: ["professionals", clinic?.id] });
  }

  async function tryDeleteProf(p: Professional) {
    const { count } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("professional_id", p.id);
    if ((count ?? 0) > 0) {
      setBlockedProf(p);
      return;
    }
    const { error } = await supabase.from("professionals").delete().eq("id", p.id);
    if (error) {
      setBlockedProf(p);
      return;
    }
    toast.success("Profissional excluído.");
    queryClient.invalidateQueries({ queryKey: ["professionals", clinic?.id] });
  }

  // Procedimentos
  const [procDialogOpen, setProcDialogOpen] = useState(false);
  const [editingProc, setEditingProc] = useState<Procedure | null>(null);
  const [blockedProc, setBlockedProc] = useState<Procedure | null>(null);

  function openNewProc() {
    setEditingProc(null);
    setProcDialogOpen(true);
  }
  function openEditProc(p: Procedure) {
    setEditingProc(p);
    setProcDialogOpen(true);
  }

  async function toggleProcActive(p: Procedure) {
    const { error } = await supabase
      .from("procedures")
      .update({ active: !p.active })
      .eq("id", p.id);
    if (error) return toast.error("Não foi possível atualizar o status.");
    toast.success(p.active ? "Procedimento inativado." : "Procedimento reativado.");
    queryClient.invalidateQueries({ queryKey: ["procedures", clinic?.id] });
  }

  async function tryDeleteProc(p: Procedure) {
    const { count } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("procedure_id", p.id);
    if ((count ?? 0) > 0) {
      setBlockedProc(p);
      return;
    }
    const { error } = await supabase.from("procedures").delete().eq("id", p.id);
    if (error) {
      setBlockedProc(p);
      return;
    }
    toast.success("Procedimento excluído.");
    queryClient.invalidateQueries({ queryKey: ["procedures", clinic?.id] });
  }

  // Usuários & Permissões
  const { data: members } = useQuery({
    queryKey: ["members", clinic?.id],
    enabled: !!clinic?.id && isAdmin,
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, full_name").eq("clinic_id", clinic!.id),
        supabase.from("user_roles").select("user_id, role").eq("clinic_id", clinic!.id),
      ]);
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
      }));
    },
  });

  async function addRole(userId: string, role: AppRole) {
    const { error } = await supabase
      .from("user_roles")
      .upsert({ user_id: userId, clinic_id: clinic!.id, role }, { onConflict: "user_id,role" });
    if (error) return toast.error("Não foi possível adicionar a permissão.");
    toast.success("Permissão adicionada.");
    queryClient.invalidateQueries({ queryKey: ["members", clinic?.id] });
  }

  async function removeRole(userId: string, role: AppRole, remainingRoles: string[]) {
    if (remainingRoles.length <= 1) {
      return toast.error(
        "O usuário precisa de pelo menos uma permissão. Adicione outra antes de remover esta.",
      );
    }
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("clinic_id", clinic!.id)
      .eq("role", role);
    if (error) return toast.error("Não foi possível remover a permissão.");
    toast.success("Permissão removida.");
    queryClient.invalidateQueries({ queryKey: ["members", clinic?.id] });
  }

  return (
    <div>
      <PageHeader
        title="Configurações"
        description="Clínica, equipe, procedimentos e permissões."
      />
      <Tabs defaultValue="team">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="team">Profissionais</TabsTrigger>
          <TabsTrigger value="procedures">Procedimentos</TabsTrigger>
          <TabsTrigger value="users">Permissões</TabsTrigger>
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
        </TabsList>

        <TabsContent value="team">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Profissionais</CardTitle>
              {isAdmin && (
                <Button size="sm" onClick={openNewProf}>
                  <Plus className="size-4" /> Novo profissional
                </Button>
              )}
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {professionals?.length ? (
                professionals.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 ${p.active === false ? "opacity-60" : ""}`}
                  >
                    <span
                      className="size-3 shrink-0 rounded-full"
                      style={{ background: p.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{p.name}</p>
                        {p.active === false && (
                          <Badge variant="outline" className="text-muted-foreground">
                            Inativo
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.specialty?.name ?? "Sem especialidade"}
                        {p.registration && ` · ${formatRegistration(p.registration)}`}
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditProf(p)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => toggleProfActive(p)}>
                          {p.active === false ? (
                            <UserCheck className="size-4" />
                          ) : (
                            <UserX className="size-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => tryDeleteProf(p)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={Users}
                  title="Nenhum profissional cadastrado"
                  description="Cadastre médicos e demais profissionais para vinculá-los à agenda."
                  action={
                    isAdmin ? (
                      <Button onClick={openNewProf}>
                        <Plus className="size-4" /> Novo profissional
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="procedures">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Procedimentos</CardTitle>
              {isAdmin && (
                <Button size="sm" onClick={openNewProc}>
                  <Plus className="size-4" /> Novo procedimento
                </Button>
              )}
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {procedures?.length ? (
                procedures.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 ${p.active === false ? "opacity-60" : ""}`}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Stethoscope className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{p.name}</p>
                        {p.active === false && (
                          <Badge variant="outline" className="text-muted-foreground">
                            Inativo
                          </Badge>
                        )}
                      </div>
                      <p className="flex items-center gap-2 truncate text-xs text-muted-foreground">
                        {brl(Number(p.default_price ?? 0))}
                        <span className="flex items-center gap-0.5">
                          <Clock className="size-3" /> {p.duration_minutes ?? 30}min
                        </span>
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditProc(p)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => toggleProcActive(p)}>
                          {p.active === false ? (
                            <UserCheck className="size-4" />
                          ) : (
                            <UserX className="size-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => tryDeleteProc(p)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={Stethoscope}
                  title="Nenhum procedimento cadastrado"
                  description="Sem procedimentos, o campo fica vazio na hora de agendar. Cadastre os que sua clínica oferece."
                  action={
                    isAdmin ? (
                      <Button onClick={openNewProc}>
                        <Plus className="size-4" /> Novo procedimento
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          {!isAdmin ? (
            <EmptyState
              icon={Lock}
              title="Acesso restrito"
              description="Apenas administradores e gestores gerenciam usuários."
            />
          ) : members && members.length > 0 ? (
            <Card>
              <CardContent className="divide-y p-0">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-4">
                    <Avatar className="size-9">
                      <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                        {initials(m.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <p className="flex-1 font-medium">{m.full_name}</p>
                    <div className="flex flex-wrap items-center gap-1">
                      {m.roles.map((r) => (
                        <Badge key={r} variant="secondary" className="gap-1 pr-1">
                          {ROLE_LABELS[r]}
                          <button
                            type="button"
                            onClick={() => removeRole(m.id, r as AppRole, m.roles)}
                            className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                            aria-label={`Remover permissão ${ROLE_LABELS[r]}`}
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ))}
                      <Select onValueChange={(v) => addRole(m.id, v as AppRole)}>
                        <SelectTrigger className="h-7 w-40 text-xs">
                          <SelectValue placeholder="+ Adicionar permissão" />
                        </SelectTrigger>
                        <SelectContent>
                          {ALL_ROLES.filter((r) => !m.roles.includes(r)).map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <EmptyState icon={Users} title="Sem usuários" />
          )}
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationSettings />
        </TabsContent>
      </Tabs>

      <ProfessionalDialog
        open={profDialogOpen}
        onOpenChange={(v) => {
          setProfDialogOpen(v);
          if (!v) setEditingProf(null);
        }}
        professional={editingProf}
      />
      <ProcedureDialog
        open={procDialogOpen}
        onOpenChange={(v) => {
          setProcDialogOpen(v);
          if (!v) setEditingProc(null);
        }}
        procedure={editingProc}
      />

      <AlertDialog open={!!blockedProf} onOpenChange={(v) => !v && setBlockedProf(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Não é possível excluir</AlertDialogTitle>
            <AlertDialogDescription>
              {blockedProf?.name} possui consultas vinculadas na agenda. Para preservar o histórico
              clínico, exclusões de profissionais com atendimentos são bloqueadas — use "Inativar"
              para removê-lo da agenda sem perder os registros.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBlockedProf(null)}>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!blockedProc} onOpenChange={(v) => !v && setBlockedProc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Não é possível excluir</AlertDialogTitle>
            <AlertDialogDescription>
              {blockedProc?.name} está vinculado a consultas já registradas. Use "Inativar" para
              removê-lo das opções de novo agendamento sem perder o histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBlockedProc(null)}>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
