import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { useProfessionals, useProcedures } from "@/lib/hooks";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { APPOINTMENT_STATUS, APPOINTMENT_ROW_TINT } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Download, Upload, Plus, Trash2, Save, Info, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/planilha")({ component: PlanilhaPage });

type Row = {
  id: string;
  patient_id: string | null;
  patient_name: string;
  patient_phone: string;
  patient_email: string;
  starts_at: string; // ISO
  ends_at: string;
  professional_id: string | null;
  procedure_id: string | null;
  title: string;
  status: string;
  notes: string;
  _dirty?: boolean;
  _new?: boolean;
};

const STATUSES = Object.keys(APPOINTMENT_STATUS);

function toLocalInput(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PlanilhaPage() {
  const { clinic, userId } = useApp();
  const { data: professionals } = useProfessionals(clinic?.id);
  const { data: procedures } = useProcedures(clinic?.id);
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(monthEnd);
  const [statusFilter, setStatusFilter] = useState("all");
  const [professionalFilter, setProfessionalFilter] = useState("all");

  const { data: allPatients } = useQuery({
    queryKey: ["patients-min-planilha", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, full_name, phone, email")
        .eq("clinic_id", clinic!.id)
        .order("full_name");
      return data ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["planilha", clinic?.id, from, to, statusFilter, professionalFilter],
    enabled: !!clinic?.id,
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select(
          "id, patient_id, starts_at, ends_at, professional_id, procedure_id, title, status, notes, patient:patients(id, full_name, phone, email)",
        )
        .eq("clinic_id", clinic!.id)
        .gte("starts_at", `${from}T00:00:00`)
        .lte("starts_at", `${to}T23:59:59`)
        .order("starts_at");
      if (statusFilter !== "all") q = q.eq("status", statusFilter as never);
      if (professionalFilter !== "all") q = q.eq("professional_id", professionalFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const [rows, setRows] = useState<Row[]>([]);
  const [importing, setImporting] = useState<{
    rows: Row[];
    mapping: Record<string, string>;
  } | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  // Sync fetched → local editable
  useMemo(() => {
    if (data) {
      setRows(
        data.map((a): Row => ({
          id: a.id,
          patient_id: a.patient_id,
          patient_name: a.patient?.full_name ?? "",
          patient_phone: a.patient?.phone ?? "",
          patient_email: a.patient?.email ?? "",
          starts_at: a.starts_at,
          ends_at: a.ends_at,
          professional_id: a.professional_id,
          procedure_id: a.procedure_id,
          title: a.title ?? "",
          status: a.status,
          notes: a.notes ?? "",
        })),
      );
    }
  }, [data]);

  function update(idx: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch, _dirty: true } : row)));
  }

  function addRow() {
    const start = new Date();
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    setRows((r) => [
      {
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        patient_id: null,
        patient_name: "",
        patient_phone: "",
        patient_email: "",
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        professional_id: professionals?.[0]?.id ?? null,
        procedure_id: null,
        title: "Consulta",
        status: "scheduled",
        notes: "",
        _dirty: true,
        _new: true,
      },
      ...r,
    ]);
  }

  async function removeRow(idx: number) {
    const row = rows[idx];
    if (row._new) {
      setRows((r) => r.filter((_, i) => i !== idx));
      return;
    }
    if (!confirm("Excluir esse agendamento?")) return;
    const { error } = await supabase.from("appointments").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    setRows((r) => r.filter((_, i) => i !== idx));
    toast.success("Agendamento excluído.");
    queryClient.invalidateQueries();
  }

  async function ensurePatient(row: Row): Promise<string | null> {
    if (row.patient_id) return row.patient_id;
    const name = row.patient_name.trim();
    if (!name) return null;
    // Try to find an existing patient first — by phone (most reliable), then
    // by exact name within the clinic. Without this second check, leaving
    // the phone blank (or typing it slightly differently) silently created
    // a duplicate patient instead of reusing the one already in "Pacientes".
    if (row.patient_phone) {
      const { data: found } = await supabase
        .from("patients")
        .select("id")
        .eq("clinic_id", clinic!.id)
        .eq("phone", row.patient_phone)
        .maybeSingle();
      if (found) return found.id;
    }
    const { data: byName } = await supabase
      .from("patients")
      .select("id, phone")
      .eq("clinic_id", clinic!.id)
      .ilike("full_name", name);
    if (byName && byName.length === 1) return byName[0].id;
    if (byName && byName.length > 1) {
      // Multiple patients share this exact name — safer to create a new
      // record than guess wrong, but at least warn instead of failing silently.
      toast.warning(
        `Mais de um paciente chamado "${name}" já existe — criando um novo registro. Confira depois em Pacientes.`,
      );
    }
    const { data: created, error } = await supabase
      .from("patients")
      .insert({
        clinic_id: clinic!.id,
        full_name: name,
        phone: row.patient_phone || null,
        email: row.patient_email || null,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(`Paciente "${name}": ${error.message}`);
      return null;
    }
    return created.id;
  }

  async function saveRow(idx: number) {
    const row = rows[idx];
    if (!clinic) return;
    if (!row.patient_name.trim()) return toast.error("Nome do paciente é obrigatório.");
    if (!row.professional_id) return toast.error("Profissional é obrigatório.");
    if (!row.starts_at || !row.ends_at) return toast.error("Datas inválidas.");

    const patientId = await ensurePatient(row);
    if (!patientId) return;

    const payload = {
      clinic_id: clinic.id,
      patient_id: patientId,
      professional_id: row.professional_id,
      procedure_id: row.procedure_id,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      title: row.title || "Consulta",
      status: row.status as never,
      notes: row.notes || null,
    };

    if (row._new) {
      const { data: created, error } = await supabase
        .from("appointments")
        .insert({ ...payload, created_by: userId })
        .select("id")
        .single();
      if (error) return toast.error(error.message);
      setRows((r) =>
        r.map((x, i) =>
          i === idx
            ? { ...x, id: created.id, patient_id: patientId, _dirty: false, _new: false }
            : x,
        ),
      );
    } else {
      const { error } = await supabase.from("appointments").update(payload).eq("id", row.id);
      if (error) return toast.error(error.message);
      setRows((r) =>
        r.map((x, i) => (i === idx ? { ...x, patient_id: patientId, _dirty: false } : x)),
      );
    }
    toast.success("Salvo.");
    queryClient.invalidateQueries();
  }

  const [savingAll, setSavingAll] = useState(false);
  async function saveAll() {
    if (savingAll) return;
    const dirty = rows.map((r, i) => ({ r, i })).filter((x) => x.r._dirty);
    if (dirty.length === 0) return toast.info("Nada para salvar.");
    setSavingAll(true);
    for (const { i } of dirty) await saveRow(i);
    setSavingAll(false);
  }

  function exportFile(kind: "xlsx" | "csv") {
    const profMap = new Map((professionals ?? []).map((p) => [p.id, p.name]));
    const procMap = new Map((procedures ?? []).map((p) => [p.id, p.name]));
    const flat = rows.map((r) => ({
      Paciente: r.patient_name,
      Telefone: r.patient_phone,
      Email: r.patient_email,
      Data: new Date(r.starts_at).toLocaleDateString("pt-BR"),
      "Hora início": new Date(r.starts_at).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      "Hora fim": new Date(r.ends_at).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      Profissional: profMap.get(r.professional_id ?? "") ?? "",
      Procedimento: procMap.get(r.procedure_id ?? "") ?? r.title,
      Status: APPOINTMENT_STATUS[r.status]?.label ?? r.status,
      Observações: r.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(flat);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Agendamentos");
    XLSX.writeFile(wb, `agendamentos-${from}-${to}.${kind}`, { bookType: kind });
  }

  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
        const parsed: Row[] = json
          .map((r) => {
            const get = (keys: string[]) => {
              for (const k of keys) {
                for (const key of Object.keys(r)) {
                  if (key.toLowerCase().trim() === k.toLowerCase())
                    return String(r[key] ?? "").trim();
                }
              }
              return "";
            };
            const date = get(["Data", "date", "dia"]);
            const hi = get(["Hora início", "hora inicio", "hora", "start", "início"]);
            const hf = get(["Hora fim", "end", "fim"]);
            const start = parseDateTime(date, hi);
            const end = parseDateTime(date, hf || addMinutes(hi, 30));
            const profName = get(["Profissional", "professional", "medico", "médico"]);
            const procName = get(["Procedimento", "procedure", "servico", "serviço"]);
            const prof = professionals?.find(
              (p) => p.name.toLowerCase() === profName.toLowerCase(),
            );
            const proc = procedures?.find((p) => p.name.toLowerCase() === procName.toLowerCase());
            const statusLbl = get(["Status", "situacao", "situação"]);
            const statusKey =
              Object.entries(APPOINTMENT_STATUS).find(
                ([, v]) => v.label.toLowerCase() === statusLbl.toLowerCase(),
              )?.[0] ?? "scheduled";
            return {
              id: `imp-${Math.random().toString(36).slice(2, 9)}`,
              patient_id: null,
              patient_name: get(["Paciente", "nome", "patient", "cliente"]),
              patient_phone: get(["Telefone", "phone", "celular", "whatsapp"]),
              patient_email: get(["Email", "e-mail"]),
              starts_at: start.toISOString(),
              ends_at: end.toISOString(),
              professional_id: prof?.id ?? professionals?.[0]?.id ?? null,
              procedure_id: proc?.id ?? null,
              title: procName || "Consulta",
              status: statusKey,
              notes: get(["Observações", "observacoes", "notes", "nota"]),
              _dirty: true,
              _new: true,
            };
          })
          .filter((r) => r.patient_name);
        setImporting({ rows: parsed, mapping: {} });
      } catch (err) {
        toast.error("Não consegui ler o arquivo. Verifique o formato.");
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  async function confirmImport() {
    if (!importing || importBusy) return; // guards against a double-click firing this twice concurrently
    setImportBusy(true);
    let patientsOk = 0,
      apptsOk = 0,
      apptsFail = 0;
    for (const row of importing.rows) {
      try {
        const patientId = await ensurePatient(row);
        if (patientId) patientsOk++;
        if (!patientId || !row.professional_id) {
          apptsFail++;
          continue;
        }
        const { error } = await supabase.from("appointments").insert({
          clinic_id: clinic!.id,
          patient_id: patientId,
          professional_id: row.professional_id,
          procedure_id: row.procedure_id,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          title: row.title,
          status: row.status as never,
          notes: row.notes || null,
          created_by: userId,
        });
        if (error) {
          apptsFail++;
          console.error(error);
        } else apptsOk++;
      } catch (e) {
        apptsFail++;
        console.error(e);
      }
    }
    // Patients and appointments are two separate outcomes — a row can create
    // its patient successfully even when the appointment fails (e.g. no
    // "Profissional" match), and reporting only the appointment result as
    // "Falhas" made a fully-successful patient import look like it did
    // nothing, which is what led to importing the same file again.
    if (apptsFail > 0) {
      toast.success(
        `${patientsOk} paciente(s) criados/atualizados. Agendamentos: ${apptsOk} criados, ${apptsFail} não vinculados (confira a coluna Profissional).`,
      );
    } else {
      toast.success(`${patientsOk} paciente(s) e ${apptsOk} agendamento(s) importados.`);
    }
    setImporting(null);
    setImportBusy(false);
    queryClient.invalidateQueries();
  }

  const dirtyCount = rows.filter((r) => r._dirty).length;

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (dirtyCount > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyCount]);

  return (
    <div>
      <PageHeader
        title="Planilha"
        description="Edite os agendamentos como em uma planilha. Importe e exporte facilmente."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> Importar
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={onImportFile}
            />
            <Button variant="outline" onClick={() => exportFile("xlsx")}>
              <Download className="size-4" /> Exportar XLSX
            </Button>
            <Button variant="outline" onClick={() => exportFile("csv")}>
              <Download className="size-4" /> CSV
            </Button>
            <Button onClick={saveAll} disabled={dirtyCount === 0 || savingAll}>
              {savingAll ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}{" "}
              Salvar {dirtyCount > 0 && `(${dirtyCount})`}
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-info/30 bg-info/5 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <p>
          Esta planilha mostra <strong>agendamentos</strong> do período selecionado — não a lista
          completa de pacientes. Um paciente só aparece aqui se tiver uma consulta marcada dentro
          das datas escolhidas abaixo; a lista completa fica em <strong>Pacientes</strong>. Ao
          digitar um nome, se ele já existir, escolha-o na lista sugerida (evita cadastro
          duplicado).
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          type="date"
          className="w-auto"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span className="text-muted-foreground">até</span>
        <Input type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {APPOINTMENT_STATUS[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
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
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="size-4" /> Nova linha
        </Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>Cor da linha:</span>
        {STATUSES.map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span
              className={cn(
                "size-2.5 rounded-full",
                APPOINTMENT_ROW_TINT[s] || "bg-muted",
                "ring-1 ring-inset ring-border",
              )}
            />
            {APPOINTMENT_STATUS[s].label}
          </span>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <Card className="overflow-x-auto shadow-soft">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <Th>Paciente</Th>
                <Th>Telefone</Th>
                <Th>Email</Th>
                <Th>Início</Th>
                <Th>Fim</Th>
                <Th>Profissional</Th>
                <Th>Procedimento</Th>
                <Th>Status</Th>
                <Th>Observações</Th>
                <Th className="w-24">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground">
                    Sem agendamentos no período. Clique em "Nova linha".
                  </td>
                </tr>
              )}
              {rows.map((r, idx) => (
                <tr
                  key={r.id}
                  className={cn(
                    "transition-colors hover:brightness-95",
                    r._dirty ? "bg-warning/10" : APPOINTMENT_ROW_TINT[r.status],
                  )}
                >
                  <Td>
                    <PatientNameCell
                      row={r}
                      patients={allPatients ?? []}
                      onChange={(patch) => update(idx, patch)}
                    />
                  </Td>
                  <Td>
                    <Cell
                      value={r.patient_phone}
                      onChange={(v) => update(idx, { patient_phone: v })}
                    />
                  </Td>
                  <Td>
                    <Cell
                      value={r.patient_email}
                      onChange={(v) => update(idx, { patient_email: v })}
                    />
                  </Td>
                  <Td>
                    <Input
                      type="datetime-local"
                      className="h-8 border-0 bg-transparent px-1"
                      value={toLocalInput(r.starts_at)}
                      onChange={(e) =>
                        update(idx, { starts_at: new Date(e.target.value).toISOString() })
                      }
                    />
                  </Td>
                  <Td>
                    <Input
                      type="datetime-local"
                      className="h-8 border-0 bg-transparent px-1"
                      value={toLocalInput(r.ends_at)}
                      onChange={(e) =>
                        update(idx, { ends_at: new Date(e.target.value).toISOString() })
                      }
                    />
                  </Td>
                  <Td>
                    <select
                      className="h-8 w-full bg-transparent px-1 text-sm"
                      value={r.professional_id ?? ""}
                      onChange={(e) => update(idx, { professional_id: e.target.value || null })}
                    >
                      <option value="">—</option>
                      {professionals?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td>
                    <select
                      className="h-8 w-full bg-transparent px-1 text-sm"
                      value={r.procedure_id ?? ""}
                      onChange={(e) => {
                        const proc = procedures?.find((p) => p.id === e.target.value);
                        update(idx, {
                          procedure_id: e.target.value || null,
                          title: proc?.name ?? r.title,
                        });
                      }}
                    >
                      <option value="">—</option>
                      {procedures?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td>
                    <select
                      className="h-8 w-full bg-transparent px-1 text-sm"
                      value={r.status}
                      onChange={(e) => update(idx, { status: e.target.value })}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {APPOINTMENT_STATUS[s].label}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td>
                    <Cell value={r.notes} onChange={(v) => update(idx, { notes: v })} />
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      {r._dirty && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => saveRow(idx)}
                          title="Salvar"
                        >
                          <Save className="size-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeRow(idx)}
                        title="Excluir"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Dialog open={!!importing} onOpenChange={(o) => !o && !importBusy && setImporting(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Confirmar importação</DialogTitle>
            <DialogDescription>
              {importing?.rows.length ?? 0} linhas detectadas. Pacientes novos serão criados
              automaticamente (identificados por telefone ou, na falta dele, por nome já cadastrado
              — evita duplicar).
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-auto rounded border">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-left">Paciente</th>
                  <th className="p-2 text-left">Telefone</th>
                  <th className="p-2 text-left">Data</th>
                  <th className="p-2 text-left">Profissional</th>
                </tr>
              </thead>
              <tbody>
                {importing?.rows.slice(0, 50).map((r, i) => {
                  const prof = professionals?.find((p) => p.id === r.professional_id);
                  return (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.patient_name}</td>
                      <td className="p-2">{r.patient_phone}</td>
                      <td className="p-2">{new Date(r.starts_at).toLocaleString("pt-BR")}</td>
                      <td className="p-2">{prof?.name ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImporting(null)} disabled={importBusy}>
              Cancelar
            </Button>
            <Button onClick={confirmImport} disabled={importBusy}>
              {importBusy && <Loader2 className="size-4 animate-spin" />}
              Importar {importing?.rows.length} linhas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`p-2 text-left font-medium ${className ?? ""}`}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-t p-1 align-middle">{children}</td>;
}
function Cell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 border-0 bg-transparent px-1 focus-visible:bg-background"
    />
  );
}

type MiniPatient = { id: string; full_name: string; phone: string | null; email: string | null };

function PatientNameCell({
  row,
  patients,
  onChange,
}: {
  row: Row;
  patients: MiniPatient[];
  onChange: (patch: Partial<Row>) => void;
}) {
  const listId = `patients-${row.id}`;
  // "Nome — telefone" makes same-name patients distinguishable in the
  // datalist and gives us a string to match back to a specific id below.
  const label = (p: MiniPatient) => `${p.full_name}${p.phone ? ` — ${p.phone}` : ""}`;

  function handleChange(v: string) {
    const match = patients.find((p) => label(p) === v || p.full_name === v);
    if (match) {
      // Picked an existing patient from the list: link to it directly so
      // saving reuses the record instead of creating a duplicate.
      onChange({
        patient_name: match.full_name,
        patient_id: match.id,
        patient_phone: match.phone ?? row.patient_phone,
        patient_email: match.email ?? row.patient_email,
      });
    } else {
      onChange({ patient_name: v, patient_id: row._new ? null : row.patient_id });
    }
  }

  return (
    <>
      <Input
        list={listId}
        value={row.patient_name}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Digite para buscar um paciente já cadastrado…"
        className="h-8 border-0 bg-transparent px-1 focus-visible:bg-background"
      />
      <datalist id={listId}>
        {patients.map((p) => (
          <option key={p.id} value={label(p)} />
        ))}
      </datalist>
    </>
  );
}

function parseDateTime(date: string, time: string): Date {
  if (!date) return new Date();
  // Handle dd/mm/yyyy or yyyy-mm-dd
  let iso = date;
  if (/^\d{2}\/\d{2}\/\d{4}/.test(date)) {
    const [d, m, y] = date.split("/");
    iso = `${y}-${m}-${d}`;
  }
  const t = /^\d{1,2}:\d{2}/.test(time)
    ? (time.length === 4 ? `0${time}` : time).slice(0, 5)
    : "09:00";
  const dt = new Date(`${iso}T${t}:00`);
  return isNaN(dt.getTime()) ? new Date() : dt;
}
function addMinutes(time: string, mins: number) {
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return "09:30";
  const total = parseInt(m[1]) * 60 + parseInt(m[2]) + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
