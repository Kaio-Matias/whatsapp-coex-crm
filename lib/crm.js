/**
 * Adaptador do CRM (Hubstrom).
 *
 * Ainda não temos a documentação da API do Hubstrom, então este arquivo:
 *  - envia cada evento normalizado para CRM_WEBHOOK_URL (se o CRM aceitar webhook de entrada), ou
 *  - só registra no log da Vercel (modo teste, sem CRM_WEBHOOK_URL).
 *
 * Quando tivermos a API do Hubstrom, basta trocar o corpo de upsertContact() e addMessage()
 * pelas chamadas reais (criar/atualizar contato e registrar mensagem na timeline).
 */

const CRM_URL = process.env.CRM_WEBHOOK_URL;
const CRM_TOKEN = process.env.CRM_API_TOKEN;

async function send(type, data) {
  if (!CRM_URL) {
    console.log(`[CRM:teste] ${type}`, JSON.stringify(data));
    return;
  }
  const res = await fetch(CRM_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(CRM_TOKEN ? { Authorization: `Bearer ${CRM_TOKEN}` } : {}),
    },
    body: JSON.stringify({ type, data }),
  });
  if (!res.ok) {
    throw new Error(`CRM respondeu ${res.status}: ${await res.text().catch(() => '')}`);
  }
}

/** Cria ou atualiza um contato (chave = telefone no formato internacional, só dígitos). */
export function upsertContact({ phone, name, source }) {
  return send('contact.upsert', { phone, name, source });
}

export function removeContact({ phone }) {
  return send('contact.remove', { phone });
}

/** Registra uma mensagem na timeline do contato. O id evita duplicar mensagens. */
export function addMessage(msg) {
  return send('message.create', msg);
}

export function updateMessageStatus({ id, status, timestamp }) {
  return send('message.status', { id, status, timestamp });
}

/** Envia os eventos normalizados para o CRM, um por um. */
export async function pushEvents(events) {
  for (const e of events) {
    try {
      if (e.kind === 'contact') {
        if (!e.phone) continue;
        await (e.action === 'remove' ? removeContact(e) : upsertContact(e));
      } else if (e.kind === 'message') {
        await addMessage(e);
      } else if (e.kind === 'status') {
        await updateMessageStatus(e);
      } else if (e.kind === 'history_error') {
        console.warn('[history] a empresa recusou ou houve erro no histórico:', JSON.stringify(e.errors));
      }
    } catch (err) {
      console.error(`[CRM] falha ao enviar ${e.kind}:`, err.message);
    }
  }
}
