const MAX_BODY_BYTES = 64 * 1024;
const CLIENT_HEADER = "store-marketing-master";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-App-Client",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FRIENDLY_DEFAULT_ERROR = "AI 服务开小差了，请稍后再试";
const FRIENDLY_BUSY_ERROR = "当前访问有点拥挤，稍等 30 秒再试";
const FRIENDLY_TIMEOUT_ERROR = "AI 响应有点慢，请稍后再试";

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
}

function errorJson(message = FRIENDLY_DEFAULT_ERROR) {
  return json({ ok: false, error: message }, 500, CORS_HEADERS);
}

function mapUpstreamStatusError(status) {
  if (status === 429 || status === 503) return FRIENDLY_BUSY_ERROR;
  if (status === 408 || status === 504) return FRIENDLY_TIMEOUT_ERROR;
  return FRIENDLY_DEFAULT_ERROR;
}

export async function onRequest(context) {
  try {
    const { request, env = {} } = context || {};
    if (!request) return errorJson();

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return errorJson("当前仅支持通过客户端发起请求");
    }
    if (request.headers.get("x-app-client") !== CLIENT_HEADER) {
      return errorJson("请使用正式客户端发起请求");
    }

    const apiKey = (env.AI_API_KEY || "").trim();
    if (!apiKey) return errorJson("AI 服务暂时休息中，请稍后再试");

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return errorJson("输入内容太长了，请精简后再试");
    }

    let payload;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
        return errorJson("输入内容太长了，请精简后再试");
      }
      payload = JSON.parse(raw);
    } catch {
      return errorJson("提交的内容格式不太对，请重试");
    }

    if (!payload || !Array.isArray(payload.messages) || payload.messages.length < 1 || payload.messages.length > 8) {
      return errorJson("请先填写门店信息后再试");
    }
    const messages = payload.messages.map((item) => ({
      role: typeof item?.role === "string" ? item.role.slice(0, 20) : "user",
      content: typeof item?.content === "string" ? item.content.slice(0, 12000) : "",
    }));
    if (messages.some((item) => !item.content)) {
      return errorJson("请先填写需要生成的内容");
    }

    const upstreamBase = (env.AI_BASE_URL || "https://apihub.agnes-ai.com").replace(/\/+$/, "");
    const model = (env.AI_MODEL || "agnes-2.5-flash").trim();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const upstream = await fetch(`${upstreamBase}/v1/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: Math.min(Number(payload.max_tokens) || 2048, 2048),
          temperature: Math.min(Math.max(Number(payload.temperature) || 0.85, 0), 1),
        }),
      });
      const body = await upstream.text();
      if (!upstream.ok) {
        return errorJson(mapUpstreamStatusError(upstream.status));
      }

      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        return errorJson();
      }
      if (!parsed || typeof parsed !== "object") {
        return errorJson();
      }
      if (parsed.error && !Array.isArray(parsed.choices)) {
        const errCode = Number(parsed.error?.code || parsed.error?.status || 0);
        const errType = String(parsed.error?.type || "").toLowerCase();
        if (errCode === 429 || errType.includes("rate_limit") || errType.includes("busy")) {
          return errorJson(FRIENDLY_BUSY_ERROR);
        }
        return errorJson();
      }

      return new Response(body, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          ...CORS_HEADERS,
        },
      });
    } catch (error) {
      const message = error?.name === "AbortError" ? FRIENDLY_TIMEOUT_ERROR : FRIENDLY_DEFAULT_ERROR;
      return errorJson(message);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return errorJson();
  }
}
