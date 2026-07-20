import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import {
  connectWhatsApp,
  checkWhatsAppStatus,
  disconnectWhatsAppConnection,
} from "@/lib/whatsapp.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WA_STATUS } from "@/lib/format";
import { Loader2, QrCode, Unplug, RefreshCw, AlertTriangle } from "lucide-react";

/**
 * requireSupabaseAuth (used by every server function, not just this one)
 * throws a specific message when SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY are
 * missing on the SERVER side — a separate thing from the VITE_-prefixed
 * client-side copies, which is why the rest of the app can work fine while
 * this specific check fails. Evolution API not being configured is a
 * different, equally common cause. Both need a persistent, specific
 * message — a toast that disappears in a few seconds isn't enough to act on.
 */
function friendlyServerError(message: string): string {
  if (message.includes("Missing Supabase environment variable")) {
    return "Configuração do servidor incompleta: nem SUPABASE_PUBLISHABLE_KEY nem SUPABASE_ANON_KEY estão definidas nas variáveis de ambiente do servidor no Lovable Cloud (Cloud → Secrets). São usadas pelas funções de servidor, separadas das variáveis VITE_ do navegador — confira se o projeto está de fato conectado ao Supabase em Cloud → Secrets.";
  }
  if (message.includes("Evolution API não configurada")) {
    return "Nenhum provedor de WhatsApp configurado ainda: defina EVOLUTION_API_URL e EVOLUTION_API_KEY nas variáveis de ambiente do servidor, apontando para uma instância do Evolution API (self-hosted) já rodando. Sem isso, não existe QR Code para gerar — é diferente do modo gratuito por link (wa.me) usado no restante desta página.";
  }
  return message || "Não foi possível gerar o QR Code.";
}

export function WhatsAppConnectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { clinic } = useApp();
  const queryClient = useQueryClient();
  const doConnect = useServerFn(connectWhatsApp);
  const doCheckStatus = useServerFn(checkWhatsAppStatus);
  const doDisconnect = useServerFn(disconnectWhatsAppConnection);

  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: connection } = useQuery({
    queryKey: ["wa-conn", clinic?.id],
    enabled: !!clinic?.id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_connections")
        .select("*")
        .eq("clinic_id", clinic!.id)
        .maybeSingle();
      return data;
    },
  });

  const status = connection?.status ?? "disconnected";

  useEffect(() => {
    if (open) {
      setError(null);
      setQrCode(null);
    }
  }, [open]);

  async function startPairing() {
    setLoading(true);
    setError(null);
    try {
      const result = await doConnect();
      setQrCode(result.qrCode ?? null);
      queryClient.invalidateQueries({ queryKey: ["wa-conn", clinic?.id] });
    } catch (e) {
      const msg = friendlyServerError((e as Error).message);
      console.error("[whatsapp] connect failed:", (e as Error).message);
      setError(msg);
      toast.error(msg);
    }
    setLoading(false);
  }

  // Poll connection status every 3s while a QR is on screen so the dialog
  // flips to "Conectado" the moment the phone finishes pairing, with no
  // manual refresh needed.
  useEffect(() => {
    if (!open || status !== "awaiting_qr") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const r = await doCheckStatus();
        if (r.status === "connected") {
          toast.success("WhatsApp conectado!");
          setQrCode(null);
        }
        queryClient.invalidateQueries({ queryKey: ["wa-conn", clinic?.id] });
      } catch {
        // transient poll failure — try again on the next tick
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, status, doCheckStatus, queryClient, clinic?.id]);

  async function disconnect() {
    setLoading(true);
    try {
      await doDisconnect();
      toast.success("WhatsApp desconectado.");
      queryClient.invalidateQueries({ queryKey: ["wa-conn", clinic?.id] });
    } catch (e) {
      toast.error(friendlyServerError((e as Error).message));
    }
    setLoading(false);
  }

  const waStatus = WA_STATUS[status];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="size-5" /> Conectar WhatsApp
          </DialogTitle>
          <DialogDescription>
            Escaneie o QR Code com o WhatsApp do número da clínica, como no WhatsApp Web.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <Badge className={waStatus.className}>{waStatus.label}</Badge>

          {status === "connected" ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                Número conectado{connection?.phone_number ? `: ${connection.phone_number}` : "."}
              </p>
            </div>
          ) : error ? (
            <div className="flex size-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-4 text-center">
              <AlertTriangle className="size-6 text-destructive" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          ) : qrCode || connection?.qr_code ? (
            <img
              src={qrCode ?? connection!.qr_code!}
              alt="QR Code do WhatsApp"
              className="size-56 rounded-lg border p-2"
            />
          ) : (
            <div className="flex size-56 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              Clique em "Gerar QR Code" para começar
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">
            No celular: WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho.
          </p>
        </div>

        <DialogFooter className="sm:justify-center">
          {status === "connected" ? (
            <Button variant="outline" onClick={disconnect} disabled={loading}>
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Unplug className="size-4" />
              )}{" "}
              Desconectar
            </Button>
          ) : (
            <Button onClick={startPairing} disabled={loading}>
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {qrCode || connection?.qr_code ? "Gerar novo QR Code" : "Gerar QR Code"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
