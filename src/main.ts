import { Notice, Plugin } from "obsidian";
import { generateWeeklyReport, testConnection } from "./report";
import { AiWeeklyReportSettingTab } from "./settings";
import { mergeSettings, type Settings } from "./types";

export default class AiWeeklyReportPlugin extends Plugin {
  settings: Settings = mergeSettings(null);
  private running = false;
  private notice: Notice | null = null;

  async onload() {
    await this.loadSettings();

    this.addRibbonIcon("file-text", "Generate AI weekly report", () => {
      void this.run();
    });

    this.addCommand({
      id: "generate-weekly-report",
      name: "Generate weekly report",
      callback: () => {
        void this.run();
      },
    });

    this.addCommand({
      id: "test-ai-connection",
      name: "Test AI connection",
      callback: () => {
        void this.runTest();
      },
    });

    this.addSettingTab(new AiWeeklyReportSettingTab(this.app, this));
  }

  onunload() {
    this.notice?.hide();
    this.notice = null;
  }

  async loadSettings() {
    this.settings = mergeSettings(await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private setStatus(text: string) {
    if (this.notice && this.notice.noticeEl) {
      this.notice.noticeEl.setText(text);
      return;
    }
    this.notice = new Notice(text, 0);
  }

  private clearStatus() {
    this.notice?.hide();
    this.notice = null;
  }

  async runTest() {
    this.setStatus("正在测试 AI 连接…");
    try {
      const reply = await testConnection(this.settings);
      this.clearStatus();
      new Notice(`连接成功，模型返回：${reply}`, 6000);
    } catch (error) {
      this.clearStatus();
      new Notice(error instanceof Error ? error.message : String(error), 10000);
    }
  }

  async run() {
    if (this.running) {
      new Notice("正在生成周报，请稍候…", 3000);
      return;
    }
    if (!this.settings.ai.apiBaseUrl || !this.settings.ai.model) {
      new Notice("请先在插件设置中填写 API 地址与模型名称", 6000);
      return;
    }

    this.running = true;
    try {
      const result = await generateWeeklyReport(this.app, this.settings, (text) => this.setStatus(text));
      this.clearStatus();
      new Notice(`已生成《${result.title}》（汇总 ${result.docCount} 篇素材）`, 8000);

      if (this.settings.output.openAfterCreate && result.file) {
        await this.app.workspace.getLeaf(false).openFile(result.file);
      }
    } catch (error) {
      this.clearStatus();
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`生成失败：${message}`, 12000);
      console.error("[ai-weekly-report]", error);
    } finally {
      this.running = false;
    }
  }
}
