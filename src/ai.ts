import { requestUrl } from "obsidian";
import type { Settings } from "./types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function endpointOf(baseUrl: string): string {
  const base = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!base) {
    throw new Error("Please fill in the API base URL first (e.g. https://api.deepseek.com/v1)");
  }
  return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`;
}

function describeFailure(status: number, body: string): string {
  const brief = body.replace(/\s+/g, " ").slice(0, 200);
  if (status === 401 || status === 403) {
    return `AI 接口鉴权失败（HTTP ${status}），请检查 API Key 是否有效。${brief}`;
  }
  if (status === 404) {
    return `AI 接口地址不存在（HTTP 404），请检查 API 地址，通常需要以 /v1 结尾。${brief}`;
  }
  if (status === 429) {
    return `AI 接口限流或额度不足（HTTP 429）。${brief}`;
  }
  return `AI 接口返回 HTTP ${status}：${brief}`;
}

function extractContent(raw: string): string {
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`AI 接口返回的不是合法 JSON：${raw.slice(0, 300)}`);
  }
  const choice = json?.choices?.[0];
  const content = choice?.message?.content ?? choice?.text;
  if (typeof content !== "string" || !content.trim()) {
    const msg = json?.error?.message || json?.message || raw.slice(0, 300);
    throw new Error(`AI 未返回有效内容：${msg}`);
  }
  return content.trim();
}

export async function callAI(
  settings: Settings,
  messages: ChatMessage[],
  maxTokensOverride?: number,
): Promise<string> {
  const cfg = settings.ai;
  if (!cfg.model) {
    throw new Error("请在插件设置中填写模型名称");
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) {
    headers.Authorization = `Bearer ${cfg.apiKey}`;
  }

  // requestUrl 由 Obsidian 主进程发起，不受渲染进程跨域限制
  const response = await requestUrl({
    url: endpointOf(cfg.apiBaseUrl),
    method: "POST",
    headers,
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: Number.isFinite(cfg.temperature) ? cfg.temperature : 0.3,
      max_tokens: Math.max(16, Math.floor(maxTokensOverride ?? cfg.maxTokens ?? 2000)),
      stream: false,
    }),
    throw: false,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(describeFailure(response.status, response.text ?? ""));
  }
  return extractContent(response.text ?? "");
}
