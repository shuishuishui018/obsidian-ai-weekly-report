import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type AiWeeklyReportPlugin from "./main";
import { testConnection } from "./report";
import {
  DEFAULT_SETTINGS,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_USER_TEMPLATE,
  type ExistingReportMode,
  type RangeMode,
} from "./types";
import { DONATION_QR_DATA_URL } from "./qr";

const MODES: Record<RangeMode, string> = {
  thisWeek: "This week (Mon-Sun)",
  lastWeek: "Last week",
  lastNDays: "Last N days",
  custom: "Custom range",
};

const EXISTING_MODES: Record<ExistingReportMode, string> = {
  skip: "Skip - do nothing",
  overwrite: "Overwrite the existing report",
  suffix: "Create a new note with a numeric suffix",
};

export class AiWeeklyReportSettingTab extends PluginSettingTab {
  private plugin: AiWeeklyReportPlugin;

  constructor(app: App, plugin: AiWeeklyReportPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("ai-weekly-report-settings");

    containerEl.createEl("h2", { text: "AI Weekly Report" });
    containerEl.createEl("p", {
      text: "Collect notes from a period and let an OpenAI-compatible model turn them into a structured weekly report.",
      cls: "setting-item-description",
    });

    // ---- AI endpoint ----
    containerEl.createEl("h3", { text: "AI endpoint" });

    new Setting(containerEl)
      .setName("API base URL")
      .setDesc("e.g. https://api.deepseek.com/v1, https://api.openai.com/v1, http://127.0.0.1:11434/v1")
      .addText((text) =>
        text
          .setPlaceholder("https://api.deepseek.com/v1")
          .setValue(this.plugin.settings.ai.apiBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.ai.apiBaseUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("API key")
      .setDesc("Stored locally in this vault's plugin data. Leave empty for local models.")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.ai.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.ai.apiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Model")
      .setDesc("e.g. deepseek-chat, gpt-4o-mini, qwen2.5:14b")
      .addText((text) =>
        text
          .setPlaceholder("deepseek-chat")
          .setValue(this.plugin.settings.ai.model)
          .onChange(async (value) => {
            this.plugin.settings.ai.model = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Temperature")
      .setDesc("0 is focused, 1 is creative. 0.2 - 0.4 works well for reports.")
      .addSlider((slider) =>
        slider
          .setLimits(0, 1, 0.1)
          .setValue(this.plugin.settings.ai.temperature)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.ai.temperature = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Max output tokens")
      .setDesc("Upper bound of a single response. 2000 is roughly 1500 Chinese characters.")
      .addText((text) =>
        text
          .setPlaceholder("2000")
          .setValue(String(this.plugin.settings.ai.maxTokens))
          .onChange(async (value) => {
            const parsed = Number(value);
            if (Number.isFinite(parsed) && parsed >= 256) {
              this.plugin.settings.ai.maxTokens = Math.floor(parsed);
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Test connection")
      .setDesc("Send a tiny request to verify the endpoint, key and model.")
      .addButton((button) =>
        button.setButtonText("Test").onClick(async () => {
          button.setDisabled(true);
          try {
            const reply = await testConnection(this.plugin.settings);
            new Notice(`连接成功，模型返回：${reply}`, 6000);
          } catch (error) {
            new Notice(error instanceof Error ? error.message : String(error), 10000);
          } finally {
            button.setDisabled(false);
          }
        }),
      );

    // ---- Source scope ----
    containerEl.createEl("h3", { text: "Source notes" });

    new Setting(containerEl)
      .setName("Source folders")
      .setDesc(
        "One folder per line, relative to the vault root, e.g. 工作日志 or journal/2026. Empty means the whole vault.",
      )
      .addTextArea((area) => {
        area.inputEl.rows = 3;
        area
          .setPlaceholder("工作日志")
          .setValue(this.plugin.settings.source.folders.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.source.folders = value
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Excluded keywords")
      .setDesc(
        "One per line. Notes whose path contains any keyword are never read and never sent to the model. Keep credential-related words here.",
      )
      .addTextArea((area) => {
        area.inputEl.rows = 3;
        area
          .setPlaceholder("账号密码\n密码\n密钥")
          .setValue(this.plugin.settings.source.excludeKeywords.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.source.excludeKeywords = value
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Max characters per note")
      .setDesc("Longer notes are truncated before being sent.")
      .addText((text) =>
        text
          .setPlaceholder("6000")
          .setValue(String(this.plugin.settings.source.maxDocChars))
          .onChange(async (value) => {
            const parsed = Number(value);
            if (Number.isFinite(parsed) && parsed >= 500) {
              this.plugin.settings.source.maxDocChars = Math.floor(parsed);
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Max total characters")
      .setDesc("Older notes are dropped once this limit is reached.")
      .addText((text) =>
        text
          .setPlaceholder("60000")
          .setValue(String(this.plugin.settings.source.maxTotalChars))
          .onChange(async (value) => {
            const parsed = Number(value);
            if (Number.isFinite(parsed) && parsed >= 2000) {
              this.plugin.settings.source.maxTotalChars = Math.floor(parsed);
              await this.plugin.saveSettings();
            }
          }),
      );

    // ---- Date range ----
    containerEl.createEl("h3", { text: "Date range" });

    new Setting(containerEl)
      .setName("Period")
      .setDesc("Notes are filtered by their last modified time.")
      .addDropdown((dropdown) => {
        for (const [value, label] of Object.entries(MODES)) {
          dropdown.addOption(value, label);
        }
        dropdown.setValue(this.plugin.settings.range.mode).onChange(async (value) => {
          this.plugin.settings.range.mode = value as RangeMode;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (this.plugin.settings.range.mode === "lastNDays") {
      new Setting(containerEl)
        .setName("Days")
        .setDesc("How many days back to look, including today.")
        .addText((text) =>
          text
            .setPlaceholder("7")
            .setValue(String(this.plugin.settings.range.lastNDays))
            .onChange(async (value) => {
              const parsed = Number(value);
              if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 365) {
                this.plugin.settings.range.lastNDays = Math.floor(parsed);
                await this.plugin.saveSettings();
              }
            }),
        );
    }

    if (this.plugin.settings.range.mode === "custom") {
      new Setting(containerEl)
        .setName("Start date")
        .setDesc("Format: YYYY-MM-DD")
        .addText((text) =>
          text
            .setPlaceholder("2026-11-16")
            .setValue(this.plugin.settings.range.customStart)
            .onChange(async (value) => {
              this.plugin.settings.range.customStart = value.trim();
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("End date")
        .setDesc("Format: YYYY-MM-DD")
        .addText((text) =>
          text
            .setPlaceholder("2026-11-22")
            .setValue(this.plugin.settings.range.customEnd)
            .onChange(async (value) => {
              this.plugin.settings.range.customEnd = value.trim();
              await this.plugin.saveSettings();
            }),
        );
    }

    // ---- Output ----
    containerEl.createEl("h3", { text: "Output" });

    new Setting(containerEl)
      .setName("Target folder")
      .setDesc("Created automatically if missing, e.g. AI周报")
      .addText((text) =>
        text
          .setPlaceholder("AI周报")
          .setValue(this.plugin.settings.output.folder)
          .onChange(async (value) => {
            this.plugin.settings.output.folder = value.trim() || "AI周报";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Title template")
      .setDesc(
        "Placeholders: {{YYYY}} (ISO year), {{WW}} (two-digit ISO week), {{W}} (ISO week), " +
          "{{start}} / {{end}} (2026-11-16 / 2026-11-22), " +
          "{{startCn}} (2026年11月16日), {{endCn}} (22日, 11月1日 or 2026年1月4日, simplified against the start date)",
      )
      .addText((text) =>
        text
          .setPlaceholder("工作周报 {{YYYY}}-W{{WW}}（{{startCn}}-{{endCn}}）")
          .setValue(this.plugin.settings.output.titleTemplate)
          .onChange(async (value) => {
            this.plugin.settings.output.titleTemplate = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Open the report after generating")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.output.openAfterCreate).onChange(async (value) => {
          this.plugin.settings.output.openAfterCreate = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Existing report for the same week")
      .setDesc("Checked before the model is called. Skip sends no request and writes no file.")
      .addDropdown((dropdown) => {
        for (const [value, label] of Object.entries(EXISTING_MODES)) {
          dropdown.addOption(value, label);
        }
        dropdown.setValue(this.plugin.settings.output.existing).onChange(async (value) => {
          this.plugin.settings.output.existing = value as ExistingReportMode;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Append source information")
      .setDesc("Adds a footer with the note count, period and generation time.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.output.writeProvenance).onChange(async (value) => {
          this.plugin.settings.output.writeProvenance = value;
          await this.plugin.saveSettings();
        }),
      );

    // ---- Prompt ----
    containerEl.createEl("h3", { text: "Prompt" });
    containerEl.createEl("p", {
      text: "Placeholders: {{range}}, {{docCount}}, {{materials}}, {{tasks}}",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("System prompt")
      .setDesc("Rules the model must follow. Keep it strict to avoid invented facts.")
      .addTextArea((area) => {
        area.inputEl.rows = 10;
        area.inputEl.addClass("ai-weekly-report-prompt");
        area.setValue(this.plugin.settings.prompt.system).onChange(async (value) => {
          this.plugin.settings.prompt.system = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("User prompt template")
      .setDesc("Wraps the collected notes.")
      .addTextArea((area) => {
        area.inputEl.rows = 8;
        area.inputEl.addClass("ai-weekly-report-prompt");
        area.setValue(this.plugin.settings.prompt.template).onChange(async (value) => {
          this.plugin.settings.prompt.template = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Reset prompts")
      .setDesc("Restore the default Chinese weekly report prompt.")
      .addButton((button) =>
        button.setButtonText("Reset").onClick(async () => {
          this.plugin.settings.prompt.system = DEFAULT_SYSTEM_PROMPT;
          this.plugin.settings.prompt.template = DEFAULT_USER_TEMPLATE;
          await this.plugin.saveSettings();
          this.display();
          new Notice("已恢复默认提示词");
        }),
      );

    new Setting(containerEl)
      .setName("Reset all settings")
      .setDesc("Restore every option to its default value.")
      .addButton((button) =>
        button
          .setWarning()
          .setButtonText("Reset all")
          .onClick(async () => {
            this.plugin.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            await this.plugin.saveSettings();
            this.display();
            new Notice("已恢复默认设置");
          }),
      );

    containerEl.createEl("p", {
      text:
        "Privacy: the API key and collected note text stay on your machine. Note text is sent only to the AI endpoint you configure above; notes matching the excluded keywords are skipped before anything is read.",
      cls: "setting-item-description",
    });

    // ---- Support ----
    containerEl.createEl("h3", { text: "Support / 支持作者" });
    containerEl.createEl("p", {
      text:
        "This plugin is free to use. If it saves you time, you can buy me a coffee — scan the code below. 本插件免费使用，如果它帮你节省了时间，欢迎扫码请我喝杯咖啡。",
      cls: "setting-item-description",
    });
    const qr = containerEl.createEl("img", { cls: "donation-qr" });
    qr.src = DONATION_QR_DATA_URL;
    qr.alt = "Donation QR code / 打赏二维码";
  }
}
