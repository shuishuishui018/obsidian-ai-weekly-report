/**
 * Obsidian 侧的冒烟测试替身：只实现被测代码用到的 obsidian API。
 * 由 run-smoke.mjs 通过 esbuild alias 注入，替换真实的 obsidian 模块。
 */

export interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

const captured: CapturedRequest[] = [];

export function capturedRequests(): CapturedRequest[] {
  return captured;
}

export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

export class TFile {
  path: string;
  name: string;
  stat: { mtime: number; ctime: number; size: number };
  constructor(path: string, mtime: number, size = 0) {
    this.path = path;
    this.name = path.split("/").pop() ?? path;
    this.stat = { mtime, ctime: mtime, size };
  }
}

export class Notice {
  constructor(public message: string, public timeout?: number) {}
  hide() {}
}

export async function requestUrl(options: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  throw?: boolean;
}): Promise<{ status: number; text: string; json: unknown }> {
  captured.push({ url: options.url, headers: options.headers, body: options.body ?? "" });
  const response = await fetch(options.url, {
    method: options.method,
    headers: options.headers,
    body: options.body,
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!response.ok && options.throw !== false) {
    throw new Error(`Request failed, status ${response.status}`);
  }
  return { status: response.status, text, json };
}
