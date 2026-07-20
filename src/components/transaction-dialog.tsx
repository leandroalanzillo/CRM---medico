import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { useFinancialCategories, useProfessionals, usePatientsMin } from "@/lib/hooks";
import { addAudit } from "@/lib/crm";
import { PAYMENT_METHODS } from "@/lib/format";
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

export interface TransactionEditable {
  id: string;
  type: "income" | "expense";
  category_id: string | null;
  description: string;
  amount: number;
  due_date: string;
  patient_id: string | null;
  professional_id: string | null;
  payment_method: string | null;
  notes: string | null;
}

export function TransactionDialog({
  open,
  onOpenChange,
  transaction,
  defaultType = "income",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transaction?: TransactionEditable | null;
  defaultType?: "income" | "expense";
}) {
  const { clinic, userId } = useApp();
  const queryClient = useQueryClient();
  const { data: categories } = useFinancialCategories(clinic?.id);
  const { data: professionals } = useProfessionals(clinic?.id);
  const { data: patients } = usePatientsMin(clinic?.id, open);
  const isEdit = !!transaction;

  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<"income" | "expense">(defaultType);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [patientId, setPatientId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [payment, setPayment] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (transaction) {
      setType(transaction.type);
      setCategoryId(transaction.category_id ?? "");
      setDescription(transaction.description);
      setAmount(Number(transaction.amount));
      setDueDate(transaction.due_date);
      setPatientId(transaction.patient_id ?? "");
      setProfessionalId(transaction.professional_id ?? "");
      setPayment(transaction.payment_method ?? "");
      setNotes(transaction.notes ?? "");
    } else {
      setType(defaultType);
      setCategoryId("");
      setDescription("");
      setAmount(0);
      setDueDate(new Date().toISOString().slice(0, 10));
      setPatientId("");
      setProfessionalId("");
      setPayment("");
      setNotes("");
    }
  }, [open, transaction, defaultType]);

  const filteredCategories = useMemo(
    () => (categories ?? []).filter((c) => c.type === type),
    [categories, type],
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!clinic) return;
    if (!description.trim()) return toast.error("Informe uma descrição.");
    if (!amount || amount <= 0) return toast.error("Informe um valor maior que zero.");
    if (!dueDate) return toast.error("Informe a data de vencimento.");
    setLoading(true);

    const payload = {
      clinic_id: clinic.id,
      type,
      category_id: categoryId || null,
      description: description.trim(),
      amount,
      due_date: dueDate,
      patient_id: patientId || null,
      professional_id: professionalId || null,
      payment_method: payment || null,
      notes: notes.trim() || null,
    };

    let txId = transaction?.id;
    if (isEdit && txId) {
      const { error } = await supabase
        .from("financial_transactions")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", txId);
      if (error) {
        setLoading(false);
        return toast.error(error.message);
      }
    } else {
      const { data, error } = await supabase
        .from("financial_transactions")
        .insert({ ...payload, status: "pending", created_by: userId })
        .select("id")
        .single();
      if (error || !data) {
        setLoading(false);
        return toast.error(error?.message ?? "Erro ao criar lançamento.");
      }
      txId = data.id;
    }

    await addAudit({
      clinicId: clinic.id,
      userId,
      action: isEdit ? "update" : "create",
      resourceType: "financial_transaction",
      resourceId: txId,
    });

    setLoading(false);
    queryClient.invalidateQueries({ queryKey: ["financial-transactions"] });
    toast.success(isEdit ? "Lançamento atualizado." : "Lançamento criado.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
          <DialogDescription>Receita ou despesa, com vencimento e categoria.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <Tabs
            value={type}
            onValueChange={(v) => {
              setType(v as "income" | "expense");
              setCategoryId("");
            }}
          >
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="income" disabled={isEdit}>
                Receita
              </TabsTrigger>
              <TabsTrigger value="expense" disabled={isEdit}>
                Despesa
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-2">
            <Label>Descrição *</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                type === "income" ? "Ex.: Consulta - João Silva" : "Ex.: Aluguel de julho"
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Vencimento *</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select value={payment} onValueChange={setPayment}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {type === "income" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Paciente</Label>
                <Select value={patientId} onValueChange={setPatientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Profissional</Label>
                <Select value={professionalId} onValueChange={setProfessionalId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    {professionals?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}{" "}
              {isEdit ? "Salvar" : "Criar lançamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
