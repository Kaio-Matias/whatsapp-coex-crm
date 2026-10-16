import {
  exchangeCode,
  wabaIdsFromToken,
  listPhoneNumbers,
  subscribeAppToWaba,
  requestSmbSync,
} from '../lib/meta.js';

/**
 * URL de redirecionamento do Cadastro incorporado hospedado pela Meta.
 *
 * Quando o cliente termina o cadastro, a Meta redireciona para cá com ?code=...
 * Este endpoint, na hora:
 *   1. troca o code por um token com acesso à conta nova;
 *   2. descobre a conta do WhatsApp (WABA) e os números;
 *   3. inscreve o app na conta (para os webhooks chegarem);
 *   4. pede a sincronização de contatos e do histórico (Coexistence).
 * E mostra um resumo na tela.
 */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function step(fn) {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

function page(title, bodyHtml, status = 200) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>
 body{font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:720px;margin:0 auto;padding:32px 16px;color:#1f2933;background:#fff;line-height:1.5}
 h1{font-size:1.4rem} .card{border:1px solid #e4e7eb;border-radius:10px;padding:16px;margin:12px 0}
 .ok{color:#127a3a;font-weight:600} .err{color:#b42318;font-weight:600} code{background:#f3f4f6;padding:2px 6px;border-radius:4px}
</style></head><body>${bodyHtml}</body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

const label = r => (r.ok ? '<span class="ok">OK</span>' : `<span class="err">Erro:</span> ${esc(r.erro)}`);

export async function GET(request) {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams);
  console.log('[onboarding] retorno do cadastro, parâmetros:', Object.keys(params).join(', '));

  if (params.error || params.error_reason) {
    return page('Cadastro não concluído', `<h1>Cadastro não concluído</h1>
      <p class="err">${esc(params.error_description || params.error_reason || params.error)}</p>`, 400);
  }

  const code = params.code;
  if (!code) {
    return page('Aguardando cadastro', `<h1>Nenhum código recebido</h1>
      <p>Esta página é aberta automaticamente pela Meta no fim do cadastro do WhatsApp.</p>`, 400);
  }

  // 1. Token do cadastro
  const redirectUri = `${url.origin}${url.pathname}`;
  let token;
  try {
    token = await exchangeCode(code, redirectUri);
  } catch (err) {
    console.error('[onboarding]', err.message);
    return page('Erro no cadastro', `<h1>Não foi possível finalizar</h1>
      <p class="err">${esc(err.message)}</p>
      <p>Se o cadastro foi concluído, use o <code>/api/setup</code> manualmente com o WABA ID e o Phone Number ID.</p>`, 500);
  }

  // 2. Contas do WhatsApp (pelo token ou pelo parâmetro, se a Meta enviar)
  let wabaIds = [];
  try {
    wabaIds = await wabaIdsFromToken(token);
  } catch (err) {
    console.error('[onboarding] debug_token falhou:', err.message);
  }
  if (params.waba_id && !wabaIds.includes(params.waba_id)) wabaIds.push(params.waba_id);

  if (!wabaIds.length) {
    return page('Conta não encontrada', `<h1>Cadastro recebido, mas nenhuma conta do WhatsApp foi encontrada</h1>
      <p>Use o <code>/api/setup</code> manualmente com os IDs do WhatsApp Manager.</p>`, 500);
  }

  // 3 e 4. Para cada conta: inscrever o app e sincronizar cada número
  const blocos = [];
  for (const wabaId of wabaIds) {
    const inscricao = await step(() => subscribeAppToWaba(wabaId, token));
    console.log(`[onboarding] WABA ${wabaId} inscrever_app:`, JSON.stringify(inscricao));

    let numeros = [];
    try {
      numeros = await listPhoneNumbers(wabaId, token);
    } catch (err) {
      console.error(`[onboarding] listar números da WABA ${wabaId}:`, err.message);
    }

    const linhas = [];
    for (const n of numeros) {
      const contatos = await step(() => requestSmbSync(n.id, 'smb_app_state_sync', token));
      const historico = await step(() => requestSmbSync(n.id, 'history', token));
      console.log(`[onboarding] número ${n.display_phone_number} (${n.id}) sync_contatos:`, JSON.stringify(contatos), 'sync_historico:', JSON.stringify(historico));
      linhas.push(`<div class="card">
        <strong>${esc(n.display_phone_number)}</strong> — ${esc(n.verified_name)}<br>
        Phone Number ID: <code>${esc(n.id)}</code><br>
        Sincronizar contatos: ${label(contatos)}<br>
        Sincronizar histórico: ${label(historico)}
      </div>`);
    }

    blocos.push(`<div class="card">
      <strong>Conta do WhatsApp (WABA):</strong> <code>${esc(wabaId)}</code><br>
      Inscrever app nos webhooks: ${label(inscricao)}
      ${linhas.join('') || '<p>Nenhum número encontrado nesta conta.</p>'}
    </div>`);
  }

  return page('WhatsApp conectado', `<h1>WhatsApp conectado ao CRM</h1>
    <p>Os contatos e o histórico de conversas vão chegar nos próximos minutos.</p>
    ${blocos.join('')}
    <p>Pode fechar esta página.</p>`);
}
