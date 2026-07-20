import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { PatientDialog } from "@/components/patient-dialog";
import { AppointmentDialog } from "@/components/appointment-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { fmtDate, initials } from "@/lib/format";
import {
  Users,
  Plus,
  Search,
  Phone,
  MoreVertical,
  Pencil,
  UserX,
  UserCheck,
  Trash2,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Patient = Database["public"]["Tables"]["patients"]["Row"];

export const Route = createFileRoute("/_authenticated/pacientes/")({
  component: PatientsPage,
});

type PatientRow = Patient & { professional: { name: string } | null };

const PAGE_SIZE = 10;

function PatientsPage() {
  const { clinic } = useApp();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("active");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PatientRow | null>(null);
  const [schedulePrompt, setSchedulePrompt] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["patients", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*, professional:professionals(name)")
        .eq("clinic_id", clinic!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PatientRow[];
    },
  });

  const filtered = (data ?? [])
    .filter((p) =>
      status === "all" ? true : status === "active" ? p.active !== false : p.active === false,
    )
    .filter((p) =>
      [p.full_name, p.phone, p.email, p.cpf].some((v) =>
        v?.toLowerCase().includes(q.toLowerCase()),
      ),
    );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Any change to search/status/status can shrink the result set below the
  // current page — snap back to page 1 instead of showing an empty page.
  function updateSearch(v: string) {
    setQ(v);
    setPage(1);
  }
  function updateStatus(v: typeof status) {
    setStatus(v);
    setPage(1);
  }

  function openEdit(p: Patient, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEditing(p);
    setOpen(true);
  }

  async function toggleActive(p: Patient, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const { error } = await supabase.from("patients").update({ active: !p.active }).eq("id", p.id);
    if (error) return toast.error("Não foi possível atualizar o status.");
    toast.success(p.active ? "Paciente inativado." : "Paciente reativado.");
    queryClient.invalidateQueries({ queryKey: ["patients", clinic?.id] });
  }

  function askDelete(p: PatientRow, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDeleteTarget(p);
  }

  async function confirmDelete() {
    if (!deleteTarget || !clinic) return;
    setDeleteBusy(true);
    // Referential integrity check, mirroring ClinicCare: a patient with linked
    // appointments or pipeline history cannot be hard-deleted, only inactivated.
    const [{ count: apptCount }, { count: cardCount }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("patient_id", deleteTarget.id),
      supabase
        .from("pipeline_cards")
        .select("id", { count: "exact", head: true })
        .eq("patient_id", deleteTarget.id),
    ]);

    if ((apptCount ?? 0) > 0 || (cardCount ?? 0) > 0) {
      setDeleteBusy(false);
      setDeleteTarget(null);
      toast.error(
        `${deleteTarget.full_name} possui consultas ou negociações vinculadas e não pode ser excluído. Use "Inativar" para arquivá-lo.`,
      );
      return;
    }

    const { error } = await supabase.from("patients").delete().eq("id", deleteTarget.id);
    setDeleteBusy(false);
    if (error) {
      toast.error("Não foi possível excluir: existem registros vinculados a este paciente.");
      return;
    }
    toast.success("Paciente excluído.");
    setDeleteTarget(null);
    queryClient.invalidateQueries({ queryKey: ["patients", clinic?.id] });
  }

  return (
    <div>
      <PageHeader
        title="Pacientes"
        description="Leads e pacientes cadastrados na clínica."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> Novo
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome, telefone, CPF..."
            value={q}
            onChange={(e) => updateSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={(v) => updateStatus(v as typeof status)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum paciente encontrado"
          description="Cadastre seu primeiro lead ou paciente para começar."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="size-4" /> Novo paciente
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {paged.map((p) => (
            <Link key={p.id} to="/pacientes/$id" params={{ id: p.id }}>
              <Card
                className={`flex items-center gap-4 p-4 shadow-soft transition-shadow hover:shadow-card ${p.active === false ? "opacity-60" : ""}`}
              >
                <Avatar className="size-11">
                  <AvatarFallback className="bg-primary/15 text-primary font-semibold">
                    {initials(p.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{p.full_name}</p>
                    <Badge
                      variant={p.kind === "patient" ? "default" : "secondary"}
                      className="capitalize"
                    >
                      {p.kind === "patient" ? "Paciente" : "Lead"}
                    </Badge>
                    {p.active === false && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inativo
                      </Badge>
                    )}
                  </div>
                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    {p.phone && (
                      <>
                        <Phone className="size-3" /> {p.phone}
                      </>
                    )}
                    {p.professional && <span className="ml-2">· {p.professional.name}</span>}
                  </p>
                </div>
                <div className="hidden text-right text-xs text-muted-foreground sm:block">
                  <p>Cadastro</p>
                  <p>{fmtDate(p.created_at)}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={(e) => e.preventDefault()}>
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => openEdit(p, e)}>
                      <Pencil className="size-4" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => toggleActive(p, e)}>
                      {p.active === false ? (
                        <>
                          <UserCheck className="size-4" /> Reativar
                        </>
                      ) : (
                        <>
                          <UserX className="size-4" /> Inativar
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={(e) => askDelete(p, e)}
                    >
                      <Trash2 className="size-4" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            Mostrando {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filtered.length)} de {filtered.length} paciente
            {filtered.length === 1 ? "" : "s"}
          </p>
          {totalPages > 1 && (
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    aria-disabled={safePage === 1}
                    className={safePage === 1 ? "pointer-events-none opacity-50" : ""}
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.max(1, p - 1));
                    }}
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }).map((_, i) => {
                  const n = i + 1;
                  // Keep the pager compact on long lists: always show first,
                  // last, current, and its immediate neighbors.
                  if (totalPages > 7 && n !== 1 && n !== totalPages && Math.abs(n - safePage) > 1) {
                    if (n === 2 || n === totalPages - 1) {
                      return (
                        <PaginationItem key={n}>
                          <span className="px-2 text-muted-foreground">…</span>
                        </PaginationItem>
                      );
                    }
                    return null;
                  }
                  return (
                    <PaginationItem key={n}>
                      <PaginationLink
                        href="#"
                        isActive={n === safePage}
                        onClick={(e) => {
                          e.preventDefault();
                          setPage(n);
                        }}
                      >
                        {n}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    aria-disabled={safePage === totalPages}
                    className={safePage === totalPages ? "pointer-events-none opacity-50" : ""}
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.min(totalPages, p + 1));
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      )}

      <PatientDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
        patient={editing}
        onCreated={(newPatientId) => setSchedulePrompt(newPatientId)}
      />

      {/* Right after creating a patient, offer to schedule their first appointment
          immediately — this is the missing link the "cadastro -> agendamento ->
          calendário do profissional" flow needed. */}
      <AlertDialog open={!!schedulePrompt} onOpenChange={(v) => !v && setSchedulePrompt(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Agendar consulta agora?</AlertDialogTitle>
            <AlertDialogDescription>
              O paciente foi cadastrado. Quer marcar a primeira consulta já, com o profissional
              vinculado a ele pré-selecionado?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSchedulePrompt(null)}>Depois</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setScheduleFor(schedulePrompt);
                setSchedulePrompt(null);
              }}
            >
              Agendar agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AppointmentDialog
        open={!!scheduleFor}
        onOpenChange={(v) => !v && setScheduleFor(null)}
        initialPatientId={scheduleFor ?? undefined}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir paciente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente e remove {deleteTarget?.full_name} da base. Se houver consultas
              ou negociações vinculadas, a exclusão será bloqueada e sugerimos inativar o cadastro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={deleteBusy} onClick={confirmDelete}>
              {deleteBusy ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
