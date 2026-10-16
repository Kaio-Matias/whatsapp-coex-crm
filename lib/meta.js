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

/**
 * Chamada genérica à Graph API.
 * Usa o token passado em `token` ou, se não houver, o META_ACCESS_TOKEN.
 */
export async function graph(path, { method = 'GET', body, token: tokenOverride } = {}) {
  const token = tokenOverride || process.env.META_ACCESS_TOKEN;
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
export function subscribeAppToWaba(wabaId, token) {
  return graph(`${wabaId}/subscribed_apps`, { method: 'POST', token });
}

/**
 * Dispara a sincronização do app WhatsApp Business (Coexistence).
 * syncType: 'smb_app_state_sync' (contatos) ou 'history' (histórico de conversas).
 * Deve ser chamado logo após conectar o número.
 */
export function requestSmbSync(phoneNumberId, syncType, token) {
  return graph(`${phoneNumberId}/smb_app_data`, {
    method: 'POST',
    body: { messaging_product: 'whatsapp', sync_type: syncType },
    token,
  });
}

/** Troca o `code` devolvido pelo Cadastro incorporado por um token de acesso. */
export async function exchangeCode(code, redirectUri) {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    code,
  });
  if (redirectUri) params.set('redirect_uri', redirectUri);

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Troca do code falhou: ${data?.error?.message || res.statusText}`);
  }
  return data.access_token;
}

/** Descobre quais contas do WhatsApp (WABA) o token recebeu no cadastro. */
export async function wabaIdsFromToken(token) {
  const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
  const data = await graph(`debug_token?input_token=${encodeURIComponent(token)}`, { token: appToken });
  const scopes = data?.data?.granular_scopes ?? [];
  const ids = scopes
    .filter(s => s.scope === 'whatsapp_business_management' || s.scope === 'whatsapp_business_messaging')
    .flatMap(s => s.target_ids ?? []);
  return [...new Set(ids)];
}

/** Lista os números de uma conta do WhatsApp. */
export async function listPhoneNumbers(wabaId, token) {
  const data = await graph(
    `${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,platform_type,status`,
    { token },
  );
  return data?.data ?? [];
}
