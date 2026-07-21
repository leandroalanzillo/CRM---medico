export const brl = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

export const fmtDate = (d: string | Date | null | undefined) =>
  d
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(d))
    : "—";

export const fmtDateTime = (d: string | Date | null | undefined) =>
  d
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(d))
    : "—";

export const fmtTime = (d: string | Date | null | undefined) =>
  d
    ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(d))
    : "—";

export const initials = (name?: string | null) =>
  (name ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");

export const APPOINTMENT_STATUS: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Agendado", className: "bg-muted text-muted-foreground" },
  confirmed: { label: "Confirmado", className: "bg-info/15 text-info" },
  waiting: { label: "Aguardando", className: "bg-warning/20 text-warning-foreground" },
  in_progress: { label: "Em atendimento", className: "bg-primary/15 text-primary" },
  finished: { label: "Finalizado", className: "bg-success/15 text-success" },
  cancelled: { label: "Cancelado", className: "bg-destructive/15 text-destructive" },
  no_show: { label: "Não compareceu", className: "bg-destructive/10 text-destructive" },
};

// Subtle full-row background tint per status, for tables like Planilha where
// the whole line should be quickly scannable by status — much lighter than
// the badge classNames above, which are too saturated to cover a whole row.
export const APPOINTMENT_ROW_TINT: Record<string, string> = {
  scheduled: "",
  confirmed: "bg-info/5",
  waiting: "bg-warning/10",
  in_progress: "bg-primary/5",
  finished: "bg-success/5",
  cancelled: "bg-destructive/5",
  no_show: "bg-destructive/5",
};

export const NEGOTIATION_STATUS: Record<string, { label: string; className: string }> = {
  negotiating: { label: "Em negociação", className: "bg-info/15 text-info" },
  awaiting: { label: "Aguardando resposta", className: "bg-warning/20 text-warning-foreground" },
  accepted: { label: "Aceito", className: "bg-success/15 text-success" },
  rejected: { label: "Recusado", className: "bg-destructive/15 text-destructive" },
  expired: { label: "Expirado", className: "bg-muted text-muted-foreground" },
};

export const FINANCIAL_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "bg-warning/20 text-warning-foreground" },
  paid: { label: "Pago", className: "bg-success/15 text-success" },
  cancelled: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
  overdue: { label: "Vencido", className: "bg-destructive/15 text-destructive" },
};

export const FINANCIAL_TYPE_LABELS: Record<string, string> = {
  income: "Receita",
  expense: "Despesa",
};

export const DEFAULT_FINANCIAL_CATEGORIES = [
  { name: "Consultas e procedimentos", type: "income" as const, color: "#10b981" },
  { name: "Convênios", type: "income" as const, color: "#3b82f6" },
  { name: "Outras receitas", type: "income" as const, color: "#0ea5e9" },
  { name: "Folha de pagamento", type: "expense" as const, color: "#ef4444" },
  { name: "Aluguel e contas", type: "expense" as const, color: "#f97316" },
  { name: "Materiais e insumos", type: "expense" as const, color: "#f59e0b" },
  { name: "Marketing", type: "expense" as const, color: "#8b5cf6" },
  { name: "Outras despesas", type: "expense" as const, color: "#64748b" },
];

/** True when a pending transaction's due date has already passed. */
export function isOverdue(status: string, dueDate: string): boolean {
  if (status !== "pending") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate) < today;
}

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  manager: "Gestor",
  receptionist: "Recepcionista",
  professional: "Médico/Dentista",
  commercial: "Comercial",
};

export const WA_STATUS: Record<string, { label: string; className: string }> = {
  disconnected: { label: "Desconectado", className: "bg-muted text-muted-foreground" },
  awaiting_qr: { label: "Aguardando QR Code", className: "bg-warning/20 text-warning-foreground" },
  connecting: { label: "Conectando", className: "bg-info/15 text-info" },
  connected: { label: "Conectado", className: "bg-success/15 text-success" },
  error: { label: "Erro de conexão", className: "bg-destructive/15 text-destructive" },
};

export const PAYMENT_METHODS = [
  "À vista",
  "Pix",
  "Cartão de crédito",
  "Cartão de débito",
  "Boleto",
  "Transferência",
  "Convênio",
] as const;
