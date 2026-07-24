import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDateTime, initials } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ShieldAlert, Lock, FileHeart, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/auditoria")({ component: AuditoriaPage });

const ACTION_LABELS: Record<string, { label: string; className: string }> = {
  create: { label: "Criação", className: "bg-success/15 text-success" },
  update: { label: "Atualização", className: "bg-info/15 text-info" },
  delete: { label: "Exclusão", className: "bg-destructive/15 text-destructive" },
  lgpd_export: { label: "Exportação LGPD", className: "bg-warning/20 text-warning-foreground" },
  lgpd_erase: { label: "Apagamento LGPD", className: "bg-destructive/15 text-destructive" },
};

const RESOURCE_LABELS: Record<string, string> = {
  patient: "Paciente",
  professional: "Profissional",
  procedure: "Procedimento",
  appointment: "Agendamento",
  financial_transaction: "Lançamento financeiro",
  negotiation: "Negociação",
  insurance_provider: "Convênio",
  waitlist: "Lista de espera",
  user_role: "Permissão de usuário",
};

const FIELD_LABELS: Record<string, string> = {
  status: "status",
  amount: "valor",
  description: "descrição",
  full_name: "nome",
  active: "ativo",
};

/** Turns { status: "paid" } into "status: paid" — readable at a glance,
 * instead of raw, unformatted JSON. */
function summarizeChanges(changes: unknown): string {
  if (!changes || typeof changes !== "object") return "—";
  const entries = Object.entries(changes as Record<string, unknown>);
  if (entries.length === 0) return "—";
  return entries
    .slice(0, 4)
    .map(
      ([k, v]) =>
        `${FIELD_LABELS[k] ?? k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`,
    )
    .join(" · ");
}

function AuditoriaPage() {
  const { clinic, hasRole } = useApp();
  const isAdmin = hasRole("admin");
  const [search, setSearch] = useState("");

  const { data: logs, isLoading: loadingLogs } = useQuery({
    queryKey: ["audit-logs", clinic?.id],
    enabled: !!clinic?.id && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("clinic_id", clinic!.id)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data;
    },
  });

  const { data: recordAccess, isLoading: loadingAccess } = useQuery({
    queryKey: ["mr-access-logs", clinic?.id],
    enabled: !!clinic?.id && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medical_record_access_logs")
        .select("*, patient:patients(full_name)")
        .eq("clinic_id", clinic!.id)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data;
    },
  });

  // audit_logs/medical_record_access_logs.user_id references auth.users,
  // not public.profiles — there's no FK PostgREST can use to embed the
  // name automatically, so this fetches profiles once and matches them
  // client-side instead.
  const { data: profileNames } = useQuery({
    queryKey: ["profile-names", clinic?.id],
    enabled: !!clinic?.id && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("clinic_id", clinic!.id);
      if (error) throw error;
      return new Map((data ?? []).map((p) => [p.id, p.full_name]));
    },
  });
  const nameFor = (userId: string | null) => (userId ? (profileNames?.get(userId) ?? null) : null);

  if (!isAdmin) {
    return (
      <div>
        <PageHeader
          title="Auditoria"
          description="Registro de ações e acessos a dados sensíveis."
        />
        <EmptyState
          icon={Lock}
          title="Acesso restrito"
          description="Apenas administradores e gestores acompanham a auditoria."
        />
      </div>
    );
  }

  const q = search.toLowerCase();
  const filteredLogs = (logs ?? []).filter(
    (l) =>
      !q ||
      l.action.toLowerCase().includes(q) ||
      l.resource_type.toLowerCase().includes(q) ||
      nameFor(l.user_id)?.toLowerCase().includes(q),
  );
  const filteredAccess = (recordAccess ?? []).filter(
    (a) =>
      !q ||
      nameFor(a.user_id)?.toLowerCase().includes(q) ||
      (a.patient as { full_name: string } | null)?.full_name?.toLowerCase().includes(q),
  );

  return (
    <div>
      <PageHeader
        title="Auditoria"
        description="Registro de ações e acessos a dados sensíveis — importante para responder a uma solicitação de fiscalização (LGPD/ANPD)."
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por usuário, ação, paciente…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Tabs defaultValue="logs">
        <TabsList className="mb-4">
          <TabsTrigger value="logs">Ações no sistema</TabsTrigger>
          <TabsTrigger value="records">Acessos a prontuário</TabsTrigger>
        </TabsList>

        <TabsContent value="logs">
          <Card>
            <CardContent className="p-0">
              {loadingLogs ? (
                <Skeleton className="h-64" />
              ) : filteredLogs.length === 0 ? (
                <EmptyState
                  icon={ShieldAlert}
                  title="Nenhum registro"
                  description="Ainda não há ações registradas."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Recurso</TableHead>
                      <TableHead>Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((l) => {
                      const profileName = nameFor(l.user_id);
                      const meta = ACTION_LABELS[l.action] ?? {
                        label: l.action,
                        className: "bg-muted text-muted-foreground",
                      };
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {fmtDateTime(l.created_at)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="size-6">
                                <AvatarFallback className="text-[10px]">
                                  {initials(profileName)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm">{profileName ?? "Sistema"}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={meta.className}>{meta.label}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {RESOURCE_LABELS[l.resource_type] ?? l.resource_type}
                          </TableCell>
                          <TableCell
                            className="max-w-xs truncate text-xs text-muted-foreground"
                            title={summarizeChanges(l.changes)}
                          >
                            {summarizeChanges(l.changes)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="records">
          <Card>
            <CardContent className="p-0">
              {loadingAccess ? (
                <Skeleton className="h-64" />
              ) : filteredAccess.length === 0 ? (
                <EmptyState
                  icon={FileHeart}
                  title="Nenhum acesso registrado"
                  description="Ainda não há registros de acesso a prontuário."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Quem acessou</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccess.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {fmtDateTime(a.created_at)}
                        </TableCell>
                        <TableCell className="text-sm">{nameFor(a.user_id) ?? "—"}</TableCell>
                        <TableCell className="text-sm font-medium">
                          {(a.patient as { full_name: string } | null)?.full_name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {a.action === "view_record" ? "Visualizou prontuário" : a.action}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
