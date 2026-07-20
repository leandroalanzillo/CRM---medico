// Server-only. Wraps the Evolution API REST contract (the self-hosted
// WhatsApp bridge — https://doc.evolution-api.com) to pair a WhatsApp
// number via QR code, the same flow as WhatsApp Web/Business App linking.
// This is a DIFFERENT integration than notifications.server.ts's
// sendWhatsApp() (which uses Meta's official Cloud API for sending
// template/text messages once approved). Evolution API is what actually
// backs the "escanear QR Code" flow the CRM UI exposes.
//
// Requires EVOLUTION_API_URL and EVOLUTION_API_KEY, set only on the
// server (never VITE_-prefixed, never shipped to the client bundle).

interface EvoResponse {
  ok: boolean;
  error?: string;
  qrCode?: string; // base64 data URI
  status?: "disconnected" | "awaiting_qr" | "connecting" | "connected" | "error";
  phoneNumber?: string;
}

function evoConfig() {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  return { baseUrl, apiKey, configured: !!baseUrl && !!apiKey };
}

/**
 * Creates the clinic's Evolution API instance if it doesn't exist yet, and
 * returns the current QR code to scan. Safe to call repeatedly (Evolution
 * API no-ops / returns the existing instance when the name is already
 * taken).
 */
export async function startWhatsAppPairing(instanceName: string): Promise<EvoResponse> {
  const { baseUrl, apiKey, configured } = evoConfig();
  if (!configured) {
    return {
      ok: false,
      error: "Evolution API não configurada (EVOLUTION_API_URL / EVOLUTION_API_KEY ausentes).",
    };
  }

  try {
    // Instance may already exist from a previous attempt — that's fine,
    // we just move on to fetching/refreshing the QR code either way.
    await fetch(`${baseUrl}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey! },
      body: JSON.stringify({ instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
    }).catch(() => null);

    const res = await fetch(`${baseUrl}/instance/connect/${instanceName}`, {
      method: "GET",
      headers: { apikey: apiKey! },
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Evolution API [${res.status}]: ${body.slice(0, 400)}` };
    }
    const data = (await res.json()) as { base64?: string; code?: string };
    if (!data.base64) {
      return { ok: false, error: "QR Code não retornado pela Evolution API." };
    }
    return { ok: true, qrCode: data.base64, status: "awaiting_qr" };
  } catch (e) {
    return { ok: false, error: `Evolution API: ${(e as Error).message}` };
  }
}

/** Poll the connection state for an existing instance. */
export async function getWhatsAppPairingStatus(instanceName: string): Promise<EvoResponse> {
  const { baseUrl, apiKey, configured } = evoConfig();
  if (!configured) return { ok: false, error: "Evolution API não configurada." };

  try {
    const res = await fetch(`${baseUrl}/instance/connectionState/${instanceName}`, {
      headers: { apikey: apiKey! },
    });
    if (!res.ok) return { ok: false, error: `Evolution API [${res.status}]` };
    const data = (await res.json()) as { instance?: { state?: string; owner?: string } };
    const state = data.instance?.state; // "open" | "connecting" | "close"
    const status =
      state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
    return { ok: true, status, phoneNumber: data.instance?.owner };
  } catch (e) {
    return { ok: false, error: `Evolution API: ${(e as Error).message}` };
  }
}

/** Unlink the device (logout), keeping the instance so it can be re-paired. */
export async function disconnectWhatsApp(instanceName: string): Promise<EvoResponse> {
  const { baseUrl, apiKey, configured } = evoConfig();
  if (!configured) return { ok: false, error: "Evolution API não configurada." };

  try {
    const res = await fetch(`${baseUrl}/instance/logout/${instanceName}`, {
      method: "DELETE",
      headers: { apikey: apiKey! },
    });
    return { ok: res.ok, status: "disconnected" };
  } catch (e) {
    return { ok: false, error: `Evolution API: ${(e as Error).message}` };
  }
}
