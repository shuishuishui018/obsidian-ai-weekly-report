import { App, normalizePath, TFile } from "obsidian";
import { resolveRange, formatTitle, endOfDay, toSiyuanDate, sanitizeFileName } from "./week";
import type { ChatMessage } from "./ai";
import { callAI } from "./ai";
import type { Settings } from "./types";

export interface DocItem {
  path: string;
  mtime: number;
  markdown: string;
}

function stripFrontmatter(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---")) {
    return normalized;
  }
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) {
    return normalized;
  }
  return normalized.slice(end + 4).replace(/^\n+/, "");
}

function normalizeFolder(folder: string): string {
  return folder.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
}

function inFolder(filePath: string, folder: string): boolean {
  const base = normalizeFolder(folder);
  if (!base) {
    return true;
  }
  const target = filePath.toLowerCase();
  return target === base || target.startsWith(`${base}/`);
}

function hitsExcluded(filePath: string, keywords: string[]): boolean {
  const target = filePath.toLowerCase();
  return keywords.some((k) => k.trim() && target.includes(k.trim().toLowerCase()));
}

export function extractOpenTasks(docs: DocItem[]): string[] {
  const tasks: string[] = [];
  const seen = new Set<string>();
  for (const doc of docs) {
    const re = /^\s*[-*]\s*\[[ ]\]\s*(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(doc.markdown)) !== null) {
      const text = m[1].replace(/\s+/g, " ").trim();
      if (text && !seen.has(text)) {
        seen.add(text);
        tasks.push(text);
      }
    }
  }
  return tasks.slice(0, 50);
}

export interface CollectResult {
  docs: DocItem[];
  skippedSensitive: number;
  outOfScope: number;
  truncatedDocs: number;
}

export async function collectDocs(app: App, settings: Settings, log: (msg: string) => void): Promise<CollectResult> {
  const range = resolveRange(
    settings.range.mode,
    settings.range.lastNDays,
    settings.range.customStart,
    settings.range.customEnd,
  );
  const from = range.start.getTime();
  const to = endOfDay(range.end).getTime();
  const outFolder = normalizeFolder(settings.output.folder);
  const maxDocChars = Math.max(500, settings.source.maxDocChars || 6000);
  const maxTotalChars = Math.max(2000, settings.source.maxTotalChars || 60000);

  const files = app.vault
    .getMarkdownFiles()
    .filter((file: TFile) => {
      const mtime = file.stat.mtime;
      return mtime >= from && mtime <= to;
    })
    .sort((a, b) => a.stat.mtime - b.stat.mtime);

  const result: CollectResult = { docs: [], skippedSensitive: 0, outOfScope: 0, truncatedDocs: 0 };
  let totalChars = 0;

  for (const file of files) {
    if (outFolder && inFolder(file.path, outFolder)) {
      result.outOfScope += 1;
      continue;
    }
    if (hitsExcluded(file.path, settings.source.excludeKeywords)) {
      result.skippedSensitive += 1;
      continue;
    }
    if (settings.source.folders.length > 0) {
      const matched = settings.source.folders.some((folder) => inFolder(file.path, folder));
      if (!matched) {
        result.outOfScope += 1;
        continue;
      }
    }

    let raw: string;
    try {
      raw = await app.vault.cachedRead(file);
    } catch {
      continue;
    }
    let markdown = stripFrontmatter(raw).trim();
    if (!markdown) {
      continue;
    }
    if (markdown.length > maxDocChars) {
      markdown = `${markdown.slice(0, maxDocChars)}\n…（本篇已截断）`;
      result.truncatedDocs += 1;
    }
    if (totalChars + markdown.length > maxTotalChars) {
      log(`已达到素材总字数上限，剩余 ${files.length - result.docs.length} 篇不再纳入`);
      break;
    }
    result.docs.push({ path: file.path, mtime: file.stat.mtime, markdown });
    totalChars += markdown.length;
  }

  return result;
}

export function buildMaterials(docs: DocItem[], tasks: string[]): string {
  const parts = docs.map((doc) => {
    const when = new Date(doc.mtime);
    const stamp = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(
      when.getDate(),
    ).padStart(2, "0")}`;
    return `### ${doc.path}（更新于 ${stamp}）\n${doc.markdown}`;
  });
  if (tasks.length > 0) {
    parts.push(`### 未完成任务清单（checkbox）\n${tasks.map((t) => `- [ ] ${t}`).join("\n")}`);
  }
  return parts.join("\n\n");
}

