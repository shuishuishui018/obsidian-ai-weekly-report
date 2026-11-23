import { DEFAULT_TITLE_TEMPLATE } from "./week";

export type RangeMode = "thisWeek" | "lastWeek" | "lastNDays" | "custom";

export interface AISettings {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface SourceSettings {
  folders: string[];
  excludeKeywords: string[];
  maxDocChars: number;
  maxTotalChars: number;
}

export interface RangeSettings {
  mode: RangeMode;
  lastNDays: number;
  customStart: string;
  customEnd: string;
}

export type ExistingReportMode = "skip" | "overwrite" | "suffix";

export interface OutputSettings {
  folder: string;
  titleTemplate: string;
  openAfterCreate: boolean;
  writeProvenance: boolean;
  existing: ExistingReportMode;
}

export interface PromptSettings {
  system: string;
  template: string;
}

export interface Settings {
  ai: AISettings;
  source: SourceSettings;
  range: RangeSettings;
  output: OutputSettings;
  prompt: PromptSettings;
}

export const DEFAULT_SYSTEM_PROMPT = `你是一名严谨的中文公文写作助手，负责把零散的工作日志整理成一份结构清晰的工作周报。

要求：
1. 只使用素材中出现的事实，不得编造人名、单位、数字、时间。
2. 同类事项合并成一条，不要按天罗列。
3. 每条以动词开头，一句话说清"做了什么 + 结果/状态"，控制在 40 字以内。
4. 素材中形如 "- [ ] 待办 @11-25" 的未完成任务归入「进行中」或「下周计划」。
5. 素材中提到的障碍、待确认事项、缺少的材料归入「问题与风险」。
6. 不要输出代码块围栏，不要输出"以下是"之类的开场白，直接输出 Markdown 正文。
7. 某一节没有内容时写 "- 无"，不要删除该节标题。

输出结构（严格按此顺序与标题）：
## 本周完成
## 进行中
## 问题与风险
## 下周计划`;

export const DEFAULT_USER_TEMPLATE = `周报周期：{{range}}
素材篇数：{{docCount}}

<素材>
{{materials}}
</素材>

请按系统要求生成周报正文（Markdown）。`;

export const DEFAULT_SETTINGS: Settings = {
  ai: {
    apiBaseUrl: "https://api.deepseek.com/v1",
    apiKey: "",
    model: "deepseek-chat",
    temperature: 0.3,
    maxTokens: 2000,
  },
  source: {
    folders: [],
    excludeKeywords: ["账号密码", "密码", "密钥", "token", "secret", "credentials"],
    maxDocChars: 6000,
    maxTotalChars: 60000,
  },
  range: {
    mode: "thisWeek",
    lastNDays: 7,
    customStart: "",
    customEnd: "",
  },
  output: {
    folder: "AI周报",
    titleTemplate: DEFAULT_TITLE_TEMPLATE,
    openAfterCreate: true,
    writeProvenance: true,
    existing: "skip",
  },
  prompt: {
    system: DEFAULT_SYSTEM_PROMPT,
    template: DEFAULT_USER_TEMPLATE,
  },
};

/** Merge stored settings over defaults so older configs never break the plugin. */
export function mergeSettings(saved: unknown): Settings {
  const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Settings;
  if (!saved || typeof saved !== "object") {
    return base;
  }
  const s = saved as Record<string, any>;
  for (const section of ["ai", "source", "range", "output", "prompt"] as const) {
    if (s[section] && typeof s[section] === "object") {
      Object.assign(base[section] as unknown as Record<string, unknown>, s[section]);
    }
  }
  return base;
}
