const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestQrPayload = {
  kind?: string;
  version?: number;
  requestId?: string;
  requestCode?: string;
  materialType?: string;
  program?: string;
  requester?: string;
  requesterCpf?: string;
  requestDate?: string;
};

type AppSetting = {
  key: string;
  value: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function valueOrDash(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || "-";
}

function normalizeComparisonValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized && normalized !== "-" ? normalized : null;
}

function normalizePhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (!digits.startsWith("55") || digits.length < 12) {
    throw new Error("WhatsApp do usuário inválido.");
  }

  return digits;
}

function parseQrPayload(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("QR Code não informado.");
  }

  const parsed = JSON.parse(value) as RequestQrPayload;

  if (
    parsed.kind !== "almoxarifado_requisicao" ||
    parsed.version !== 1 ||
    !parsed.requestId
  ) {
    throw new Error("QR Code de requisição inválido.");
  }

  return parsed;
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase não configurado na Edge Function.");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : `Erro ${response.status} ao consultar Supabase.`;
    throw new Error(message);
  }

  return payload;
}

async function getWhatsAppSettings() {
  const envAccessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN")?.trim();
  const envPhoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")?.trim();
  const envGraphApiVersion = Deno.env.get("WHATSAPP_GRAPH_API_VERSION")?.trim();

  const rows = (await supabaseFetch(
    "app_settings?select=key,value&key=in.(WHATSAPP_ACCESS_TOKEN,WHATSAPP_PHONE_NUMBER_ID,WHATSAPP_GRAPH_API_VERSION)",
  )) as AppSetting[];

  const settings = new Map(rows.map((row) => [row.key, row.value]));
  const accessToken = settings.get("WHATSAPP_ACCESS_TOKEN")?.trim() || envAccessToken;
  const phoneNumberId = settings.get("WHATSAPP_PHONE_NUMBER_ID")?.trim() || envPhoneNumberId;
  const graphApiVersion =
    settings.get("WHATSAPP_GRAPH_API_VERSION")?.trim() || envGraphApiVersion || "v25.0";

  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp não configurado.");
  }

  return { accessToken, phoneNumberId, graphApiVersion };
}

async function sendReadyTemplate(input: {
  to: string;
  requestCode: string;
  materialType: string;
  requestDate: string;
}) {
  const config = await getWhatsAppSettings();
  const recipient = normalizePhoneNumber(input.to);

  const response = await fetch(
    `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "template",
        template: {
          name: "pedido_pronto_retirada",
          language: { code: "pt_BR" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: input.requestCode },
                { type: "text", text: input.materialType },
                { type: "text", text: input.requestDate },
              ],
            },
          ],
        },
      }),
    },
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error?.message || "Erro ao enviar WhatsApp.");
  }

  return payload?.messages?.[0]?.id as string | undefined;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  try {
    const body = await request.json().catch(() => null);
    const qrPayload = parseQrPayload(body?.qrPayload);

    const requests = (await supabaseFetch(
      `requisicoes?select=id,saida_codigo,categoria,data,solicitante,solicitante_cpf,status&id=eq.${encodeURIComponent(
        qrPayload.requestId,
      )}&limit=1`,
    )) as Array<{
      id: string;
      saida_codigo: string | null;
      categoria: string | null;
      data: string | null;
      solicitante: string | null;
      solicitante_cpf: string | null;
      status: string;
    }>;

    const requisicao = requests[0];
    if (!requisicao) throw new Error("Requisição não encontrada.");

    const currentRequestCode = requisicao.saida_codigo || requisicao.id;
    const qrRequestCode = normalizeComparisonValue(qrPayload.requestCode);
    if (qrRequestCode && qrRequestCode !== currentRequestCode) {
      throw new Error("QR Code não confere com a requisição encontrada.");
    }

    await supabaseFetch(`requisicoes?id=eq.${encodeURIComponent(requisicao.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "pronto_retirada",
        updated_at: new Date().toISOString(),
      }),
    });

    let user:
      | {
          nome: string | null;
          whatsapp: string | null;
        }
      | undefined;

    if (requisicao.solicitante_cpf) {
      const users = (await supabaseFetch(
        `usuarios?select=nome,whatsapp&cpf=eq.${encodeURIComponent(
          requisicao.solicitante_cpf,
        )}&limit=1`,
      )) as Array<{ nome: string | null; whatsapp: string | null }>;
      user = users[0];
    }

    if (!user && requisicao.solicitante) {
      const users = (await supabaseFetch(
        `usuarios?select=nome,whatsapp&nome=eq.${encodeURIComponent(requisicao.solicitante)}&limit=1`,
      )) as Array<{ nome: string | null; whatsapp: string | null }>;
      user = users[0];
    }

    let messageId: string | undefined;
    let notificationSkippedReason: string | undefined;

    if (user?.whatsapp?.trim()) {
      messageId = await sendReadyTemplate({
        to: user.whatsapp,
        requestCode: valueOrDash(currentRequestCode),
        materialType: valueOrDash(requisicao.categoria),
        requestDate: valueOrDash(requisicao.data),
      });
    } else {
      notificationSkippedReason = "Usuário sem WhatsApp cadastrado.";
    }

    return jsonResponse({
      ok: true,
      messageId,
      notificationSkippedReason,
      request: {
        id: requisicao.id,
        requestCode: valueOrDash(currentRequestCode),
        materialType: valueOrDash(requisicao.categoria),
        program: valueOrDash(qrPayload.program),
        requester: valueOrDash(user?.nome || requisicao.solicitante),
        requesterCpf: valueOrDash(requisicao.solicitante_cpf),
        requestDate: valueOrDash(requisicao.data),
        status: "pronto_retirada",
      },
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao confirmar pedido.",
      },
      400,
    );
  }
});
