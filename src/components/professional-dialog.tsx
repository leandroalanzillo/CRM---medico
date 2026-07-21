import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp, type AppRole } from "@/lib/app-context";
import { formatPhone, isValidEmail, isValidRegistration } from "@/lib/validators";
import { ROLE_LABELS } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, X } from "lucide-react";

const ALL_ROLES: AppRole[] = ["admin", "manager", "receptionist", "professional", "commercial"];

type Professional = Database["public"]["Tables"]["professionals"]["Row"];

const COLORS = [
  "#2dd4bf",
  "#6366f1",
  "#f97316",
  "#ec4899",
  "#22c55e",
  "#eab308",
  "#0ea5e9",
  "#a855f7",
];

const empty = {
  name: "",
  registration: "",
  email: "",
  phone: "",
  color: COLORS[0],
  active: true,
};

export function ProfessionalDialog({
  open,
  onOpenChange,
  professional,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  professional?: Professional | null;
}) {
  const { clinic } = useApp();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(empty);

  const linkedUserId = professional?.user_id ?? null;
  const { data: linkedRoles } = useQuery({
    queryKey: ["professional-roles", linkedUserId],
    enabled: !!linkedUserId,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", linkedUserId!)
        .eq("clinic_id", clinic!.id);
      return (data ?? []).map((r) => r.role);
    },
  });

  async function addRole(role: AppRole) {
    if (!linkedUserId || !clinic) return;
    const { error } = await supabase
      .from("user_roles")
      .upsert(
        { user_id: linkedUserId, clinic_id: clinic.id, role },
        { onConflict: "user_id,role" },
      );
    if (error) return toast.error("Não foi possível adicionar a permissão.");
    queryClient.invalidateQueries({ queryKey: ["professional-roles", linkedUserId] });
    queryClient.invalidateQueries({ queryKey: ["members", clinic.id] });
  }

  async function removeRole(role: AppRole) {
    if (!linkedUserId || !clinic) return;
    if ((linkedRoles?.length ?? 0) <= 1) {
      return toast.error("O usuário precisa de pelo menos uma permissão.");
    }
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", linkedUserId)
      .eq("clinic_id", clinic.id)
      .eq("role", role);
    if (error) return toast.error("Não foi possível remover a permissão.");
    queryClient.invalidateQueries({ queryKey: ["professional-roles", linkedUserId] });
    queryClient.invalidateQueries({ queryKey: ["members", clinic.id] });
  }

  useEffect(() => {
    if (open) {
      setForm(
        professional
          ? {
              name: professional.name ?? "",
              registration: professional.registration ?? "",
              email: professional.email ?? "",
              phone: professional.phone ?? "",
              color: professional.color ?? COLORS[0],
              active: professional.active ?? true,
            }
          : empty,
      );
    }
  }, [open, professional]);

  const set = (k: keyof typeof empty, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!clinic) return;
    if (form.name.trim().length < 2) return toast.error("Informe o nome do profissional.");
    if (!isValidRegistration(form.registration)) {
      return toast.error("Registro profissional inválido. Use um formato como CRM/SP 123456.");
    }
    if (!isValidEmail(form.email)) return toast.error("E-mail inválido.");

    setLoading(true);

    // Referential/uniqueness check: registration must be unique within the clinic.
    if (form.registration.trim()) {
      const { data: dup } = await supabase
        .from("professionals")
        .select("id, name")
        .eq("clinic_id", clinic.id)
        .eq("registration", form.registration.trim())
        .neq("id", professional?.id ?? "00000000-0000-0000-0000-000000000000")
        .maybeSingle();
      if (dup) {
        setLoading(false);
        return toast.error(`Este registro já está cadastrado para ${dup.name}.`);
      }
    }

    const payload = {
      clinic_id: clinic.id,
      name: form.name.trim(),
      registration: form.registration.trim() || null,
      email: form.email || null,
      phone: form.phone || null,
      color: form.color,
      active: form.active,
    };

    try {
      if (professional) {
        const { error } = await supabase
          .from("professionals")
          .update(payload)
          .eq("id", professional.id);
        if (error) throw error;
        toast.success("Profissional atualizado.");
      } else {
        const { error } = await supabase.from("professionals").insert(payload);
        if (error) throw error;
        toast.success("Profissional cadastrado.");
      }
      queryClient.invalidateQueries({ queryKey: ["professionals", clinic.id] });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{professional ? "Editar profissional" : "Novo profissional"}</DialogTitle>
          <DialogDescription>Cadastro, registro profissional e contato.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome completo *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Registro (CRM/CRO/CRP...)</Label>
            <Input
              value={form.registration}
              onChange={(e) => set("registration", e.target.value)}
              placeholder="CRM/SP 123456"
              className={
                form.registration && !isValidRegistration(form.registration)
                  ? "border-destructive"
                  : undefined
              }
            />
            <p className="text-xs text-muted-foreground">
              Formato: sigla do conselho, UF e número — ex. CRM/SP 123456.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={form.phone}
                onChange={(e) => set("phone", formatPhone(e.target.value))}
                maxLength={15}
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className={
                  form.email && !isValidEmail(form.email) ? "border-destructive" : undefined
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Cor de identificação</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("color", c)}
                  className="size-7 rounded-full ring-offset-2 transition-shadow"
                  style={{
                    background: c,
                    boxShadow: form.color === c ? `0 0 0 2px ${c}` : undefined,
                  }}
                  aria-label={`Selecionar cor ${c}`}
                />
              ))}
            </div>
          </div>

          {professional && linkedUserId && (
            <div className="space-y-2 rounded-lg border p-3">
              <Label className="text-sm">Permissões de acesso ao CRM</Label>
              <div className="flex flex-wrap items-center gap-1">
                {linkedRoles?.map((r) => (
                  <Badge key={r} variant="secondary" className="gap-1 pr-1">
                    {ROLE_LABELS[r]}
                    <button
                      type="button"
                      onClick={() => removeRole(r as AppRole)}
                      className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                      aria-label={`Remover permissão ${ROLE_LABELS[r]}`}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
                <Select onValueChange={(v) => addRole(v as AppRole)}>
                  <SelectTrigger className="h-7 w-44 text-xs">
                    <SelectValue placeholder="+ Adicionar permissão" />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_ROLES.filter((r) => !linkedRoles?.includes(r)).map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {professional && !linkedUserId && (
            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              Este profissional não tem uma conta de login vinculada, então não tem permissões de
              acesso ao CRM ainda — é só um registro para aparecer na agenda. Para dar acesso ao
              sistema, crie o login em Configurações → Usuários & Permissões.
            </p>
          )}

          {professional && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm">Profissional ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Inative para ocultar da agenda sem perder o histórico de consultas.
                </p>
              </div>
              <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
