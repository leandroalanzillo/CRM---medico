import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext, PointerSensor, useSensor, useSensors, useDroppable, useDraggable, type DragEndEvent,
} from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { useStages } from "@/lib/hooks";
import { addTimeline } from "@/lib/crm";
import { PageHeader } from "@/components/page-header";
import { PatientDialog } from "@/components/patient-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { brl, initials, fmtDateTime } from "@/lib/format";
import { Plus, Phone, User, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/crm")({ component: CrmPage });

type CardRow = {
  id: string; potential_value: number | null; stage_id: string; next_activity: string | null;
  patient: { id: string; full_name: string; phone: string | null; source: string | null; whatsapp: string | null } | null;
  professional: { name: string; color: string } | null;
};

function CrmPage() {
  const { clinic, userId } = useApp();
  const { data: stages } = useStages(clinic?.id);
  const queryClient = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [selected, setSelected] = useState<CardRow | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const { data: cards, isLoading } = useQuery({
    queryKey: ["cards", clinic?.id],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("pipeline_cards")
        .select("id, potential_value, stage_id, next_activity, patient:patients(id, full_name, phone, whatsapp, source), professional:professionals(name, color)")
        .eq("clinic_id", clinic!.id);
      if (error) throw error;
      return data as unknown as CardRow[];
    },
  });

  const grouped = useMemo(() => {
    const map: Record<string, CardRow[]> = {};
    (stages ?? []).forEach((s) => (map[s.id] = []));
    (cards ?? []).forEach((c) => { (map[c.stage_id] ??= []).push(c); });
    return map;
  }, [stages, cards]);

  async function onDragEnd(e: DragEndEvent) {
    const cardId = String(e.active.id);
    const targetStage = e.over ? String(e.over.id) : null;
    const card = cards?.find((c) => c.id === cardId);
    if (!targetStage || !card || card.stage_id === targetStage || !clinic) return;
    const from = stages?.find((s) => s.id === card.stage_id)?.name;
    const to = stages?.find((s) => s.id === targetStage)?.name;
    await supabase.from("pipeline_cards").update({ stage_id: targetStage }).eq("id", cardId);
    if (card.patient) {
      await addTimeline({ clinicId: clinic.id, patientId: card.patient.id, eventType: "kanban_move",
        description: `Card movido de "${from}" para "${to}".`, actorId: userId });
    }
    queryClient.invalidateQueries({ queryKey: ["cards", clinic.id] });
  }

  return (
    <div>
      <PageHeader title="CRM" description="Pipeline de leads e pacientes com automações de etapa."
        actions={<Button onClick={() => setOpenNew(true)}><Plus className="size-4" /> Novo lead</Button>} />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {(stages ?? []).map((s) => (
              <Column key={s.id} id={s.id} name={s.name} color={s.color}
                cards={grouped[s.id] ?? []} onSelect={setSelected} />
            ))}
          </div>
        </DndContext>
      )}

      <PatientDialog open={openNew} onOpenChange={setOpenNew} />
      <CardDrawer card={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function Column({ id, name, color, cards, onSelect }: {
  id: string; name: string; color: string; cards: CardRow[]; onSelect: (c: CardRow) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const total = cards.reduce((s, c) => s + (c.potential_value ?? 0), 0);
  return (
    <div ref={setNodeRef}
      className={`flex flex-col rounded-xl border bg-card/60 p-3 transition-colors ${isOver ? "ring-2 ring-primary" : ""}`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: color }} />
          <p className="text-sm font-semibold">{name}</p>
          <Badge variant="secondary">{cards.length}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">{brl(total)}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {cards.map((c) => <KanbanCard key={c.id} card={c} onSelect={onSelect} />)}
        {cards.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">Sem cards</p>}
      </div>
    </div>
  );
}

function KanbanCard({ card, onSelect }: { card: CardRow; onSelect: (c: CardRow) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      onClick={() => onSelect(card)}
      className={`cursor-grab rounded-lg border bg-card p-3 shadow-soft transition-shadow hover:shadow-card ${isDragging ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2">
        <Avatar className="size-8"><AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">{initials(card.patient?.full_name)}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{card.patient?.full_name}</p>
          {card.patient?.phone && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="size-3" />{card.patient.phone}</p>}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        {card.professional && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: card.professional.color }} />{card.professional.name}
          </span>
        )}
        {!!card.potential_value && <span className="text-xs font-semibold text-primary">{brl(card.potential_value)}</span>}
      </div>
      {card.patient?.source && <Badge variant="outline" className="mt-2 text-[10px]">{card.patient.source}</Badge>}
    </div>
  );
}

function CardDrawer({ card, onClose }: { card: CardRow | null; onClose: () => void }) {
  return (
    <Sheet open={!!card} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        {card && (
          <>
            <SheetHeader><SheetTitle>{card.patient?.full_name}</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4 px-4">
              <div className="flex items-center gap-2 text-sm"><Phone className="size-4 text-muted-foreground" />{card.patient?.phone || "—"}</div>
              <div className="flex items-center gap-2 text-sm"><User className="size-4 text-muted-foreground" />{card.professional?.name || "Sem responsável"}</div>
              {card.next_activity && <p className="text-sm">Próxima atividade: {card.next_activity}</p>}
              {!!card.potential_value && <p className="text-sm font-semibold text-primary">{brl(card.potential_value)}</p>}
              {card.patient && (
                <Button asChild className="w-full">
                  <Link to="/pacientes/$id" params={{ id: card.patient.id }}><ExternalLink className="size-4" /> Abrir perfil completo</Link>
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
