import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — Clínica CRM" }] }),
  component: AuthPage,
});

const USER_DOMAIN = "@clinica.local";

function toEmail(input: string) {
  const v = input.trim().toLowerCase();
  if (!v) return "";
  return v.includes("@") ? v : `${v}${USER_DOMAIN}`;
}

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: toEmail(username),
      password,
    });
    setLoading(false);
    if (error) return toast.error("Usuário ou senha inválidos.");
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground">
            <Activity className="size-5" />
          </span>
          Clínica CRM
        </Link>
        <div className="space-y-4">
          <h1 className="text-3xl font-bold leading-tight">
            Toda a jornada do paciente em um só lugar.
          </h1>
          <p className="max-w-md text-sidebar-foreground/70">
            CRM Kanban, agenda inteligente, prontuário eletrônico, produção e atendimento —
            pensado para clínicas médicas e odontológicas.
          </p>
        </div>
        <p className="text-sm text-sidebar-foreground/50">Seguro · LGPD · Multi-profissional</p>
      </div>

      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2 font-bold text-lg">
              <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground">
                <Activity className="size-5" />
              </span>
              Clínica CRM
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-semibold">Entrar</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Acesso restrito. Solicite suas credenciais ao administrador.
            </p>
          </div>

          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Usuário</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />} Entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
