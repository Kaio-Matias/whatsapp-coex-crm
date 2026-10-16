import { graph } from '../lib/meta.js';

/**
 * Painel simples do ConceitoNegocio CRM (protegido pela SETUP_KEY):
 *  - Enviar mensagem do WhatsApp (texto ou modelo)      -> whatsapp_business_messaging
 *  - Criar modelo de mensagem e listar modelos da conta -> whatsapp_business_management
 *
 * Acesso: /api/admin?key=SUA_SETUP_KEY
 */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function authorized(key) {
  return Boolean(process.env.SETUP_KEY) && key === process.env.SETUP_KEY;
}

function page({ key, wabaId = '', phoneId = '', result = '', templates = [] }) {
  const rows = templates.map(t => `<tr><td>${esc(t.name)}</td><td>${esc(t.category)}</td><td>${esc(t.language)}</td><td>${esc(t.status)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>ConceitoNegocio CRM – Painel WhatsApp</title>
<style>
 :root{--bg:#f6f7f9;--card:#fff;--ink:#1f2933;--muted:#616e7c;--line:#e4e7eb;--brand:#0f62fe;--ok:#127a3a;--err:#b42318}
 *{box-sizing:border-box} body{margin:0;font-family:system-ui,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink)}
 header{background:#0b1f44;color:#fff;padding:16px} header h1{margin:0;font-size:1.15rem} header p{margin:4px 0 0;color:#c7d2fe;font-size:.9rem}
 main{max-width:960px;margin:0 auto;padding:16px;display:grid;gap:16px}
 .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
 h2{font-size:1rem;margin:0 0 12px} label{display:block;font-size:.85rem;color:var(--muted);margin:10px 0 4px}
 input,select,textarea{width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:8px;font:inherit}
 textarea{min-height:80px} button{margin-top:12px;background:var(--brand);color:#fff;border:0;border-radius:8px;padding:10px 16px;font:inherit;font-weight:600;cursor:pointer}
 .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px} @media(max-width:640px){.grid{grid-template-columns:1fr}}
 pre{background:#0b1020;color:#d1fae5;padding:12px;border-radius:8px;overflow:auto;font-size:.8rem;white-space:pre-wrap;word-break:break-word}
 table{width:100%;border-collapse:collapse;font-size:.9rem} th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line)}
</style></head><body>
<header><h1>ConceitoNegocio CRM · Painel WhatsApp</h1><p>Contabilidade &amp; Negócios</p></header>
<main>
 ${result ? `<div class="card"><h2>Resultado da API</h2><pre>${esc(result)}</pre></div>` : ''}

 <form class="card" method="post">
  <h2>Conta e número</h2>
  <input type="hidden" name="key" value="${esc(key)}">
  <div class="grid">
   <div><label>WhatsApp Business Account ID</label><input name="waba_id" value="${esc(wabaId)}" required></div>
   <div><label>Phone Number ID (remetente)</label><input name="phone_number_id" value="${esc(phoneId)}" required></div>
  </div>

  <h2 style="margin-top:20px">1. Enviar mensagem</h2>
  <div class="grid">
   <div><label>Destinatário (com DDI, só números)</label><input name="to" placeholder="5582999999999"></div>
   <div><label>Tipo</label><select name="msg_type">
     <option value="template">Modelo hello_world (inicia conversa)</option>
     <option value="text">Texto livre (só dentro da janela de 24h)</option>
   </select></div>
  </div>
  <label>Texto (para tipo "Texto livre")</label><textarea name="text">Olá! Mensagem enviada pelo ConceitoNegocio CRM.</textarea>
  <button name="action" value="send">Enviar mensagem</button>

  <h2 style="margin-top:24px">2. Criar modelo de mensagem</h2>
  <div class="grid">
   <div><label>Nome (minúsculas e _)</label><input name="tpl_name" value="boas_vindas_crm"></div>
   <div><label>Categoria</label><select name="tpl_category"><option>UTILITY</option><option>MARKETING</option></select></div>
   <div><label>Idioma</label><select name="tpl_lang"><option value="pt_BR">pt_BR</option><option value="en_US">en_US</option></select></div>
  </div>
  <label>Corpo do modelo ({{1}} = nome do cliente)</label>
  <textarea name="tpl_body">Olá {{1}}, recebemos seu contato na Contabilidade & Negócios. Em breve um especialista vai te responder por aqui.</textarea>
  <label>Exemplo para {{1}}</label><input name="tpl_example" value="Maria">
  <button name="action" value="template">Criar modelo</button>
  <button name="action" value="list" style="background:#475467">Listar modelos da conta</button>
 </form>

 ${rows ? `<div class="card"><h2>Modelos da conta</h2><table><tr><th>Nome</th><th>Categoria</th><th>Idioma</th><th>Status</th></tr>${rows}</table></div>` : ''}
</main></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export function GET(request) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!authorized(key)) return new Response('Não autorizado', { status: 401 });
  return page({
    key,
    wabaId: url.searchParams.get('waba_id') || '',
    phoneId: url.searchParams.get('phone_number_id') || '',
  });
}

export async function POST(request) {
  const form = Object.fromEntries(await request.formData());
  if (!authorized(form.key)) return new Response('Não autorizado', { status: 401 });

  const ctx = { key: form.key, wabaId: form.waba_id, phoneId: form.phone_number_id };
  let result;
  let templates = [];

  try {
    if (form.action === 'send') {
      const to = String(form.to || '').replace(/\D/g, '');
      const body = form.msg_type === 'text'
        ? { messaging_product: 'whatsapp', to, type: 'text', text: { body: form.text } }
        : { messaging_product: 'whatsapp', to, type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } };
      result = await graph(`${form.phone_number_id}/messages`, { method: 'POST', body });
    } else if (form.action === 'template') {
      result = await graph(`${form.waba_id}/message_templates`, {
        method: 'POST',
        body: {
          name: form.tpl_name,
          category: form.tpl_category,
          language: form.tpl_lang,
          components: [{
            type: 'BODY',
            text: form.tpl_body,
            ...(String(form.tpl_body).includes('{{1}}') ? { example: { body_text: [[form.tpl_example || 'Maria']] } } : {}),
          }],
        },
      });
    }
    // Sempre mostra a lista atualizada de modelos
    const list = await graph(`${form.waba_id}/message_templates?fields=name,category,language,status&limit=50`);
    templates = list?.data ?? [];
    if (form.action === 'list') result = { total: templates.length };
  } catch (err) {
    result = { erro: err.message };
  }

  return page({ ...ctx, result: JSON.stringify(result, null, 2), templates });
}
