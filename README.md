# AI Weekly Report

Turn scattered daily work logs into a structured weekly report — inside Obsidian, with one command.

The plugin collects the notes you touched during a period, sends them to an OpenAI-compatible model, and writes a new weekly report note into your vault.

> 中文说明见 [README.zh-CN.md](./README.zh-CN.md)

## Features

- **Automatic collection** — notes are picked by their last modified time, optionally limited to a set of folders.
- **Sensitive notes are skipped** — any note whose path contains an exclusion keyword (default: `账号密码`, `密码`, `密钥`, `token`, `secret`, `credentials`) is never read and never sent to the model.
- **Open tasks are carried over** — unchecked tasks such as `- [ ] Follow up @11-25` are collected into a task list so they land in *In progress* or *Next week* instead of disappearing.
- **Structured output** — *Done this week / In progress / Risks / Next week* by default; both the system prompt and the output structure are editable.
- **Any OpenAI-compatible endpoint** — DeepSeek, OpenAI, Qwen/DashScope, Moonshot, Zhipu, SiliconFlow, Ollama, LM Studio.
- **Configurable period** — this week, last week, last N days, or a custom range.
- **Connection test** — verify endpoint, key and model from the settings tab before the first run.

## Installation

### From the community directory

Search for **AI Weekly Report** in *Settings → Community plugins → Browse*, install and enable it.

### Manually

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](../../releases/latest).
2. Put them into `<vault>/.obsidian/plugins/ai-weekly-report/`.
3. Reload Obsidian and enable the plugin in *Settings → Community plugins*.

## Usage

1. Open *Settings → AI Weekly Report*.
2. Fill in the API base URL, key and model, then press **Test**.
3. Point **Source folders** at where your work logs live (e.g. `工作日志`), and review the **Excluded keywords** list.
4. Run the command **Generate weekly report**, or click the ribbon icon.

The report is written to the target folder (default `AI周报`) with a title such as `2026-W47 工作周报` and opened automatically.

## How the material is built

Every collected note becomes:

```
### 工作日志/2026年/11月/17日周会记录.md（更新于 2026-11-17）
<note body without YAML frontmatter>
```

Notes are capped per note and overall; once the total cap is hit, older notes are dropped.

## Settings reference

| Setting | Meaning |
| --- | --- |
| API base URL | `https://api.deepseek.com/v1`, `https://api.openai.com/v1`, `http://127.0.0.1:11434/v1` … |
| API key | Stored in this vault's plugin data (`data.json`). Empty for local models. |
| Source folders | One per line, relative to the vault root. Empty = whole vault. |
| Excluded keywords | Path substring match; matching notes are skipped entirely. |
| Period | This week / last week / last N days / custom range. |
| Target folder | Created automatically when missing. |
| Title template | `{{YYYY}}` (ISO year), `{{WW}}` (two-digit ISO week), `{{W}}` (ISO week), `{{start}}` / `{{end}}` (`2026-11-16` / `2026-11-22`), `{{startCn}}` (`2026年11月16日`), `{{endCn}}` (`22日`, `11月1日` or `2026年1月4日`, shortened against the start date). Default: `工作周报 {{YYYY}}-W{{WW}}（{{startCn}}-{{endCn}}）`. |
| Existing report (same week) | Skip (default): no model request and no file written. Overwrite: replace the note. Suffix: create a new note with a numeric suffix. |

## Privacy and network use

- This plugin makes network requests **only** to the AI endpoint you configure.
- The API key is stored unencrypted in `.obsidian/plugins/ai-weekly-report/data.json`, like most plugin settings. Do not sync that file to a public location.
- Note text is sent to that endpoint to generate the report. Notes matching the excluded keywords are filtered out before being read.
- No telemetry, no analytics, no third-party servers.

## Development

```bash
npm install
npm run dev     # esbuild watch
npm run build   # typecheck + production bundle (main.js)
```

## Support the author

If this plugin saves you time, you can buy me a coffee.

![Donation QR code](assets/donation-qr.png)

## License

MIT
