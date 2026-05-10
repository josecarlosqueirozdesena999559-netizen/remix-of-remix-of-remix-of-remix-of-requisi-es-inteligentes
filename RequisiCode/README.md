# RequisiCode

Aplicativo Android nativo para ler o QR Code da requisição.

Fluxo:

1. Abre o app.
2. Permite o uso da câmera.
3. Lê o QR Code do PDF.
4. Mostra número, tipo, programa, usuário, CPF e data.
5. Ao tocar em **Confirmar pronto**, chama a Edge Function do Supabase.
6. A Edge Function marca a requisição como `pronto_retirada` e envia o WhatsApp pelo modelo `pedido_pronto_retirada`.

Endpoint usado pelo app:

```text
https://xzoiqjsttggtrjlrhcjm.supabase.co/functions/v1/confirm-request-ready
```

Antes de usar em produção, falta publicar e configurar o Supabase com uma conta que tenha permissão no projeto.

```bash
supabase login
supabase db push
supabase secrets set WHATSAPP_ACCESS_TOKEN=seu_token_meta
supabase secrets set WHATSAPP_PHONE_NUMBER_ID=seu_phone_number_id
supabase secrets set WHATSAPP_GRAPH_API_VERSION=v25.0
supabase functions deploy confirm-request-ready
```

A função também consegue ler as configurações pela tabela `app_settings`, se preferir gravar esses valores no banco.
O projeto já está com `verify_jwt = false` em `supabase/config.toml`, porque o app não faz login.

Checklist de publicação:

1. Usar uma conta/token do Supabase com permissão para deploy no projeto `xzoiqjsttggtrjlrhcjm`.
2. Aplicar as migrations, principalmente `app_settings` e `usuarios.whatsapp`.
3. Cadastrar o WhatsApp dos usuários em `usuarios.whatsapp`.
4. Configurar as credenciais do WhatsApp por secrets ou por `app_settings`.
5. Publicar `confirm-request-ready`.
6. Abrir o projeto no Android Studio e compilar o app.