export function buildMessages(
  settings: Settings,
  rangeLabel: string,
  docs: DocItem[],
  tasks: string[],
): ChatMessage[] {
  const materials = buildMaterials(docs, tasks);
  const user = settings.prompt.template
    .replace(/\{\{range\}\}/g, rangeLabel)
    .replace(/\{\{docCount\}\}/g, String(docs.length))
    .replace(/\{\{materials\}\}/g, materials)
    .replace(/\{\{tasks\}\}/g, tasks.length ? tasks.map((t) => `- [ ] ${t}`).join("\n") : "- 无");
  return [
    { role: "system", content: settings.prompt.system },
    { role: "user", content: user },
  ];
}

export function cleanModelOutput(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").trim();
  const fenced = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i.exec(text);
  if (fenced) {
    text = fenced[1].trim();
  }
  text = text.replace(/^```(?:markdown|md)?\s*\n/i, "").replace(/\n```\s*$/i, "");
  return text.trim();
}

export interface GenerateResult {
  path: string;
  title: string;
  docCount: number;
  file: TFile | null;
  /** true 表示目标文件已存在且策略为 skip：没有请求 AI，也没有写入任何文件 */
  skipped: boolean;
}

export async function generateWeeklyReport(
  app: App,
  settings: Settings,
  log: (msg: string) => void,
): Promise<GenerateResult> {
  const range = resolveRange(
    settings.range.mode,
    settings.range.lastNDays,
    settings.range.customStart,
    settings.range.customEnd,
  );
  const title = formatTitle(settings.output.titleTemplate, range) || "工作周报";
  const folder = normalizePath(settings.output.folder.trim() || "AI周报");
  const basePath = normalizePath(`${folder}/${sanitizeFileName(title)}.md`);

  // 去重判定前移：在收集素材、调用 AI 之前就决定是否跳过，skip 时零请求、零写入
  let targetPath = basePath;
  let existingFile: TFile | null = null;
  const conflict = app.vault.getAbstractFileByPath(basePath);
  if (conflict) {
    if (settings.output.existing === "skip") {
      log(`${basePath} 已存在，按设置跳过`);
      return { path: basePath, title, docCount: 0, file: null, skipped: true };
    }
    if (settings.output.existing === "overwrite") {
      existingFile = conflict as TFile;
    } else {
      let index = 2;
      while (app.vault.getAbstractFileByPath(normalizePath(`${folder}/${sanitizeFileName(title)} ${index}.md`))) {
        index += 1;
      }
      targetPath = normalizePath(`${folder}/${sanitizeFileName(title)} ${index}.md`);
    }
  }

  log(`正在收集 ${range.label} 的素材…`);
  const collected = await collectDocs(app, settings, log);
  if (collected.docs.length === 0) {
    throw new Error(
      `在 ${range.label} 内没有找到可用素材。请检查「素材范围」中的目录设置，或调整时间区间。`,
    );
  }

  const tasks = extractOpenTasks(collected.docs);
  log(`已收集 ${collected.docs.length} 篇素材，正在调用 AI…`);
  const raw = await callAI(settings, buildMessages(settings, range.label, collected.docs, tasks));
  const body = cleanModelOutput(raw);
  if (!body) {
    throw new Error("AI 返回内容为空，请稍后重试或更换模型。");
  }

  let markdown = body;
  if (settings.output.writeProvenance) {
    const now = new Date();
    const stamp = `${toSiyuanDate(now)} ${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes(),
    ).padStart(2, "0")}`;
    markdown += `\n\n---\n\n> 本报告由 AI 汇总 ${collected.docs.length} 篇素材生成于 ${stamp}，周期 ${range.label}。\n`;
  }

  if (!app.vault.getAbstractFileByPath(folder)) {
    try {
      await app.vault.createFolder(folder);
    } catch {
      // 目录可能已被并发创建
    }
  }

  if (existingFile) {
    await app.vault.modify(existingFile, markdown);
    return { path: targetPath, title, docCount: collected.docs.length, file: existingFile, skipped: false };
  }

  const file = await app.vault.create(targetPath, markdown);
  return { path: targetPath, title, docCount: collected.docs.length, file, skipped: false };
}

export async function testConnection(settings: Settings): Promise<string> {
  const reply = await callAI(
    settings,
    [
      { role: "system", content: "You are a connectivity test. Reply with exactly: OK" },
      { role: "user", content: "ping" },
    ],
    16,
  );
  return reply.slice(0, 200);
}
