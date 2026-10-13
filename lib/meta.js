import crypto from 'node:crypto';

const GRAPH_VERSION = process.env.GRAPH_API_VERSION || 'v23.0';

/**
 * Confere a assinatura X-Hub-Signature-256 que a Meta envia em todo webhook.
 * Garante que o POST veio mesmo da Meta (usa o App Secret).
 */
export function verifySignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret) return true; // sem segredo configurado, não valida (só para testes)
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');
  const received = signatureHeader.slice('sha256='.length);

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(received, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Chamada genérica à Graph API com o token configurado. */
export async function graph(path, { method = 'GET', body } = {}) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error('META_ACCESS_TOKEN não configurado');

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText;
    throw new Error(`Graph API ${res.status}: ${msg}`);
  }
  return data;
}

/** Inscreve o app na conta WhatsApp Business (sem isso os webhooks não chegam). */
export function subscribeAppToWaba(wabaId) {
  return graph(`${wabaId}/subscribed_apps`, { method: 'POST' });
}

/**
 * Dispara a sincronização do app WhatsApp Business (Coexistence).
 * syncType: 'smb_app_state_sync' (contatos) ou 'history' (histórico de conversas).
 * Deve ser chamado logo após conectar o número.
 */
export function requestSmbSync(phoneNumberId, syncType) {
  return graph(`${phoneNumberId}/smb_app_data`, {
    method: 'POST',
    body: { messaging_product: 'whatsapp', sync_type: syncType },
  });
}
