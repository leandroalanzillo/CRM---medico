import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
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
import { Loader2 } from "lucide-react";

type Procedure = Database["public"]["Tables"]["procedures"]["Row"];

const empty = { name: "", default_price: "", duration_minutes: "30", active: true };

export function ProcedureDialog({
  open,
  onOpenChange,
  procedure,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  procedure?: Procedure | null;
}) {
  const { clinic } = useApp();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (open) {
      setForm(
        procedure
          ? {
              name: procedure.name,
              default_price: procedure.default_price != null ? String(procedure.default_price) : "",
              duration_minutes: String(procedure.duration_minutes ?? 30),
              active: procedure.active,
            }
          : empty,
      );
    }
  }, [open, procedure]);

  const set = (k: keyof typeof empty, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!clinic) return;
    if (form.name.trim().length < 2) return toast.error("Informe o nome do procedimento.");
    setLoading(true);

    const payload = {
      clinic_id: clinic.id,
      name: form.name.trim(),
      default_price: form.default_price ? Number(form.default_price) : 0,
      duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : 30,
      active: form.active,
    };

    const { error } = procedure
      ? await supabase.from("procedures").update(payload).eq("id", procedure.id)
      : await supabase.from("procedures").insert(payload);

    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(procedure ? "Procedimento atualizado." : "Procedimento cadastrado.");
    queryClient.invalidateQueries({ queryKey: ["procedures", clinic.id] });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{procedure ? "Editar procedimento" : "Novo procedimento"}</DialogTitle>
          <DialogDescription>
            Nome, preço padrão e duração — usados no agendamento.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ex.: Consulta, Limpeza, Avaliação..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Preço padrão (R$)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.default_price}
                onChange={(e) => set("default_price", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Duração (min)</Label>
              <Input
                type="number"
                min={5}
                step={5}
                value={form.duration_minutes}
                onChange={(e) => set("duration_minutes", e.target.value)}
              />
            </div>
          </div>
          {procedure && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm">Procedimento ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Inative para ocultar das opções de agendamento sem perder o histórico.
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
