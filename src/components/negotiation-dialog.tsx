import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { useProfessionals, useProcedures, usePatientsMin } from "@/lib/hooks";
import { addTimeline, addAudit, addNegotiationHistory } from "@/lib/crm";
import { brl, PAYMENT_METHODS } from "@/lib/format";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";

export interface NegotiationEditable {
  id: string;
  patient_id: string;
  professional_id: string | null;
  title: string;
  discount: number;
  payment_method: string | null;
  installments: number | null;
  valid_until: string | null;
}

interface ItemRow {
  id?: string;
  procedure_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
}

const emptyItem = (): ItemRow => ({ procedure_id: null, description: "", quantity: 1, unit_price: 0 });

export function NegotiationDialog({
  open, onOpenChange, negotiation, defaultPatientId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  negotiation?: NegotiationEditable | null;
  defaultPatientId?: string;
}) {
  const { clinic, userId } = useApp();
  const queryClient = useQueryClient();
  const { data: patients } = usePatientsMin(clinic?.id, open);
  const { data: professionals } = useProfessionals(clinic?.id);
  const { data: procedures } = useProcedures(clinic?.id);
  const isEdit = !!negotiation;

  const [loading, setLoading] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [title, setTitle] = useState("Orçamento");
  const [discount, setDiscount] = useState(0);
  const [payment, setPayment] = useState<string>("");
  const [installments, setInstallments] = useState(1);
  const [validUntil, setValidUntil] = useState("");
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);

  useEffect(() => {
    if (!open) return;
    if (negotiation) {
      setPatientId(negotiation.patient_id);
      setProfessionalId(negotiation.professional_id ?? "");
      setTitle(negotiation.title);
      setDiscount(Number(negotiation.discount ?? 0));
      setPayment(negotiation.payment_method ?? "");
      setInstallments(negotiation.installments ?? 1);
      setValidUntil(negotiation.valid_until ?? "");
      supabase.from("negotiation_items").select("*").eq("negotiation_id", negotiation.id).then(({ data }) => {
        setItems(
          data && data.length
            ? data.map((i) => ({ id: i.id, procedure_id: i.procedure_id, description: i.description, quantity: i.quantity, unit_price: Number(i.unit_price) }))
            : [emptyItem()],
        );
      });
    } else {
      setPatientId(defaultPatientId ?? "");
      setProfessionalId("");
      setTitle("Orçamento");
      setDiscount(0);
      setPayment("");
      setInstallments(1);
      setValidUntil("");
      setItems([emptyItem()]);
    }
  }, [open, negotiation, defaultPatientId]);

  const original = useMemo(() => items.reduce((s, i) => s + i.quantity * i.unit_price, 0), [items]);
  const finalValue = Math.max(0, original - (discount || 0));

  function updateItem(idx: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function pickProcedure(idx: number, procId: string) {
    const proc = procedures?.find((p) => p.id === procId);
    updateItem(idx, {
      procedure_id: procId || null,
      description: proc?.name ?? items[idx].description,
      unit_price: proc ? Number(proc.default_price ?? 0) : items[idx].unit_price,
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!clinic || !patientId) return toast.error("Selecione o paciente.");
    const validItems = items.filter((i) => i.description.trim());
    if (validItems.length === 0) return toast.error("Adicione ao menos um item ao orçamento.");
    setLoading(true);

    const payload = {
      clinic_id: clinic.id,
      patient_id: patientId,
      professional_id: professionalId || null,
      title: title.trim() || "Orçamento",
      original_value: original,
      discount: discount || 0,
      final_value: finalValue,
      payment_method: payment || null,
      installments: installments || 1,
      valid_until: validUntil || null,
    };

    let negId = negotiation?.id;
    if (isEdit && negId) {
      const { error } = await supabase.from("negotiations").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", negId);
      if (error) { setLoading(false); return toast.error(error.message); }
      await supabase.from("negotiation_items").delete().eq("negotiation_id", negId);
    } else {
      const { data, error } = await supabase.from("negotiations").insert({ ...payload, status: "negotiating", created_by: userId }).select("id").single();
      if (error || !data) { setLoading(false); return toast.error(error?.message ?? "Erro ao criar negociação."); }
      negId = data.id;
    }

    await supabase.from("negotiation_items").insert(
      validItems.map((i) => ({
        clinic_id: clinic.id, negotiation_id: negId!, procedure_id: i.procedure_id,
        description: i.description.trim(), quantity: i.quantity, unit_price: i.unit_price,
      })),
    );

    await addNegotiationHistory({
      clinicId: clinic.id, negotiationId: negId!, actorId: userId,
      description: isEdit ? `Orçamento atualizado — ${brl(finalValue)}` : `Orçamento criado — ${brl(finalValue)}`,
    });
    await addTimeline({
      clinicId: clinic.id, patientId, eventType: "negotiation", actorId: userId,
      description: isEdit ? `Negociação "${payload.title}" atualizada (${brl(finalValue)}).` : `Nova negociação "${payload.title}" criada (${brl(finalValue)}).`,
    });
    await addAudit({ clinicId: clinic.id, userId, action: isEdit ? "update" : "create", resourceType: "negotiation", resourceId: negId });

    setLoading(false);
    queryClient.invalidateQueries();
    toast.success(isEdit ? "Negociação atualizada." : "Negociação criada.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar negociação" : "Nova negociação"}</DialogTitle>
          <DialogDescription>Orçamento / plano de tratamento com itens, valores e condições.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Paciente *</Label>
              <Select value={patientId} onValueChange={setPatientId} disabled={isEdit}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{patients?.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Profissional</Label>
              <Select value={professionalId} onValueChange={setProfessionalId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{professionals?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Plano de tratamento ortodôntico" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Itens</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => setItems((p) => [...p, emptyItem()])}>
                <Plus className="size-4" /> Item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
                  <div className="space-y-1">
                    <Select value={it.procedure_id ?? ""} onValueChange={(v) => pickProcedure(idx, v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Procedimento (opcional)" /></SelectTrigger>
                      <SelectContent>{procedures?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input className="h-8" placeholder="Descrição *" value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Qtd.</Label>
                    <Input className="h-8 w-16" type="number" min={1} value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Valor unit.</Label>
                    <Input className="h-8 w-28" type="number" min={0} step="0.01" value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: Math.max(0, Number(e.target.value) || 0) })} />
                  </div>
                  <Button type="button" size="icon" variant="ghost" className="h-8" onClick={() => setItems((p) => (p.length > 1 ? p.filter((_, i) => i !== idx) : p))}>
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select value={payment} onValueChange={setPayment}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Parcelas</Label>
              <Input type="number" min={1} max={48} value={installments} onChange={(e) => setInstallments(Math.max(1, Number(e.target.value) || 1))} />
            </div>
            <div className="space-y-2">
              <Label>Validade</Label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3">
            <div><p className="text-xs text-muted-foreground">Subtotal</p><p className="font-semibold">{brl(original)}</p></div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Desconto (R$)</Label>
              <Input className="h-8" type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))} />
            </div>
            <div><p className="text-xs text-muted-foreground">Valor final</p><p className="text-lg font-bold text-primary">{brl(finalValue)}</p></div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading && <Loader2 className="size-4 animate-spin" />} {isEdit ? "Salvar" : "Criar negociação"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}