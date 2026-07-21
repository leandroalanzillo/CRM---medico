import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { useProfessionals } from "@/lib/hooks";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { brl, fmtDate } from "@/lib/format";
import { Download, BarChart3, Printer, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/relatorios")({ component: RelatoriosPage });

const CHART = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const PERIODS = [
  { value: "week", label: "7 dias" },
  { value: "month", label: "Este mês" },
  { value: "last_month", label: "Mês passado" },
  { value: "quarter", label: "90 dias" },
  { value: "year", label: "Este ano" },
  { value: "custom", label: "Personalizado" },
];

function rangeFor(period: string, cf: string, ct: string) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "week") start.setDate(start.getDate() - 6);
  else if (period === "month") start.setDate(1);
  else if (period === "last_month") {
    start.setMonth(start.getMonth() - 1, 1);
    end.setDate(0);
    end.setHours(23, 59, 59, 999);
  } else if (period === "quarter") start.setDate(start.getDate() - 89);
  else if (period === "year") {
    start.setMonth(0, 1);
  } else if (period === "custom") {
    return {
      start: cf ? new Date(cf + "T00:00:00") : start,
      end: ct ? new Date(ct + "T23:59:59") : end,
    };
  }
  return { start, end };
}

// CSV com BOM para abrir corretamente no Excel BR (acentos + ; como separador)
function toCSV(rows: Record<string, string | number>[], sep = ";"): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /["\n;,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => headers.map((h) => esc(r[h])).join(sep));
  return "\uFEFF" + [headers.join(sep), ...body].join("\n");
}
function download(name: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (k: string) => {
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
};

type ApptRow = {
  id: string;
  status: string;
  produced_value: number | null;
  professional_id: string;
  starts_at: string;
  patient_id: string;
  procedure_id: string | null;
  notes: string | null;
  patient: {
    full_name: string;
    cpf: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
    birth_date: string | null;
  } | null;
  procedure: { name: string; default_price: number | null } | null;
  professional: { name: string; registration: string | null } | null;
};

function RelatoriosPage() {
  const { clinic } = useApp();
  const { data: professionals } = useProfessionals(clinic?.id);
  const [period, setPeriod] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [profId, setProfId] = useState<string>("all");
  const { start, end } = useMemo(() => rangeFor(period, from, to), [period, from, to]);

  const { data, isLoading } = useQuery({
    queryKey: ["reports", clinic?.id, iso(start), iso(end)],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const cid = clinic!.id;
      const [patients, appts, negs] = await Promise.all([
        supabase
          .from("patients")
          .select(
            "id, full_name, cpf, address, email, phone, birth_date, kind, created_at, source, professional_id",
          )
          .eq("clinic_id", cid),
        supabase
          .from("appointments")
          .select(
            "id, status, produced_value, professional_id, starts_at, patient_id, procedure_id, notes, patient:patients(full_name, cpf, address, email, phone, birth_date), procedure:procedures(name, default_price), professional:professionals(name, registration)",
          )
          .eq("clinic_id", cid)
          .gte("starts_at", start.toISOString())
          .lte("starts_at", end.toISOString()),
        supabase
          .from("negotiations")
          .select("id, status, final_value, created_at, patient_id, professional_id")
          .eq("clinic_id", cid)
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString()),
      ]);
      return {
        P: patients.data ?? [],
        A: (appts.data ?? []) as unknown as ApptRow[],
        N: negs.data ?? [],
      };
    },
  });

  const r = useMemo(() => {
    if (!data) return null;
    const inRange = (d: string) => {
      const t = new Date(d);
      return t >= start && t <= end;
    };
    let A = data.A;
    if (profId !== "all") A = A.filter((a) => a.professional_id === profId);
    const P = data.P.filter(
      (p) => inRange(p.created_at) && (profId === "all" || p.professional_id === profId),
    );
    const N = data.N.filter(
      (n) =>
        inRange(n.created_at) &&
        (profId === "all" || (n as { professional_id?: string }).professional_id === profId),
    );

    const scheduledPatients = new Set(A.map((a) => a.patient_id)).size;
    const finished = A.filter((a) => a.status === "finished");
    const cancelled = A.filter((a) => a.status === "cancelled" || a.status === "no_show");
    const accepted = N.filter((n) => n.status === "accepted");

    const funnel = [
      { name: "Novos leads", value: P.length, fill: CHART[0] },
      { name: "Agendaram", value: scheduledPatients, fill: CHART[1] },
      { name: "Compareceram", value: finished.length, fill: CHART[2] },
      { name: "Cancelaram", value: cancelled.length, fill: CHART[3] },
    ];

    const sourceMap: Record<string, number> = {};
    P.forEach((p) => {
      const s = p.source || "Não informado";
      sourceMap[s] = (sourceMap[s] ?? 0) + 1;
    });
    const sources = Object.entries(sourceMap).map(([name, value], i) => ({
      name,
      value,
      fill: CHART[i % CHART.length],
    }));

    const profFilter =
      profId === "all"
        ? (professionals ?? [])
        : (professionals ?? []).filter((p) => p.id === profId);
    const ranking = profFilter
      .map((p) => {
        const rows = finished.filter((a) => a.professional_id === p.id);
        const value = rows.reduce((s, a) => s + Number(a.produced_value ?? 0), 0);
        return {
          id: p.id,
          name: p.name,
          registration: p.registration ?? "",
          count: rows.length,
          value,
          ticket: rows.length ? value / rows.length : 0,
        };
      })
      .filter((x) => x.count > 0)
      .sort((a, b) => b.value - a.value);

    // Por procedimento
    const procMap = new Map<string, { name: string; count: number; value: number }>();
    finished.forEach((a) => {
      const key = a.procedure?.name || "Sem procedimento";
      const cur = procMap.get(key) ?? { name: key, count: 0, value: 0 };
      cur.count += 1;
      cur.value += Number(a.produced_value ?? 0);
      procMap.set(key, cur);
    });
    const byProcedure = Array.from(procMap.values())
      .map((x) => ({ ...x, ticket: x.count ? x.value / x.count : 0 }))
      .sort((a, b) => b.value - a.value);

    // Faturamento mensal (série)
    const monthly = new Map<
      string,
      { key: string; label: string; realizado: number; agendado: number; count: number }
    >();
    A.forEach((a) => {
      const d = new Date(a.starts_at);
      const k = monthKey(d);
      const cur = monthly.get(k) ?? {
        key: k,
        label: monthLabel(k),
        realizado: 0,
        agendado: 0,
        count: 0,
      };
      if (a.status === "finished") {
        cur.realizado += Number(a.produced_value ?? 0);
        cur.count += 1;
      } else if (a.status !== "cancelled" && a.status !== "no_show") {
        cur.agendado += Number(a.produced_value ?? a.procedure?.default_price ?? 0);
      }
      monthly.set(k, cur);
    });
    const monthlySeries = Array.from(monthly.values()).sort((a, b) => a.key.localeCompare(b.key));

    // Linhas para nota fiscal (por atendimento finalizado)
    const invoiceRows = finished
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map((a, idx) => ({
        "#": idx + 1,
        Data: fmtDate(a.starts_at),
        Paciente: a.patient?.full_name ?? "—",
        CPF: a.patient?.cpf ?? "",
        Nascimento: a.patient?.birth_date ? fmtDate(a.patient.birth_date) : "",
        Endereço: a.patient?.address ?? "",
        Email: a.patient?.email ?? "",
        Telefone: a.patient?.phone ?? "",
        Profissional: a.professional?.name ?? "",
        Registro: a.professional?.registration ?? "",
        Procedimento: a.procedure?.name ?? "Consulta",
        "Valor (R$)": Number(a.produced_value ?? 0)
          .toFixed(2)
          .replace(".", ","),
        Observações: (a.notes ?? "").replace(/\n/g, " "),
      }));

    const totalProduction = finished.reduce((s, a) => s + Number(a.produced_value ?? 0), 0);
    const acceptedValue = accepted.reduce((s, n) => s + Number(n.final_value ?? 0), 0);
    const forecast = A.filter(
      (a) => a.status !== "cancelled" && a.status !== "no_show" && a.status !== "finished",
    ).reduce((s, a) => s + Number(a.produced_value ?? a.procedure?.default_price ?? 0), 0);

    return {
      funnel,
      sources,
      ranking,
      byProcedure,
      monthlySeries,
      invoiceRows,
      totalProduction,
      acceptedValue,
      forecast,
      appts: A.length,
      finished,
      cancelled,
      P,
      N,
    };
  }, [data, start, end, professionals, profId]);

  const periodTag =
    period === "custom" && from && to ? `${from}_a_${to}` : `${iso(start)}_a_${iso(end)}`;

  const exportAll = () => {
    if (!r) return;
    download(
      `producao_por_profissional_${periodTag}.csv`,
      toCSV(
        r.ranking.map((x) => ({
          Profissional: x.name,
          Registro: x.registration,
          Atendimentos: x.count,
          "Ticket medio": x.ticket.toFixed(2).replace(".", ","),
          Producao: x.value.toFixed(2).replace(".", ","),
        })),
      ),
    );
    download(
      `producao_por_procedimento_${periodTag}.csv`,
      toCSV(
        r.byProcedure.map((x) => ({
          Procedimento: x.name,
          Quantidade: x.count,
          "Ticket medio": x.ticket.toFixed(2).replace(".", ","),
          Total: x.value.toFixed(2).replace(".", ","),
        })),
      ),
    );
    download(`notas_fiscais_${periodTag}.csv`, toCSV(r.invoiceRows));
  };

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Indicadores operacionais e comerciais consolidados do período."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" /> Imprimir
            </Button>
            <Button size="sm" onClick={exportAll} disabled={!r}>
              <Download className="size-4" /> Exportar tudo
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {period === "custom" && (
          <>
            <Input
              type="date"
              className="w-auto"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              type="date"
              className="w-auto"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </>
        )}
        <Select value={profId} onValueChange={setProfId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Profissional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos profissionais</SelectItem>
            {(professionals ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="ml-auto">
          {fmtDate(start)} — {fmtDate(end)}
        </Badge>
      </div>

      {isLoading || !r ? (
        <div className="grid gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Receita realizada</p>
                <p className="text-2xl font-bold text-primary">{brl(r.totalProduction)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.finished.length} atendimento(s) finalizado(s)
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Fechado em negociações</p>
                <p className="text-2xl font-bold text-success">{brl(r.acceptedValue)}</p>
                <p className="mt-1 text-xs text-muted-foreground">valor aceito no período</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Previsto (agenda)</p>
                <p className="text-2xl font-bold">{brl(r.forecast)}</p>
                <p className="mt-1 text-xs text-muted-foreground">consultas ainda por realizar</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Cancelamentos / faltas</p>
                <p className="text-2xl font-bold text-destructive">{r.cancelled.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.appts
                    ? `${((r.cancelled.length / r.appts) * 100).toFixed(1)}% dos agendamentos`
                    : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="overview">
            <TabsList className="mb-4 flex-wrap">
              <TabsTrigger value="overview">Visão geral</TabsTrigger>
              <TabsTrigger value="procedures">Por procedimento</TabsTrigger>
              <TabsTrigger value="downloads">Downloads</TabsTrigger>
            </TabsList>

            {/* ================= OVERVIEW ================= */}
            <TabsContent value="overview" className="grid gap-4">
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base">Funil de conversão</CardTitle>
                  </CardHeader>
                  <CardContent className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={r.funnel} layout="vertical" margin={{ left: 20, right: 16 }}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          horizontal={false}
                        />
                        <XAxis
                          type="number"
                          allowDecimals={false}
                          tick={{ fontSize: 12 }}
                          stroke="var(--muted-foreground)"
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={110}
                          tick={{ fontSize: 12 }}
                          stroke="var(--muted-foreground)"
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }}
                        />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                          {r.funnel.map((f, i) => (
                            <Cell key={i} fill={f.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Origem dos leads</CardTitle>
                  </CardHeader>
                  <CardContent className="h-72">
                    {r.sources.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        Sem dados.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={r.sources} dataKey="value" nameKey="name" outerRadius={85}>
                            {r.sources.map((s, i) => (
                              <Cell key={i} fill={s.fill} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Ranking de produção</CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!r.ranking.length}
                    onClick={() =>
                      download(
                        `producao_profissional_${periodTag}.csv`,
                        toCSV(
                          r.ranking.map((x) => ({
                            Profissional: x.name,
                            Registro: x.registration,
                            Atendimentos: x.count,
                            "Ticket medio": x.ticket.toFixed(2).replace(".", ","),
                            Producao: x.value.toFixed(2).replace(".", ","),
                          })),
                        ),
                      )
                    }
                  >
                    <Download className="size-4" /> CSV
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  {r.ranking.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
                      <BarChart3 className="size-8 opacity-40" /> Sem produção no período.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Profissional</TableHead>
                          <TableHead>Registro</TableHead>
                          <TableHead>Atendimentos</TableHead>
                          <TableHead>Ticket médio</TableHead>
                          <TableHead className="text-right">Produção</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {r.ranking.map((x, i) => (
                          <TableRow key={x.id}>
                            <TableCell className="font-bold text-muted-foreground">
                              {i + 1}º
                            </TableCell>
                            <TableCell className="font-medium">{x.name}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {x.registration || "—"}
                            </TableCell>
                            <TableCell>{x.count}</TableCell>
                            <TableCell>{brl(x.ticket)}</TableCell>
                            <TableCell className="text-right font-semibold text-primary">
                              {brl(x.value)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ================= PROCEDURES ================= */}
            <TabsContent value="procedures">
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Receita por procedimento</CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!r.byProcedure.length}
                    onClick={() =>
                      download(
                        `procedimentos_${periodTag}.csv`,
                        toCSV(
                          r.byProcedure.map((x) => ({
                            Procedimento: x.name,
                            Quantidade: x.count,
                            "Ticket medio": x.ticket.toFixed(2).replace(".", ","),
                            Total: x.value.toFixed(2).replace(".", ","),
                          })),
                        ),
                      )
                    }
                  >
                    <Download className="size-4" /> CSV
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  {r.byProcedure.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      Sem procedimentos finalizados no período.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Procedimento</TableHead>
                          <TableHead>Quantidade</TableHead>
                          <TableHead>Ticket médio</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right w-40">% da receita</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {r.byProcedure.map((x) => {
                          const pct = r.totalProduction ? (x.value / r.totalProduction) * 100 : 0;
                          return (
                            <TableRow key={x.name}>
                              <TableCell className="font-medium">{x.name}</TableCell>
                              <TableCell>{x.count}</TableCell>
                              <TableCell>{brl(x.ticket)}</TableCell>
                              <TableCell className="text-right font-semibold text-primary">
                                {brl(x.value)}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {pct.toFixed(1)}%
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

            {/* ================= DOWNLOADS ================= */}
            <TabsContent value="downloads">
              <div className="grid gap-3 sm:grid-cols-2">
                <DownloadCard
                  title="Pacientes cadastrados no período"
                  description="Cadastro completo (nome, CPF, contato, endereço, convênio) para importação."
                  count={r.P.length}
                  onClick={() =>
                    download(
                      `pacientes_${periodTag}.csv`,
                      toCSV(
                        r.P.map((p) => ({
                          Nome: p.full_name,
                          CPF: p.cpf ?? "",
                          Nascimento: p.birth_date ? fmtDate(p.birth_date) : "",
                          Email: p.email ?? "",
                          Telefone: p.phone ?? "",
                          Endereco: p.address ?? "",
                          Origem: p.source ?? "",
                          Tipo: p.kind,
                          "Cadastrado em": fmtDate(p.created_at),
                        })),
                      ),
                    )
                  }
                />
                <DownloadCard
                  title="Agenda completa"
                  description="Todos os agendamentos do período com status, valor e profissional."
                  count={r.appts}
                  onClick={() =>
                    download(
                      `agenda_${periodTag}.csv`,
                      toCSV(
                        data!.A.map((a) => ({
                          Data: fmtDate(a.starts_at),
                          Paciente: a.patient?.full_name ?? "",
                          Profissional: a.professional?.name ?? "",
                          Procedimento: a.procedure?.name ?? "",
                          Status: a.status,
                          Valor: Number(a.produced_value ?? 0)
                            .toFixed(2)
                            .replace(".", ","),
                        })),
                      ),
                    )
                  }
                />
                <DownloadCard
                  title="Notas fiscais (finalizados)"
                  description="Base pronta para emissão de NFS-e / recibos, com CPF e endereço."
                  count={r.invoiceRows.length}
                  onClick={() => download(`notas_fiscais_${periodTag}.csv`, toCSV(r.invoiceRows))}
                />
                <DownloadCard
                  title="Negociações fechadas"
                  description="Fechamentos comerciais aceitos, ideal para conciliação de vendas."
                  count={r.N.filter((n) => n.status === "accepted").length}
                  onClick={() =>
                    download(
                      `negociacoes_${periodTag}.csv`,
                      toCSV(
                        r.N.filter((n) => n.status === "accepted").map((n) => ({
                          Data: fmtDate(n.created_at),
                          Valor: Number(n.final_value ?? 0)
                            .toFixed(2)
                            .replace(".", ","),
                          Status: n.status,
                        })),
                      ),
                    )
                  }
                />
                <DownloadCard
                  title="Produção por profissional"
                  description="Repasse a médicos/dentistas — atendimentos, ticket e produção total."
                  count={r.ranking.length}
                  onClick={() =>
                    download(
                      `producao_profissional_${periodTag}.csv`,
                      toCSV(
                        r.ranking.map((x) => ({
                          Profissional: x.name,
                          Registro: x.registration,
                          Atendimentos: x.count,
                          "Ticket medio": x.ticket.toFixed(2).replace(".", ","),
                          Producao: x.value.toFixed(2).replace(".", ","),
                        })),
                      ),
                    )
                  }
                />
                <DownloadCard
                  title="Produção por procedimento"
                  description="Consolidação por tipo de serviço prestado."
                  count={r.byProcedure.length}
                  onClick={() =>
                    download(
                      `procedimentos_${periodTag}.csv`,
                      toCSV(
                        r.byProcedure.map((x) => ({
                          Procedimento: x.name,
                          Quantidade: x.count,
                          "Ticket medio": x.ticket.toFixed(2).replace(".", ","),
                          Total: x.value.toFixed(2).replace(".", ","),
                        })),
                      ),
                    )
                  }
                />
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function DownloadCard({
  title,
  description,
  count,
  onClick,
}: {
  title: string;
  description: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-5">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <FileSpreadsheet className="size-5" />
        </div>
        <div className="flex-1">
          <p className="font-medium">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{count} registro(s)</Badge>
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={!count} onClick={onClick}>
          <Download className="size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
