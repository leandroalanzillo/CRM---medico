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
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { useProfessionals } from "@/lib/hooks";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { brl, APPOINTMENT_STATUS } from "@/lib/format";
import {
  Users,
  CalendarCheck,
  CalendarX,
  Wallet,
  CalendarClock,
  Percent,
  UserPlus,
  Activity,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: DashboardPage });

const CHART = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function rangeFor(period: string, customFrom: string, customTo: string) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "today") return { start, end };
  if (period === "week") {
    start.setDate(start.getDate() - 6);
    return { start, end };
  }
  if (period === "month") {
    start.setDate(1);
    return { start, end };
  }
  if (period === "custom") {
    const s = customFrom ? new Date(customFrom + "T00:00:00") : start;
    const e = customTo ? new Date(customTo + "T23:59:59") : end;
    return { start: s, end: e };
  }
  start.setDate(1);
  return { start, end };
}

const PERIODS = [
  { value: "today", label: "Hoje" },
  { value: "week", label: "7 dias" },
  { value: "month", label: "Este mês" },
  { value: "custom", label: "Personalizado" },
];

function DashboardPage() {
  const { clinic, profile } = useApp();
  const { data: professionals } = useProfessionals(clinic?.id);
  const [period, setPeriod] = useState("month");
  const [prof, setProf] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { start, end } = useMemo(() => rangeFor(period, from, to), [period, from, to]);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", clinic?.id, period, prof, from, to],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const cid = clinic!.id;
      const [patients, appts, negs, tx] = await Promise.all([
        supabase
          .from("patients")
          .select("id, kind, active, created_at, professional_id, source")
          .eq("clinic_id", cid),
        supabase
          .from("appointments")
          .select("id, status, produced_value, professional_id, patient_id, starts_at")
          .eq("clinic_id", cid),
        supabase
          .from("negotiations")
          .select("id, status, final_value, created_at")
          .eq("clinic_id", cid),
        supabase
          .from("financial_transactions")
          .select("id, type, status, amount, paid_at")
          .eq("clinic_id", cid)
          .eq("type", "income")
          .eq("status", "paid"),
      ]);
      return { P: patients.data ?? [], A: appts.data ?? [], N: negs.data ?? [], TX: tx.data ?? [] };
    },
  });

  const m = useMemo(() => {
    if (!data) return null;
    const inRange = (d: string) => {
      const t = new Date(d);
      return t >= start && t <= end;
    };
    const profOk = (pid: string | null) => prof === "all" || pid === prof;

    const A = data.A.filter((a) => inRange(a.starts_at) && profOk(a.professional_id));
    const P = data.P.filter((p) => profOk(p.professional_id));
    const newLeads = P.filter((p) => inRange(p.created_at));

    const scheduled = A.filter((a) => ["scheduled", "confirmed"].includes(a.status)).length;
    const finished = A.filter((a) => a.status === "finished");
    const cancelled = A.filter((a) => ["cancelled", "no_show"].includes(a.status)).length;
    const attendance =
      finished.length + cancelled > 0
        ? Math.round((finished.length / (finished.length + cancelled)) * 100)
        : 0;
    const production = finished.reduce((s, a) => s + Number(a.produced_value ?? 0), 0);

    // Revenue actually collected in the period — ties the dashboard to
    // Financeiro, which is now the clinic's real money-tracking module
    // (replaces the old CRM-funnel "Conversão" card).
    const revenue = data.TX.filter((t) => t.paid_at && inRange(t.paid_at)).reduce(
      (s, t) => s + Number(t.amount),
      0,
    );

    // Active patients with no appointment scheduled from now on — the
    // direct, actionable follow-up to the "próxima consulta" marker added
    // to the Pacientes list (replaces the old CRM-funnel "Em negociação" card).
    const now = new Date();
    const patientsWithFuture = new Set(
      data.A.filter((a) => a.status !== "cancelled" && new Date(a.starts_at) >= now)
        .map((a) => a.patient_id)
        .filter(Boolean),
    );
    const noFutureAppt = data.P.filter(
      (p) => p.active !== false && !patientsWithFuture.has(p.id),
    ).length;

    // Production per professional
    const byProf = (professionals ?? [])
      .map((p, i) => ({
        name: p.name.split(" ")[0],
        value: finished
          .filter((a) => a.professional_id === p.id)
          .reduce((s, a) => s + Number(a.produced_value ?? 0), 0),
        count: finished.filter((a) => a.professional_id === p.id).length,
        fill: CHART[i % CHART.length],
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.value - a.value);

    // Appointments by status (pie)
    const statuses = ["scheduled", "confirmed", "in_progress", "finished", "cancelled", "no_show"];
    const byStatus = statuses
      .map((s, i) => ({
        name: APPOINTMENT_STATUS[s].label,
        value: A.filter((a) => a.status === s).length,
        fill: CHART[i % CHART.length],
      }))
      .filter((r) => r.value > 0);

    // New leads per day (area)
    const days: { label: string; leads: number }[] = [];
    const cursor = new Date(start);
    const spanDays = Math.min(31, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
    for (let i = 0; i < spanDays; i++) {
      const dayStr = cursor.toISOString().slice(0, 10);
      days.push({
        label: cursor.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        leads: newLeads.filter((p) => p.created_at.slice(0, 10) === dayStr).length,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return {
      total: P.length,
      newLeads: newLeads.length,
      scheduled,
      finished: finished.length,
      cancelled,
      attendance,
      revenue,
      noFutureAppt,
      production,
      byProf,
      byStatus,
      days,
    };
  }, [data, start, end, prof, professionals]);

  return (
    <div>
      <PageHeader
        title={`Olá, ${profile?.full_name?.split(" ")[0] ?? ""}`}
        description="Visão executiva da clínica."
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
        <Select value={prof} onValueChange={setProf}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os profissionais</SelectItem>
            {professionals?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading || !m ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Leads/pacientes" value={m.total} icon={Users} />
            <StatCard label="Novos leads" value={m.newLeads} icon={UserPlus} accent="info" />
            <StatCard
              label="Consultas agendadas"
              value={m.scheduled}
              icon={CalendarCheck}
              accent="info"
            />
            <StatCard
              label="Consultas realizadas"
              value={m.finished}
              icon={Activity}
              accent="success"
            />
            <StatCard
              label="Cancelamentos/faltas"
              value={m.cancelled}
              icon={CalendarX}
              accent="destructive"
            />
            <StatCard
              label="Comparecimento"
              value={`${m.attendance}%`}
              icon={Percent}
              accent="success"
            />
            <StatCard
              label="Receita do período"
              value={brl(m.revenue)}
              icon={Wallet}
              accent="primary"
            />
            <StatCard
              label="Pacientes sem consulta futura"
              value={m.noFutureAppt}
              hint="Ativos, sem nada agendado"
              icon={CalendarClock}
              accent="warning"
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Produção por profissional</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {m.byProf.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={m.byProf} margin={{ left: 8, right: 8 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12 }}
                        stroke="var(--muted-foreground)"
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        stroke="var(--muted-foreground)"
                        tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                      />
                      <Tooltip
                        formatter={(v: number) => brl(v)}
                        contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {m.byProf.map((r, i) => (
                          <Cell key={i} fill={r.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Consultas por status</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {m.byStatus.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={m.byStatus}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {m.byStatus.map((r, i) => (
                          <Cell key={i} fill={r.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
                  {m.byStatus.map((r) => (
                    <span
                      key={r.name}
                      className="flex items-center gap-1 text-xs text-muted-foreground"
                    >
                      <span className="size-2 rounded-full" style={{ background: r.fill }} />
                      {r.name} ({r.value})
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Novos leads no período</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={m.days} margin={{ left: 8, right: 8 }}>
                  <defs>
                    <linearGradient id="leadFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    stroke="var(--muted-foreground)"
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12 }}
                    stroke="var(--muted-foreground)"
                  />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }} />
                  <Area
                    type="monotone"
                    dataKey="leads"
                    stroke="var(--chart-1)"
                    fill="url(#leadFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Sem dados no período.
    </div>
  );
}
