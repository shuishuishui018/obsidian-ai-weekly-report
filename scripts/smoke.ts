/**
 * Obsidian 侧冒烟测试：在临时「库」里造几篇笔记，跑通采集 → 提示词 → AI → 写文件。
 * 用法：node scripts/run-smoke.mjs
 */
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { generateWeeklyReport } from "../src/report";
import { mergeSettings } from "../src/types";
import { TFile, capturedRequests } from "./obsidian-stub";

const AI_PORT = Number(process.env.SMOKE_AI_PORT || 18778);
const DAY = 86400000;

const REPORT = `## 本周完成
- 完成季度材料归档核对。

## 进行中
- 跟进外部单位回函。

## 问题与风险
- 跨部门职责边界待明确。

## 下周计划
- 整理下周待办清单。`;

function startFakeAI(): Promise<{ close: () => void }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const auth = req.headers.authorization || "";
        if (!String(auth).startsWith("Bearer ")) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: "missing api key" } }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: REPORT } }] }));
      });
    });
    server.listen(AI_PORT, "127.0.0.1", () => resolve({ close: () => server.close() }));
  });
}

function mockApp(root: string, files: TFile[]) {
  const writes = new Map<string, string>();
  return {
    writes,
    app: {
      vault: {
        getMarkdownFiles: () => files,
        cachedRead: async (file: TFile) => readFile(join(root, file.path), "utf8"),
        getAbstractFileByPath: (path: string) => {
          if (writes.has(path)) return new TFile(path, Date.now());
          const existing = files.find((f) => f.path === path);
          return existing ?? null;
        },
        createFolder: async () => undefined,
        create: async (path: string, data: string) => {
          writes.set(path, data);
          return new TFile(path, Date.now());
        },
        modify: async (file: TFile, data: string) => {
          writes.set(file.path, data);
        },
      },
      workspace: { getLeaf: () => ({ openFile: async () => undefined }) },
    },
  };
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), "ai-weekly-vault-"));
  const now = Date.now();

  const samples: Array<{ path: string; mtime: number; content: string }> = [
    {
      path: "工作日志/2026年/11月/23日示例笔记.md",
      mtime: now - 1 * 3600_000,
      content: "---\ntitle: 示例笔记\n---\n\n1.完成季度材料归档核对。\n\n- [ ] 跟进外部单位回函@11-25\n",
    },
    {
      path: "工作日志/2026年/11月/16日会议记录.md",
      mtime: now - 1 * DAY,
      content: "1.整理本周会议纪要。\n",
    },
    {
      path: "账号密码.md",
      mtime: now - 1 * 3600_000,
      content: "super-secret-password-123",
    },
    {
      path: "其他/无关笔记.md",
      mtime: now - 1 * 3600_000,
      content: "这条不该出现在素材里",
    },
    {
      path: "工作日志/2025年/01月/01日日常.md",
      mtime: now - 300 * DAY,
      content: "太老了，不在时间范围内",
    },
  ];

  for (const sample of samples) {
    const full = join(root, sample.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, sample.content, "utf8");
  }

  const files = samples.map((s) => new TFile(s.path, s.mtime));
  const { app, writes } = mockApp(root, files);
  const fakeAI = await startFakeAI();

  try {
    const settings = mergeSettings({
      ai: {
        apiBaseUrl: `http://127.0.0.1:${AI_PORT}/v1`,
        apiKey: "smoke-key",
        model: "fake-model",
        temperature: 0.2,
        maxTokens: 800,
      },
      source: { folders: ["工作日志"], maxDocChars: 2000, maxTotalChars: 10000 },
      range: { mode: "lastNDays", lastNDays: 7 },
      output: {
        folder: "AI周报",
        titleTemplate: "{{YYYY}}-W{{WW}} 工作周报",
        openAfterCreate: false,
        writeProvenance: true,
      },
    });

    const result = await generateWeeklyReport(app as any, settings, (msg) => console.log("[progress]", msg));
    console.log("[result]", JSON.stringify({ path: result.path, docCount: result.docCount }));

    const requests = capturedRequests();
    console.log("[requests]", requests.length, "auth=", requests[0]?.headers.Authorization);
    const prompt = requests[0]?.body ?? "";

    const checks: Array<[string, boolean]> = [
      ["只收集到 2 篇在范围内的素材", result.docCount === 2],
      ["素材按路径限定过滤", !prompt.includes("无关笔记")],
      ["排除敏感词笔记", !prompt.includes("super-secret-password-123")],
      ["排除超期笔记", !prompt.includes("太老了")],
      ["未完成任务被提取", prompt.includes("跟进外部单位回函@11-25")],
      ["去掉了 YAML frontmatter", !prompt.includes("title: 示例笔记")],
      ["请求带 Authorization", String(requests[0]?.headers.Authorization).startsWith("Bearer ")],
      ["输出文件已写入", writes.has(`AI周报/2026-W48 工作周报.md`)],
      ["输出包含素材来源信息", String(writes.get("AI周报/2026-W48 工作周报.md")).includes("本报告由 AI 汇总 2 篇素材")],
    ];

    let failed = 0;
    for (const [name, ok] of checks) {
      console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
      if (!ok) failed += 1;
    }
    console.log("[output]\n" + (writes.get("AI周报/2026-W48 工作周报.md") ?? "<missing>"));
    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    fakeAI.close();
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("[smoke:failed]", error);
  process.exit(1);
});
