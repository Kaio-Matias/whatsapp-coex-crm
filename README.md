# WhatsApp Coexistence → CRM (Vercel)

Recebe os webhooks do WhatsApp (número em Coexistence) e envia contatos e mensagens para o CRM.

## Estrutura

- `api/webhook.js` – URL do webhook da Meta (verificação + eventos)
- `api/setup.js` – rodar uma vez após conectar o número (inscreve o app e pede sync de contatos e histórico)
- `lib/normalize.js` – transforma os payloads da Meta em eventos simples
- `lib/crm.js` – envio para o CRM (Hubstrom) — **é aqui que entra a API do CRM**
- `lib/meta.js` – assinatura e chamadas à Graph API

## Deploy na Vercel

1. Suba esta pasta para um repositório no GitHub.
2. Na Vercel: **Add New → Project**, importe o repositório e clique em **Deploy**.
3. A URL do webhook será: `https://SEU-PROJETO.vercel.app/api/webhook`
   (não precisa de domínio próprio).

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | O que é |
|---|---|
| `META_VERIFY_TOKEN` | Uma senha qualquer que você inventa; a mesma vai no painel da Meta |
| `META_APP_SECRET` | App → Configurações do app → Básico → Chave secreta do app |
| `META_ACCESS_TOKEN` | Token permanente de um Usuário do sistema (Business Manager) com `whatsapp_business_management` e `whatsapp_business_messaging` |
| `SETUP_KEY` | Outra senha qualquer, para proteger `/api/setup` |
| `CRM_WEBHOOK_URL` | (opcional) URL de entrada do CRM. Sem ela, os eventos só aparecem nos Logs da Vercel |
| `CRM_API_TOKEN` | (opcional) token do CRM |

Depois de salvar as variáveis, faça **Redeploy**.

## Configurar na Meta

App → WhatsApp → Configuração → Webhook:
- URL de callback: `https://SEU-PROJETO.vercel.app/api/webhook`
- Token de verificação: o valor de `META_VERIFY_TOKEN`
- Assine os campos: `messages`, `history`, `smb_app_state_sync`, `smb_message_echoes`

## Depois de conectar o número (Coexistence)

Pegue o **WABA ID** e o **Phone Number ID** (WhatsApp Manager ou App → WhatsApp → Configuração da API) e abra **logo em seguida**:

```
https://SEU-PROJETO.vercel.app/api/setup?key=SETUP_KEY&waba_id=WABA_ID&phone_number_id=PHONE_NUMBER_ID
```

Acompanhe os eventos em Vercel → Logs.
