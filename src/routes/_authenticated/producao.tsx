import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { brl } from "@/lib/format";
import { TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/producao")({ component: ProducaoPage });

function ProducaoPage() {
  const { clinic } = useApp();
  const { data, isLoading } = useQuery({
    queryKey: ["producao", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const [{ data: profs }, { data: appts }] = await Promise.all([
        supabase.from("professionals").select("id, name").eq("clinic_id", clinic!.id),
        supabase.from("appointments").select("professional_id, status, produced_value, patient_id").eq("clinic_id", clinic!.id),
      ]);
      return (profs ?? []).map((p) => {
        const rows = (appts ?? []).filter((a) => a.professional_id === p.id);
        const finished = rows.filter((a) => a.status === "finished");
        const value = finished.reduce((s, a) => s + Number(a.produced_value ?? 0), 0);
        const patients = new Set(rows.map((a) => a.patient_id)).size;
        return { id: p.id, name: p.name, count: finished.length, value, patients,
          ticket: finished.length ? value / finished.length : 0 };
      }).sort((a, b) => b.value - a.value);
    },
  });

  return (
    <div>
      <PageHeader title="Produção" description="Produtividade e faturamento por profissional." />
      {isLoading ? <Skeleton className="h-64" /> : !data || data.length === 0 ? (
        <EmptyState icon={TrendingUp} title="Sem dados de produção" description="Finalize atendimentos para acompanhar a produção." />
      ) : (
        <Card>
          <Table>
            <TableHeader><TableRow>
              <TableHead>#</TableHead><TableHead>Profissional</TableHead><TableHead>Atendimentos</TableHead>
              <TableHead>Pacientes</TableHead><TableHead>Ticket médio</TableHead><TableHead className="text-right">Produção</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell className="font-bold text-muted-foreground">{i + 1}º</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.count}</TableCell>
                  <TableCell>{r.patients}</TableCell>
                  <TableCell>{brl(r.ticket)}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{brl(r.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
