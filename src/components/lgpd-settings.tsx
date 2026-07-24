import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldAlert, ArrowRight } from "lucide-react";

export function LgpdSettings() {
  const { clinic, refetch } = useApp();
  const queryClient = useQueryClient();
  const [dpoName, setDpoName] = useState("");
  const [dpoContact, setDpoContact] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDpoName(clinic?.dpo_name ?? "");
    setDpoContact(clinic?.dpo_contact ?? "");
  }, [clinic]);

  async function save() {
    if (!clinic) return;
    setSaving(true);
    const { error } = await supabase
      .from("clinics")
      .update({ dpo_name: dpoName || null, dpo_contact: dpoContact || null })
      .eq("id", clinic.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Salvo.");
    queryClient.invalidateQueries();
    refetch();
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Encarregado de Dados (DPO)</CardTitle>
          <CardDescription>
            A LGPD (Art. 41) exige divulgar quem é o responsável por tratar solicitações sobre dados
            pessoais. Preencha aqui.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Nome do responsável</Label>
            <Input
              value={dpoName}
              onChange={(e) => setDpoName(e.target.value)}
              placeholder="Ex.: Leandro Lanzillo"
            />
          </div>
          <div className="space-y-2">
            <Label>Contato (e-mail ou telefone)</Label>
            <Input
              value={dpoContact}
              onChange={(e) => setDpoContact(e.target.value)}
              placeholder="privacidade@suaclinica.com.br"
            />
          </div>
          <div className="sm:col-span-2">
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="size-4" /> Auditoria
          </CardTitle>
          <CardDescription>
            Registro de ações no sistema e de todo acesso a prontuário — importante para responder a
            uma fiscalização.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link to="/auditoria">
              Ver auditoria <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consentimento e dados de pacientes</CardTitle>
          <CardDescription>
            Cada paciente tem, na própria ficha (aba de edição), um registro de consentimento e, se
            for menor de idade, os dados do responsável legal. Exportação e apagamento de dados a
            pedido do titular ficam disponíveis no menu &quot;⋯&quot; da ficha de cada paciente.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
