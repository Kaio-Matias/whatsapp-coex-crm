import { subscribeAppToWaba, requestSmbSync } from '../lib/meta.js';

/**
 * Rodar UMA vez, logo depois de conectar o número em Coexistence:
 *
 *   /api/setup?key=SEU_SETUP_KEY&waba_id=XXXX&phone_number_id=YYYY
 *
 * 1. Inscreve o app na conta WhatsApp Business do cliente (para os webhooks chegarem).
 * 2. Pede a sincronização dos contatos do app.
 * 3. Pede a sincronização do histórico de conversas.
 *
 * Faça isso logo após conectar: a Meta só permite essa sincronização
 * por um período curto depois do onboarding.
 */
export async function GET(request) {
  const url = new URL(request.url);

  if (!process.env.SETUP_KEY || url.searchParams.get('key') !== process.env.SETUP_KEY) {
    return Response.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const wabaId = url.searchParams.get('waba_id');
  const phoneNumberId = url.searchParams.get('phone_number_id');
  if (!wabaId || !phoneNumberId) {
    return Response.json({ error: 'Informe waba_id e phone_number_id' }, { status: 400 });
  }

  const result = {};
  for (const [step, fn] of [
    ['inscrever_app', () => subscribeAppToWaba(wabaId)],
    ['sync_contatos', () => requestSmbSync(phoneNumberId, 'smb_app_state_sync')],
    ['sync_historico', () => requestSmbSync(phoneNumberId, 'history')],
  ]) {
    try {
      result[step] = { ok: true, resposta: await fn() };
    } catch (err) {
      result[step] = { ok: false, erro: err.message };
    }
  }

  return Response.json(result);
}
