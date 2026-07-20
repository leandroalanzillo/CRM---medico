import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { addAudit } from "@/lib/crm";
import { TransactionDialog, type TransactionEditable } from "@/components/transaction-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { brl, fmtDate, FINANCIAL_STATUS, isOverdue } from "@/lib/format";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  CalendarClock,
  Plus,
  Check,
  X,
  Pencil,
  Receipt,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/financeiro")({ component: FinanceiroPage });

type TxRow = {
  id: string;
  type: "income" | "expense";
  category_id: string | null;
  description: string;
  amount: number;
  due_date: string;
  paid_at: string | null;
  status: string;
  patient_id: string | null;
  professional_id: string | null;
  payment_method: string | null;
  notes: string | null;
  category: { name: string; color: string } | null;
  patient: { full_name: string } | null;
  professional: { name: string } | null;
};

const STATUS_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendentes" },
  { value: "paid", label: "Pagos" },
  { value: "cancelled", label: "Cancelados" },
];

function FinanceiroPage() {
  const { clinic, userId } = useApp();
  const queryClient = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [newType, setNewType] = useState<"income" | "expense">("income");
  const [editing, setEditing] = useState<TransactionEditable | null>(null);
  const [tab, setTab] = useState("overview");

  const { data, isLoading } = useQuery({
    queryKey: ["financial-transactions", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select(
          "*, category:financial_categories(name, color), patient:patients(full_name), professional:professionals(name)",
        )
        .eq("clinic_id", clinic!.id)
        .order("due_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TxRow[];
    },
  });

  const rows = useMemo(() => data ?? [], [data]);

  const kpis = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const inThisMonth = (d: string | null) => !!d && d.slice(0, 7) === monthKey;

    const incomeMonth = rows
      .filter((r) => r.type === "income" && r.status === "paid" && inThisMonth(r.paid_at))
      .reduce((s, r) => s + Number(r.amount), 0);
    const expenseMonth = rows
      .filter((r) => r.type === "expense" && r.status === "paid" && inThisMonth(r.paid_at))
      .reduce((s, r) => s + Number(r.amount), 0);

    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);
    const upcoming = rows.filter(
      (r) =>
        r.status === "pending" &&
        new Date(r.due_date) >= new Date(now.toDateString()) &&
        new Date(r.due_date) <= in7Days,
    );
    const upcomingValue = upcoming.reduce(
      (s, r) => s + (r.type === "income" ? Number(r.amount) : -Number(r.amount)),
      0,
    );

    return {
      incomeMonth,
      expenseMonth,
      balanceMonth: incomeMonth - expenseMonth,
      upcomingCount: upcoming.length,
      upcomingValue,
    };
  }, [rows]);

  const chartData = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("pt-BR", { month: "short" }),
      };
    });
    return months.map((m) => {
      const paidRows = rows.filter((r) => r.status === "paid" && r.paid_at?.slice(0, 7) === m.key);
      const receita = paidRows
        .filter((r) => r.type === "income")
        .reduce((s, r) => s + Number(r.amount), 0);
      const despesa = paidRows
        .filter((r) => r.type === "expense")
        .reduce((s, r) => s + Number(r.amount), 0);
      return { name: m.label, Receita: receita, Despesa: despesa };
    });
  }, [rows]);

  async function markPaid(row: TxRow) {
    if (!clinic) return;
    const { error } = await supabase
      .from("financial_transactions")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    await addAudit({
      clinicId: clinic.id,
      userId,
      action: "update",
      resourceType: "financial_transaction",
      resourceId: row.id,
      changes: { status: "paid" },
    });
    queryClient.invalidateQueries({ queryKey: ["financial-transactions"] });
    toast.success("Marcado como pago.");
  }

  async function cancelTx(row: TxRow) {
    if (!clinic) return;
    const { error } = await supabase
      .from("financial_transactions")
      .update({ status: "cancelled" })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    await addAudit({
      clinicId: clinic.id,
      userId,
      action: "update",
      resourceType: "financial_transaction",
      resourceId: row.id,
      changes: { status: "cancelled" },
    });
    queryClient.invalidateQueries({ queryKey: ["financial-transactions"] });
    toast.success("Lançamento cancelado.");
  }

  function openCreate(type: "income" | "expense") {
    setEditing(null);
    setNewType(type);
    setOpenNew(true);
  }

  const upcomingRows = useMemo(() => {
    const now = new Date(new Date().toDateString());
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);
    return rows
      .filter(
        (r) =>
          r.status === "pending" && new Date(r.due_date) >= now && new Date(r.due_date) <= in7Days,
      )
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description="Receitas, despesas e fluxo de caixa da clínica."
        actions={
          <>
            <Button variant="outline" onClick={() => openCreate("expense")}>
              <Plus className="size-4" /> Despesa
            </Button>
            <Button onClick={() => openCreate("income")}>
              <Plus className="size-4" /> Receita
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Receita do mês"
          value={brl(kpis.incomeMonth)}
          icon={TrendingUp}
          accent="success"
        />
        <StatCard
          label="Despesa do mês"
          value={brl(kpis.expenseMonth)}
          icon={TrendingDown}
          accent="destructive"
        />
        <StatCard
          label="Saldo do mês"
          value={brl(kpis.balanceMonth)}
          icon={Wallet}
          accent={kpis.balanceMonth >= 0 ? "primary" : "destructive"}
        />
        <StatCard
          label="A vencer (7 dias)"
          value={kpis.upcomingCount}
          icon={CalendarClock}
          accent="warning"
          hint={brl(kpis.upcomingValue)}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="receivable">Contas a receber</TabsTrigger>
          <TabsTrigger value="payable">Contas a pagar</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Fluxo de caixa — últimos 6 meses</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      stroke="var(--muted-foreground)"
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      stroke="var(--muted-foreground)"
                      width={70}
                      tickFormatter={(v) => brl(Number(v))}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }}
                      formatter={(v: number) => brl(v)}
                    />
                    <Legend />
                    <Bar dataKey="Receita" fill="var(--success, #10b981)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Despesa" fill="var(--destructive)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">A vencer nos próximos 7 dias</CardTitle>
              </CardHeader>
              <CardContent>
                {upcomingRows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nada a vencer nos próximos dias.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {upcomingRows.slice(0, 8).map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{r.description}</p>
                          <p className="text-xs text-muted-foreground">{fmtDate(r.due_date)}</p>
                        </div>
                        <span
                          className={`shrink-0 font-semibold ${r.type === "income" ? "text-success" : "text-destructive"}`}
                        >
                          {r.type === "income" ? "+" : "-"}
                          {brl(r.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="receivable">
          <TransactionsTable
            rows={rows.filter((r) => r.type === "income")}
            loading={isLoading}
            emptyLabel="Nenhuma conta a receber"
            onNew={() => openCreate("income")}
            onEdit={(r) => {
              setEditing(toEditable(r));
              setNewType("income");
              setOpenNew(true);
            }}
            onMarkPaid={markPaid}
            onCancel={cancelTx}
          />
        </TabsContent>

        <TabsContent value="payable">
          <TransactionsTable
            rows={rows.filter((r) => r.type === "expense")}
            loading={isLoading}
            emptyLabel="Nenhuma conta a pagar"
            onNew={() => openCreate("expense")}
            onEdit={(r) => {
              setEditing(toEditable(r));
              setNewType("expense");
              setOpenNew(true);
            }}
            onMarkPaid={markPaid}
            onCancel={cancelTx}
          />
        </TabsContent>
      </Tabs>

      <TransactionDialog
        open={openNew}
        onOpenChange={setOpenNew}
        transaction={editing}
        defaultType={newType}
      />
    </div>
  );
}

function toEditable(r: TxRow): TransactionEditable {
  return {
    id: r.id,
    type: r.type,
    category_id: r.category_id,
    description: r.description,
    amount: Number(r.amount),
    due_date: r.due_date,
    patient_id: r.patient_id,
    professional_id: r.professional_id,
    payment_method: r.payment_method,
    notes: r.notes,
  };
}

function TransactionsTable({
  rows,
  loading,
  emptyLabel,
  onNew,
  onEdit,
  onMarkPaid,
  onCancel,
}: {
  rows: TxRow[];
  loading: boolean;
  emptyLabel: string;
  onNew: () => void;
  onEdit: (r: TxRow) => void;
  onMarkPaid: (r: TxRow) => void;
  onCancel: (r: TxRow) => void;
}) {
  const [filter, setFilter] = useState("all");
  const filtered = rows.filter((r) => filter === "all" || r.status === filter);

  if (loading)
    return (
      <div className="grid gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );

  return (
    <div>
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList className="mb-4 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={emptyLabel}
          description="Crie um novo lançamento para começar."
          action={
            <Button onClick={onNew}>
              <Plus className="size-4" /> Novo lançamento
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const overdue = isOverdue(r.status, r.due_date);
                const statusKey = overdue ? "overdue" : r.status;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <p className="font-medium">{r.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.patient?.full_name ?? r.professional?.name ?? "—"}
                      </p>
                    </TableCell>
                    <TableCell>{r.category?.name ?? "—"}</TableCell>
                    <TableCell>{fmtDate(r.due_date)}</TableCell>
                    <TableCell>
                      <Badge className={FINANCIAL_STATUS[statusKey].className}>
                        {FINANCIAL_STATUS[statusKey].label}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${r.type === "income" ? "text-success" : "text-destructive"}`}
                    >
                      {brl(r.amount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {r.status === "pending" && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              title="Marcar como pago"
                              onClick={() => onMarkPaid(r)}
                            >
                              <Check className="size-4 text-success" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              title="Cancelar"
                              onClick={() => onCancel(r)}
                            >
                              <X className="size-4 text-destructive" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          title="Editar"
                          onClick={() => onEdit(r)}
                        >
                          <Pencil className="size-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
