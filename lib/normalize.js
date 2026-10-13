/**
 * Converte os payloads de webhook da Meta em eventos simples para o CRM:
 *   { kind: 'contact', phone, name, action, source }
 *   { kind: 'message', id, phone, direction, type, text, timestamp, channel, source }
 *   { kind: 'status',  id, phone, status, timestamp }
 *
 * direction: 'in' (cliente -> empresa) | 'out' (empresa -> cliente)
 * channel:   'api' (enviado pela Cloud API) | 'app' (enviado pelo app WhatsApp Business)
 */

function textOf(msg) {
  switch (msg?.type) {
    case 'text': return msg.text?.body ?? '';
    case 'image':
    case 'video':
    case 'document':
    case 'audio':
    case 'sticker':
      return msg[msg.type]?.caption ?? `[${msg.type}]`;
    case 'location': return `[localização] ${msg.location?.latitude},${msg.location?.longitude}`;
    case 'contacts': return '[contato compartilhado]';
    case 'button': return msg.button?.text ?? '[botão]';
    case 'interactive':
      return msg.interactive?.button_reply?.title
        ?? msg.interactive?.list_reply?.title
        ?? '[interativo]';
    case 'reaction': return `[reação] ${msg.reaction?.emoji ?? ''}`;
    default: return msg?.type ? `[${msg.type}]` : '';
  }
}

function toIso(ts) {
  const n = Number(ts);
  return Number.isFinite(n) ? new Date(n * 1000).toISOString() : new Date().toISOString();
}

export function normalizeWebhook(payload) {
  const events = [];

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const field = change.field;
      const v = change.value ?? {};
      const businessPhone = v.metadata?.display_phone_number;

      // 1) Mensagens recebidas dos clientes (e status das enviadas pela API)
      if (field === 'messages') {
        const names = Object.fromEntries((v.contacts ?? []).map(c => [c.wa_id, c.profile?.name]));

        for (const m of v.messages ?? []) {
          if (names[m.from]) {
            events.push({ kind: 'contact', phone: m.from, name: names[m.from], action: 'upsert', source: 'messages' });
          }
          events.push({
            kind: 'message', id: m.id, phone: m.from, direction: 'in',
            type: m.type, text: textOf(m), timestamp: toIso(m.timestamp),
            channel: 'api', businessPhone, source: 'messages',
          });
        }
        for (const s of v.statuses ?? []) {
          events.push({ kind: 'status', id: s.id, phone: s.recipient_id, status: s.status, timestamp: toIso(s.timestamp) });
        }
      }

      // 2) Mensagens que a empresa enviou pelo app WhatsApp Business (Coexistence)
      if (field === 'smb_message_echoes') {
        for (const m of v.message_echoes ?? []) {
          events.push({
            kind: 'message', id: m.id, phone: m.to, direction: 'out',
            type: m.type, text: textOf(m), timestamp: toIso(m.timestamp),
            channel: 'app', businessPhone, source: 'smb_message_echoes',
          });
        }
      }

      // 3) Contatos do app WhatsApp Business (sincronização inicial + mudanças)
      if (field === 'smb_app_state_sync') {
        for (const s of v.state_sync ?? []) {
          if (s.type !== 'contact' || !s.contact) continue;
          events.push({
            kind: 'contact',
            phone: s.contact.phone_number?.replace(/\D/g, ''),
            name: s.contact.full_name || s.contact.first_name || null,
            action: s.action === 'remove' ? 'remove' : 'upsert',
            source: 'smb_app_state_sync',
          });
        }
      }

      // 4) Histórico de conversas (até 6 meses, se a empresa autorizou)
      if (field === 'history') {
        for (const h of v.history ?? []) {
          if (h.errors?.length) {
            events.push({ kind: 'history_error', errors: h.errors, source: 'history' });
            continue;
          }
          for (const thread of h.threads ?? []) {
            for (const m of thread.messages ?? []) {
              const fromMe = Boolean(m.history_context?.from_me);
              events.push({
                kind: 'message', id: m.id, phone: thread.id,
                direction: fromMe ? 'out' : 'in',
                type: m.type, text: textOf(m), timestamp: toIso(m.timestamp),
                channel: 'history', businessPhone, source: 'history',
              });
            }
          }
        }
      }
    }
  }

  return events;
}
