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
    // Some Evolution API versions return the QR code inline in this very
    // response (instance.qrcode.base64); check for it before falling back
    // to the separate /connect call other versions require.
    const createRes = await fetch(`${baseUrl}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey! },
      body: JSON.stringify({ instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
    }).catch(() => null);

    if (createRes?.ok) {
      const createData = (await createRes.json().catch(() => null)) as {
        qrcode?: { base64?: string };
      } | null;
      const inlineQr = createData?.qrcode?.base64;
      if (inlineQr) {
        const qrCode = inlineQr.startsWith("data:")
          ? inlineQr
          : `data:image/png;base64,${inlineQr}`;
        return { ok: true, qrCode, status: "awaiting_qr" };
      }
    } else {
      // Instance already existed (create failed/no-op) — if a previous QR
      // was generated but never scanned (or expired), the instance can be
      // left in a "half-connecting" state where /instance/connect stops
      // returning a fresh QR. Logging out first resets it to a clean
      // disconnected state so the next QR request actually gets a new code.
      // Best-effort: ignore failures here (e.g. it was already logged out).
      await fetch(`${baseUrl}/instance/logout/${instanceName}`, {
        method: "DELETE",
        headers: { apikey: apiKey! },
      }).catch(() => null);
    }

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
      return {
        ok: false,
        error:
          "QR Code não retornado pela Evolution API mesmo após reiniciar a sessão. Aguarde alguns segundos e tente 'Gerar novo QR Code' de novo — se persistir, a instância pode precisar ser reiniciada direto no Railway.",
      };
    }
    // Some Evolution API versions return the bare base64 payload without
    // the "data:image/png;base64," prefix an <img> tag needs — normalize
    // either shape into a real data URI.
    const qrCode = data.base64.startsWith("data:")
      ? data.base64
      : `data:image/png;base64,${data.base64}`;
    return { ok: true, qrCode, status: "awaiting_qr" };
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
    if (res.ok) {
      const data = (await res.json()) as { instance?: { state?: string; owner?: string } };
      const state = data.instance?.state; // "open" | "connecting" | "close"
      const status =
        state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
      return { ok: true, status, phoneNumber: data.instance?.owner };
    }

    // /instance/connectionState/{name} 404s on some Evolution API v2.3.x
    // builds even when the instance is genuinely connected (a known
    // routing bug in that version range). /instance/fetchInstances
    // doesn't hit the same broken route and returns the same connection
    // state as part of a fuller instance listing — use it as a fallback
    // instead of reporting "disconnected" when we actually don't know.
    if (res.status === 404) {
      const listRes = await fetch(
        `${baseUrl}/instance/fetchInstances?instanceName=${instanceName}`,
        {
          headers: { apikey: apiKey! },
        },
      );
      if (listRes.ok) {
        const list = (await listRes.json()) as Array<{
          name?: string;
          instanceName?: string;
          connectionStatus?: string;
          ownerJid?: string;
        }>;
        const match = Array.isArray(list)
          ? list.find((i) => i.name === instanceName || i.instanceName === instanceName)
          : null;
        if (match) {
          const raw = (match.connectionStatus ?? "").toLowerCase();
          const status =
            raw === "open" ? "connected" : raw === "connecting" ? "connecting" : "disconnected";
          return { ok: true, status, phoneNumber: match.ownerJid };
        }
      }
    }

    return { ok: false, error: `Evolution API [${res.status}]` };
  } catch (e) {
    return { ok: false, error: `Evolution API: ${(e as Error).message}` };
  }
}

/** Sends a plain text WhatsApp message through the clinic's Evolution API instance. */
export async function sendWhatsAppMessage(
  instanceName: string,
  phone: string,
  text: string,
): Promise<EvoResponse> {
  const { baseUrl, apiKey, configured } = evoConfig();
  if (!configured) return { ok: false, error: "Evolution API não configurada." };

  try {
    const res = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey! },
      body: JSON.stringify({ number: phone, text }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Evolution API [${res.status}]: ${body.slice(0, 400)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Evolution API: ${(e as Error).message}` };
  }
}
/**
 * Fully disconnects AND deletes the instance, rather than only logging
 * out. Evolution API v2.3.x has documented reliability issues with
 * several /instance/* endpoints in this build (see the connectionState
 * 404 workaround above) — /instance/logout alone was found to leave the
 * underlying session alive in practice, so a "new" pairing attempt kept
 * silently reconnecting the OLD number instead of offering a fresh QR
 * for a different phone. Deleting the instance outright removes its
 * session data entirely; the next "Gerar QR Code" recreates it from
 * scratch via startWhatsAppPairing's create step.
 */
export async function disconnectWhatsApp(instanceName: string): Promise<EvoResponse> {
  const { baseUrl, apiKey, configured } = evoConfig();
  if (!configured) return { ok: false, error: "Evolution API não configurada." };

  try {
    // Best-effort logout first (in case delete alone leaves an orphaned
    // active session on some builds) — ignore its result either way.
    await fetch(`${baseUrl}/instance/logout/${instanceName}`, {
      method: "DELETE",
      headers: { apikey: apiKey! },
    }).catch(() => null);

    const res = await fetch(`${baseUrl}/instance/delete/${instanceName}`, {
      method: "DELETE",
      headers: { apikey: apiKey! },
    });
    // A 404 here just means the instance was already gone — that still
    // counts as "successfully disconnected" from the user's perspective.
    return { ok: res.ok || res.status === 404, status: "disconnected" };
  } catch (e) {
    return { ok: false, error: `Evolution API: ${(e as Error).message}` };
  }
}
