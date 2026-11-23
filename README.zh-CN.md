# AI 周报生成器（Obsidian 插件）

把零散的每日工作日志，一键汇总成结构化的周报笔记。

插件会读取你在某段时间内改动过的笔记，交给兼容 OpenAI 协议的大模型汇总，然后在库里直接生成一篇新的周报。

## 功能

- **自动收集素材**：按笔记最后修改时间筛选，可限定若干目录。
- **自动跳过敏感笔记**：路径命中排除关键词（默认 `账号密码`、`密码`、`密钥`、`token`、`secret`、`credentials`）的笔记不会被读取，也不会发送给模型。
- **带走未完成任务**：素材里的 `- [ ] 跟进外部单位回函@11-25` 会汇总成任务清单，进入「进行中」或「下周计划」，不会漏掉。
- **结构化输出**：默认「本周完成 / 进行中 / 问题与风险 / 下周计划」，系统提示词与输出结构都可以自己改。
- **兼容任意 OpenAI 协议接口**：DeepSeek、OpenAI、通义千问、Kimi、智谱、硅基流动、Ollama、LM Studio 均可。
- **灵活的时间区间**：本周、上周、最近 N 天、自定义起止日期。
- **连接测试**：设置页里点一下就能验证地址、Key、模型是否可用。

## 安装

### 从社区插件市场安装

在「设置 → 第三方插件 → 浏览」里搜索 **AI Weekly Report**，安装并启用。

### 手动安装

1. 从 [最新发布](../../releases/latest) 下载 `main.js`、`manifest.json`、`styles.css`。
2. 放进 `<库>/.obsidian/plugins/ai-weekly-report/`。
3. 重启 Obsidian，在「设置 → 第三方插件」中启用。

## 使用

1. 打开「设置 → AI Weekly Report」。
2. 填写 API 地址、Key、模型，点 **Test** 验证。
3. 把 **Source folders** 指向工作日志所在目录（例如 `工作日志`），并确认 **Excluded keywords** 是否覆盖了你的隐私笔记。
4. 执行命令 **Generate weekly report**，或点击左侧栏图标。

周报会写入目标目录（默认 `AI周报`），标题形如 `2026-W47 工作周报`，生成后自动打开。

## 素材是怎么组织的

每篇素材会被拼成：

```
### 工作日志/2026年/11月/17日周会记录.md（更新于 2026-11-17）
<去掉 YAML frontmatter 后的正文>
```

单篇有字数上限，全部素材也有总字数上限；超出总上限后，较早的笔记会被丢弃。

## 设置项对照（界面为英文）

| 界面项 | 含义 |
| --- | --- |
| API base URL | 接口地址，如 `https://api.deepseek.com/v1` |
| API key | 保存在本库插件数据 `data.json` 中，本地模型可留空 |
| Model | 模型名称，如 `deepseek-chat` |
| Temperature | 默认 0.3，周报建议 0.2 - 0.4 |
| Max output tokens | 单次返回上限，2000 约等于 1500 汉字 |
| Test connection | 发送一次极小请求验证配置 |
| Source folders | 素材目录，每行一个；留空表示全库 |
| Excluded keywords | 路径命中即跳过，建议保留账号密码类词汇 |
| Period | 本周 / 上一周 / 最近 N 天 / 自定义区间 |
| Target folder | 输出目录，不存在会自动创建 |
| Title template | 占位符：`{{YYYY}}`（ISO 年）、`{{WW}}`（两位周数）、`{{W}}`（周数）、`{{start}}` / `{{end}}`（`2026-11-16` / `2026-11-22`）、`{{startCn}}`（`2026年11月16日`）、`{{endCn}}`（相对开始日期化简为 `22日`、`11月1日` 或 `2026年1月4日`）。默认值：`工作周报 {{YYYY}}-W{{WW}}（{{startCn}}-{{endCn}}）` |
| Existing report for the same week | skip（默认）：不调用模型、不写文件；overwrite：直接覆盖；suffix：同名文件加序号另建一篇 |
| Append source information | 文末标注素材篇数、周期与生成时间 |

## 隐私与网络

- 插件只向你配置的 AI 接口发起网络请求，无遥测、无统计、无第三方服务器。
- API Key 以明文保存在 `.obsidian/plugins/ai-weekly-report/data.json`，与多数插件一致，请不要把该文件同步到公开位置。
- 素材正文会发送到该接口用于生成周报；命中排除关键词的笔记在读取前就被过滤。
- 默认提示词为中文，生成的周报也是中文。若要输出英文，把系统提示词改成英文即可。

## 开发

```bash
npm install
npm run dev     # esbuild 监听
npm run build   # 类型检查 + 生产构建（main.js）
```

## 支持作者

如果这个插件帮你节省了时间，欢迎扫码请我喝杯咖啡。

![打赏二维码](assets/donation-qr.png)

## 许可

MIT
