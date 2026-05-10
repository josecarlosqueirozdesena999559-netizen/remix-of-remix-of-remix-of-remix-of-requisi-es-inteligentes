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
