const MAX_BODY_BYTES = 64 * 1024;
const CLIENT_HEADER = "store-marketing-master";

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

export async function onRequest(context) {
  const { request, env } = context;
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Client",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ error: { message: "仅支持 POST 请求" } }, 405, cors);
  if (request.headers.get("x-app-client") !== CLIENT_HEADER) {
    return json({ error: { message: "无效的客户端标识" } }, 403, cors);
  }

  const apiKey = (env.AI_API_KEY || "").trim();
  if (!apiKey) return json({ error: { message: "AI 服务尚未配置" } }, 503, cors);

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: { message: "请求内容过大" } }, 413, cors);

  let payload;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return json({ error: { message: "请求内容过大" } }, 413, cors);
    }
    payload = JSON.parse(raw);
  } catch {
    return json({ error: { message: "请求不是有效 JSON" } }, 400, cors);
  }

  if (!payload || !Array.isArray(payload.messages) || payload.messages.length < 1 || payload.messages.length > 8) {
    return json({ error: { message: "消息格式不正确" } }, 400, cors);
  }
  const messages = payload.messages.map((item) => ({
    role: typeof item?.role === "string" ? item.role.slice(0, 20) : "user",
    content: typeof item?.content === "string" ? item.content.slice(0, 12000) : "",
  }));
  if (messages.some((item) => !item.content)) {
    return json({ error: { message: "消息内容不能为空" } }, 400, cors);
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
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ...cors,
      },
    });
  } catch (error) {
    const message = error?.name === "AbortError" ? "AI 服务响应超时" : "AI 服务暂时无法连接";
    return json({ error: { message } }, 502, cors);
  } finally {
    clearTimeout(timeout);
  }
}
