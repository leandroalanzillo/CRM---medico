import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Activity, KanbanSquare, Calendar, FileHeart, TrendingUp, MessageCircle, ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

const FEATURES = [
  { icon: KanbanSquare, title: "CRM Kanban", desc: "Do primeiro contato ao fechamento, com automações de etapa." },
  { icon: Calendar, title: "Agenda inteligente", desc: "Dia, semana e mês, sem conflito de horários." },
  { icon: FileHeart, title: "Prontuário eletrônico", desc: "Evoluções auditáveis com acesso por perfil." },
  { icon: TrendingUp, title: "Produção", desc: "Ranking e faturamento por profissional." },
  { icon: MessageCircle, title: "Atendimento", desc: "Central de conversas integrada ao paciente." },
  { icon: ShieldCheck, title: "Seguro e LGPD", desc: "Controle de acesso, auditoria e isolamento por clínica." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-gradient-surface">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-bold text-lg">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground">
            <Activity className="size-5" />
          </span>
          Clínica CRM
        </div>
        <Button asChild>
          <Link to="/auth">Entrar</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-4xl px-6 pb-16 pt-16 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-soft">
          Para clínicas médicas e odontológicas
        </span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
          O CRM que organiza toda a jornada do seu paciente
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          Leads, agenda, prontuário, negociações e produção — integrados, com automações
          inteligentes e segurança de dados sensíveis.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button size="lg" asChild>
            <Link to="/auth">Começar agora</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-2xl border bg-card p-6 shadow-soft">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <f.icon className="size-5" />
            </span>
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
