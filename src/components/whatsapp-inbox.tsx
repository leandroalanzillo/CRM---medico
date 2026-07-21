import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { sendStaffReply } from "@/lib/inbox.functions";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials, fmtDateTime } from "@/lib/format";
import { Bot, Send, MessageCircle, Loader2 } from "lucide-react";

export function WhatsAppInbox() {
  const { clinic } = useApp();
  const queryClient = useQueryClient();
  const doSendReply = useServerFn(sendStaffReply);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const { data: conversations, isLoading } = useQuery({
    queryKey: ["conversations", clinic?.id],
    enabled: !!clinic?.id,
    // Polling instead of a realtime subscription — simple and reliable
    // enough for a staff inbox; new inbound messages show up within 10s.
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("clinic_id", clinic!.id)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const selected = conversations?.find((c) => c.id === selectedId) ?? null;

  const { data: messages } = useQuery({
    queryKey: ["conv-messages", selectedId],
    enabled: !!selectedId,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedId!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!selected || selected.unread_count === 0) return;
    supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", selected.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["conversations", clinic?.id] });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function takeOver() {
    if (!selected) return;
    await supabase.from("conversations").update({ bot_active: false }).eq("id", selected.id);
    queryClient.invalidateQueries({ queryKey: ["conversations", clinic?.id] });
    toast.success("Assumido — o assistente automático não vai mais responder nesta conversa.");
  }

  async function send() {
    if (!selected || !draft.trim() || sending) return;
    setSending(true);
    try {
      await doSendReply({ data: { conversationId: selected.id, text: draft.trim() } });
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["conv-messages", selected.id] });
      queryClient.invalidateQueries({ queryKey: ["conversations", clinic?.id] });
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível enviar.");
    }
    setSending(false);
  }

  if (isLoading) return null;

  if (!conversations || conversations.length === 0) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="Nenhuma conversa ainda"
        description="Assim que um paciente escrever pelo WhatsApp conectado, a conversa aparece aqui."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]" style={{ height: 560 }}>
      <Card className="overflow-y-auto p-0">
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className={`flex w-full items-center gap-3 border-b p-3 text-left transition-colors hover:bg-muted/40 ${
              selectedId === c.id ? "bg-muted/60" : ""
            }`}
          >
            <Avatar className="size-9 shrink-0">
              <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                {initials(c.contact_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{c.contact_name || c.phone}</p>
              <p className="truncate text-xs text-muted-foreground">{c.last_message}</p>
            </div>
            {c.unread_count > 0 && (
              <Badge className="shrink-0 bg-primary text-primary-foreground">
                {c.unread_count}
              </Badge>
            )}
          </button>
        ))}
      </Card>

      <Card className="flex flex-col p-0">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Selecione uma conversa
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b p-3">
              <div>
                <p className="font-medium">{selected.contact_name || selected.phone}</p>
                <p className="text-xs text-muted-foreground">{selected.phone}</p>
              </div>
              {selected.bot_active ? (
                <Button size="sm" variant="outline" onClick={takeOver}>
                  <Bot className="size-4" /> Assistente ativo — assumir
                </Button>
              ) : (
                <Badge variant="outline">Atendimento humano</Badge>
              )}
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {(messages ?? []).map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                      m.direction === "outbound"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className="mt-1 text-[10px] opacity-70">{fmtDateTime(m.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 border-t p-3">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Escreva uma mensagem…"
                onKeyDown={(e) => e.key === "Enter" && send()}
                disabled={sending}
              />
              <Button size="icon" onClick={send} disabled={sending || !draft.trim()}>
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
