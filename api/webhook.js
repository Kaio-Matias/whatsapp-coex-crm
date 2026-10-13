import { waitUntil } from '@vercel/functions';
import { verifySignature } from '../lib/meta.js';
import { normalizeWebhook } from '../lib/normalize.js';
import { pushEvents } from '../lib/crm.js';

/**
 * GET: verificação do webhook pela Meta (quando você clica em "Verificar e salvar").
 */
export function GET(request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token && token === process.env.META_VERIFY_TOKEN) {
    return new Response(challenge ?? '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

/**
 * POST: eventos do WhatsApp (mensagens, ecos do app, contatos, histórico).
 * Responde 200 na hora e processa em segundo plano, porque a Meta reenvia
 * o evento se a resposta demorar.
 */
export async function POST(request) {
  const raw = await request.text();

  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'), process.env.META_APP_SECRET)) {
    console.warn('[webhook] assinatura inválida');
    return new Response('Invalid signature', { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const fields = (payload.entry ?? []).flatMap(e => (e.changes ?? []).map(c => c.field));
  console.log('[webhook] recebido:', fields.join(', '));

  const events = normalizeWebhook(payload);
  waitUntil(pushEvents(events));

  return new Response('OK', { status: 200 });
}
