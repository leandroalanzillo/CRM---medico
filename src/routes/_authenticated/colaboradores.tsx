import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { brl, initials, ROLE_LABELS } from "@/lib/format";
import { UserCog, Lock, Stethoscope, Headset } from "lucide-react";

export const Route = createFileRoute("/_authenticated/colaboradores")({
  component: ColaboradoresPage,
});

function ColaboradoresPage() {
  const { clinic, hasRole } = useApp();
  const isAdmin = hasRole("admin", "manager");

  const { data, isLoading } = useQuery({
    queryKey: ["colaboradores", clinic?.id],
    enabled: !!clinic?.id && isAdmin,
    queryFn: async () => {
      const [{ data: profs }, { data: appts }, { data: profiles }, { data: roles }] =
        await Promise.all([
          supabase.from("professionals").select("id, name, active").eq("clinic_id", clinic!.id),
          supabase
            .from("appointments")
            .select("professional_id, status, produced_value, patient_id, created_by")
            .eq("clinic_id", clinic!.id),
          supabase.from("profiles").select("id, full_name").eq("clinic_id", clinic!.id),
          supabase.from("user_roles").select("user_id, role").eq("clinic_id", clinic!.id),
        ]);

      const doctors = (profs ?? []).map((p) => {
        const rows = (appts ?? []).filter((a) => a.professional_id === p.id);
        const finished = rows.filter((a) => a.status === "finished");
        const revenue = finished.reduce((s, a) => s + Number(a.produced_value ?? 0), 0);
        const patients = new Set(rows.map((a) => a.patient_id)).size;
        const noShow = rows.filter((a) => a.status === "no_show").length;
        return {
          id: p.id,
          name: p.name,
          active: p.active,
          appointments: rows.length,
          finished: finished.length,
          revenue,
          patients,
          noShow,
          ticket: finished.length ? revenue / finished.length : 0,
        };
      });

      const staff = (profiles ?? []).map((prof) => {
        const roleRows = (roles ?? []).filter((r) => r.user_id === prof.id);
        const scheduled = (appts ?? []).filter((a) => a.created_by === prof.id).length;
        return {
          id: prof.id,
          name: prof.full_name,
          roles: roleRows.map((r) => r.role),
          scheduled,
        };
      });

      return { doctors: doctors.sort((a, b) => b.revenue - a.revenue), staff };
    },
  });

  const totalRevenue = useMemo(
    () => (data?.doctors ?? []).reduce((s, d) => s + d.revenue, 0),
    [data],
  );

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Colaboradores" description="Rendimento e produtividade da equipe." />
        <EmptyState
          icon={Lock}
          title="Acesso restrito"
          description="Apenas administradores e gestores acompanham o rendimento da equipe."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Colaboradores"
        description="Rendimento, receita e produtividade de cada colaborador."
      />

      {isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Stethoscope className="size-4" /> Médicos — produção e receita
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!data || data.doctors.length === 0 ? (
                <EmptyState
                  icon={UserCog}
                  title="Nenhum profissional cadastrado"
                  description="Cadastre médicos em Configurações."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Profissional</TableHead>
                      <TableHead className="text-right">Agendamentos</TableHead>
                      <TableHead className="text-right">Finalizados</TableHead>
                      <TableHead className="text-right">Faltas</TableHead>
                      <TableHead className="text-right">Pacientes</TableHead>
                      <TableHead className="text-right">Ticket médio</TableHead>
                      <TableHead className="text-right">Receita gerada</TableHead>
                      <TableHead className="text-right">% do total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.doctors.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <div className="flex items-center gap-2 font-medium">
                            {d.name}
                            {!d.active && (
                              <Badge variant="outline" className="text-muted-foreground">
                                Inativo
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{d.appointments}</TableCell>
                        <TableCell className="text-right">{d.finished}</TableCell>
                        <TableCell className="text-right text-destructive">
                          {d.noShow || "—"}
                        </TableCell>
                        <TableCell className="text-right">{d.patients}</TableCell>
                        <TableCell className="text-right">{brl(d.ticket)}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">
                          {brl(d.revenue)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {totalRevenue > 0
                            ? `${((d.revenue / totalRevenue) * 100).toFixed(0)}%`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Headset className="size-4" /> Equipe — atividade
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!data || data.staff.length === 0 ? (
                <EmptyState
                  icon={UserCog}
                  title="Nenhum usuário na equipe"
                  description="Convide usuários em Configurações → Usuários & Permissões."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Função</TableHead>
                      <TableHead className="text-right">Agendamentos criados</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.staff.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="size-7">
                              <AvatarFallback className="text-xs">
                                {initials(s.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{s.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {s.roles.map((r) => (
                              <Badge key={r} variant="secondary">
                                {ROLE_LABELS[r] ?? r}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{s.scheduled}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            "Agendamentos criados" mede quantas consultas cada usuário marcou no sistema — uma proxy
            direta de produtividade para quem não gera receita própria (recepção/comercial). Para
            métricas mais ricas (tempo de resposta, confirmações realizadas), será necessário
            registrar essas ações separadamente.
          </p>
        </div>
      )}
    </div>
  );
}
