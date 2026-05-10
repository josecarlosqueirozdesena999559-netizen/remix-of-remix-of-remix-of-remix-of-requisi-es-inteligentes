# WhatsApp Cloud API

Esta integração usa a API oficial do WhatsApp Cloud API pelo endpoint:

```txt
POST https://graph.facebook.com/{WHATSAPP_GRAPH_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages
```

## Variáveis necessárias

Configure em ambiente local ou no provedor de deploy. Não coloque o token no código.

```txt
WHATSAPP_ACCESS_TOKEN=<token permanente do Meta Business>
WHATSAPP_PHONE_NUMBER_ID=<id do número do WhatsApp>
WHATSAPP_GRAPH_API_VERSION=v25.0
```

No Cloudflare/Wrangler, configure os segredos assim:

```bash
wrangler secret put WHATSAPP_ACCESS_TOKEN
wrangler secret put WHATSAPP_PHONE_NUMBER_ID
wrangler secret put WHATSAPP_GRAPH_API_VERSION
```

## Próxima etapa do fluxo

1. Adicionar o telefone/WhatsApp do usuário no cadastro.
2. Gerar um QR code no PDF contendo o identificador seguro da requisição.
3. Criar a tela/leitor para o admin marcar a requisição como separada.
4. Ao ler o QR code, buscar a requisição e enviar:

```txt
Seu pedido número {codigo}, tipo {tipo}, está separado.
Por favor, venha retirar no almoxarifado.
```

## Template de boas-vindas

Quando o usuário informa o WhatsApp no sistema, o backend envia o template:

```txt
boas_vindas_almoxarifado
```

Idioma:

```txt
pt_BR
```

Corpo sugerido no Meta Business:

```txt
Olá, {{1}}. Bem-vindo ao número oficial do Almoxarifado.
Por aqui você também receberá notificações para regularizar assinaturas pendentes e saber quando seus pedidos estiverem prontos para retirada.
```

Exemplo para a variável `{{1}}`:

```txt
Maria Silva
```

## Template de requisicao gerada

Quando o usuario cria ou reenvia uma requisicao, o backend envia o template:

```txt
pedido_gerado_assinatura
```

Idioma:

```txt
pt_BR
```

Corpo sugerido no Meta Business:

```txt
Seu pedido numero {{1}} foi gerado.
Tipo de material solicitado: {{2}}
Data: {{3}}
Por favor, assine a requisicao para que o almoxarifado receba o pedido.
```

Variaveis:

```txt
{{1}} = numero/codigo da requisicao
{{2}} = tipo de material
{{3}} = data da requisicao
```

## Template de assinatura de saida

Quando o almoxarifado anexa o documento de saida e a requisicao passa a aguardar assinatura de saida, o backend envia o template:

```txt
saida_anexada_pedido
```

Idioma:

```txt
pt_BR
```

Corpo sugerido no Meta Business:

```txt
A saida do seu pedido numero {{1}} foi gerada pelo almoxarifado.
Tipo de material solicitado: {{2}}
Data: {{3}}
Por favor, assine o documento de saida para concluir o processo.
```

Variaveis:

```txt
{{1}} = numero/codigo da requisicao
{{2}} = tipo de material
{{3}} = data da requisicao
```

## Template de retirada

Quando o QR Code e lido pelo aplicativo RequisiCode e o pedido fica pronto para retirada, a Edge Function envia o template:

```txt
pedido_pronto_retirada
```

Idioma:

```txt
pt_BR
```

Corpo sugerido no Meta Business:

```txt
Seu pedido numero {{1}} esta pronto para retirada.
Tipo de material solicitado: {{2}}
Data: {{3}}
Por favor, venha retirar no almoxarifado.
```

Variaveis:

```txt
{{1}} = numero/codigo da requisicao
{{2}} = tipo de material
{{3}} = data da requisicao
```

## Webhook para leitura do QR pelo WhatsApp

Tambem existe o fluxo por WhatsApp:

1. O administrador cadastra um ou mais numeros autorizados em **Configuracoes > WhatsApp dos administradores**.
2. O administrador envia uma foto do QR Code para o numero oficial do almoxarifado.
3. A Edge Function `whatsapp-webhook` baixa a imagem, le o QR Code e responde ao administrador com:

```txt
Usuario
CPF
Tipo
Numero
Data
```

4. O administrador responde `CONFIRMAR`.
5. A Function marca a requisicao como `pronto_retirada` e envia o template `pedido_pronto_retirada` ao responsavel pelo pedido.

URL do webhook:

```txt
https://xzoiqjsttggtrjlrhcjm.supabase.co/functions/v1/whatsapp-webhook
```

Configure no Meta Business:

```txt
Callback URL = https://xzoiqjsttggtrjlrhcjm.supabase.co/functions/v1/whatsapp-webhook
Verify token = valor salvo em WHATSAPP_WEBHOOK_VERIFY_TOKEN
Webhook fields = messages
```

Configuracoes usadas:

```txt
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<token de verificacao do webhook>
WHATSAPP_ADMIN_NUMBERS=<numeros autorizados separados por virgula>
```
