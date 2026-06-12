const { Notice, Plugin, PluginSettingTab, Setting, normalizePath, TFile } = require("obsidian");
const http = require("http");

const BUSINESS_SCOPE_TAGS = ["学习方案", "Prompt", "新知识", "案例", "工具方法", "可复用资产", "待整理"];

const DEFAULT_SETTINGS = {
  apiBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode",
  apiKey: "",
  model: "qwen-flash",
  temperature: 0.2,
  stagingFolder: "00_收件箱",
  websiteFolder: "01_网站",
  articleFolder: "02_文章",
  gitFolder: "03_Git",
  knowledgeTopicFolder: "20_知识专题",
  reusableAssetFolder: "30_可复用资产",
  screenshotFolder: "90_系统资料/附件/网页截图",
  wechatAssetFolder: "90_系统资料/附件/公众号",
  githubAssetFolder: "90_系统资料/附件/Git",
  serverHost: "127.0.0.1",
  serverPort: 27124,
  tagPool: [
    "AI",
    "产品",
    "设计",
    "前端",
    "后端",
    "效率工具",
    "工程管理",
    "行业资讯",
    "出海",
    "运营",
    "数据",
    "安全",
    ...BUSINESS_SCOPE_TAGS
  ]
};

module.exports = class BookmarkAIAssistantPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    await this.ensureFirstRunGuides();
    await this.startCaptureServer();
    this.floatingTocCollapsed = false;
    this.registerFloatingToc();

    const analyzeCurrentRibbon = this.addRibbonIcon("sparkles", "分析当前收藏并归档", async () => {
      await this.analyzeCurrentFile();
    });
    analyzeCurrentRibbon.addClass("bookmark-ai-assistant-ribbon");

    const analyzeBatchRibbon = this.addRibbonIcon("folder-sync", "批量分析收件箱收藏", async () => {
      await this.analyzeStagingFolder();
    });
    analyzeBatchRibbon.addClass("bookmark-ai-assistant-ribbon");

    this.addCommand({
      id: "analyze-current-bookmark",
      name: "分析当前收藏并归档",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const canRun = file instanceof TFile && file.extension === "md";
        if (!checking && canRun) {
          this.analyzeCurrentFile();
        }
        return canRun;
      }
    });

    this.addCommand({
      id: "analyze-staging-bookmarks",
      name: "批量分析收件箱收藏",
      callback: async () => {
        await this.analyzeStagingFolder();
      }
    });

    this.addSettingTab(new BookmarkAIAssistantSettingTab(this.app, this));
  }

  async onunload() {
    this.removeFloatingToc();
    await this.stopCaptureServer();
  }

  async loadSettings() {
    const savedData = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, savedData);
    let migrated = false;
    if (this.settings.stagingFolder === "00_暂存") {
      this.settings.stagingFolder = DEFAULT_SETTINGS.stagingFolder;
      migrated = true;
    }
    if (this.settings.screenshotFolder === "99_附件/网页截图") {
      this.settings.screenshotFolder = DEFAULT_SETTINGS.screenshotFolder;
      migrated = true;
    }
    if (!savedData?.knowledgeTopicFolder) {
      this.settings.knowledgeTopicFolder = DEFAULT_SETTINGS.knowledgeTopicFolder;
      migrated = true;
    }
    if (!savedData?.reusableAssetFolder) {
      this.settings.reusableAssetFolder = DEFAULT_SETTINGS.reusableAssetFolder;
      migrated = true;
    }
    if (!Array.isArray(this.settings.tagPool)) {
      this.settings.tagPool = [...DEFAULT_SETTINGS.tagPool];
      migrated = true;
    }
    for (const tag of BUSINESS_SCOPE_TAGS) {
      if (!this.settings.tagPool.includes(tag)) {
        this.settings.tagPool.push(tag);
        migrated = true;
      }
    }
    if (migrated) {
      await this.saveSettings();
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getDirectoryPresets() {
    return {
      default: {
        stagingFolder: DEFAULT_SETTINGS.stagingFolder,
        websiteFolder: DEFAULT_SETTINGS.websiteFolder,
        articleFolder: DEFAULT_SETTINGS.articleFolder,
        gitFolder: DEFAULT_SETTINGS.gitFolder,
        knowledgeTopicFolder: DEFAULT_SETTINGS.knowledgeTopicFolder,
        reusableAssetFolder: DEFAULT_SETTINGS.reusableAssetFolder,
        screenshotFolder: DEFAULT_SETTINGS.screenshotFolder,
        wechatAssetFolder: DEFAULT_SETTINGS.wechatAssetFolder,
        githubAssetFolder: DEFAULT_SETTINGS.githubAssetFolder
      },
      simple: {
        stagingFolder: "Inbox",
        websiteFolder: "Inbox",
        articleFolder: "Inbox",
        gitFolder: "Inbox",
        knowledgeTopicFolder: "Knowledge Topics",
        reusableAssetFolder: "Reusable Assets",
        screenshotFolder: "Attachments/Aegean/screenshots",
        wechatAssetFolder: "Attachments/Aegean/wechat",
        githubAssetFolder: "Attachments/Aegean/github"
      }
    };
  }

  async applyDirectoryPreset(presetName) {
    const preset = this.getDirectoryPresets()[presetName];
    if (!preset) {
      throw new Error(`未知目录模板：${presetName}`);
    }
    Object.assign(this.settings, preset);
    await this.saveSettings();
    await this.ensureCaptureFolders();
  }

  async ensureCaptureFolders() {
    const folders = [
      this.settings.stagingFolder,
      this.settings.websiteFolder,
      this.settings.articleFolder,
      this.settings.gitFolder,
      this.settings.knowledgeTopicFolder,
      this.settings.reusableAssetFolder,
      this.settings.screenshotFolder,
      this.settings.wechatAssetFolder,
      this.settings.githubAssetFolder
    ];
    for (const folder of [...new Set(folders.map((item) => normalizePath(item)).filter(Boolean))]) {
      await this.ensureFolder(folder);
    }
  }

  async ensureFirstRunGuides() {
    const stagingFolder = normalizePath(this.settings.stagingFolder || DEFAULT_SETTINGS.stagingFolder);
    const guideFolder = normalizePath(`${stagingFolder}/使用说明`);
    await this.ensureFolder(stagingFolder);
    await this.ensureFolder(guideFolder);

    const guides = this.getFirstRunGuides(guideFolder);
    for (const guide of guides) {
      if (!this.app.vault.getAbstractFileByPath(guide.path) && !(await this.app.vault.adapter.exists(guide.path))) {
        await this.app.vault.adapter.write(guide.path, guide.body);
      }
    }
  }

  getFirstRunGuides(guideFolder) {
    return [
      {
        path: normalizePath(`${guideFolder}/00_首次使用检查清单.md`),
        body: [
          "# 首次使用检查清单",
          "",
          "按下面顺序完成一次配置，就可以开始收藏网页。",
          "",
          "- [ ] 已把 `bookmark-ai-assistant` 文件夹复制到当前 Obsidian 仓库的 `.obsidian/plugins/` 下。",
          "- [ ] 已在 Obsidian 的第三方插件中启用 `Aegean剪藏助手`。",
          "- [ ] 已在 Chrome 的 `chrome://extensions/` 中加载浏览器插件文件夹。",
          "- [ ] 已先打开 Obsidian，再点击浏览器插件面板里的 `重新检测`。",
          "- [ ] 浏览器插件显示 `Obsidian 已连接`。",
          "- [ ] 尝试收藏一个网页，确认新笔记进入当前收件箱。",
          "",
          "默认收件箱是 `00_收件箱/`。批量整理后，收藏会按来源移动到 `01_网站/`、`02_文章/` 或 `03_Git/`。"
        ].join("\n")
      },
      {
        path: normalizePath(`${guideFolder}/01_浏览器插件怎么用.md`),
        body: [
          "# 浏览器插件怎么用",
          "",
          "浏览器插件负责从网页提取内容，并发送给已经打开的 Obsidian。",
          "",
          "## 使用前确认",
          "",
          "1. 先打开 Obsidian。",
          "2. 确认 `Aegean剪藏助手` 已启用。",
          "3. 打开浏览器插件面板，看到 `Obsidian 已连接`。",
          "",
          "## 功能入口",
          "",
          "- `正文收藏`：适合博客、教程、长文、资料页，会保存标题、链接、描述和正文。",
          "- `截图收藏`：适合工具站、后台页面、视觉参考页，会保存当前可见区域截图。",
          "- `公众号文章`：适合微信公众号文章，会尽量保留正文顺序、图片和富文本层级。",
          "- `GitHub 项目`：适合 GitHub 仓库，会保存仓库信息和 README 内容。",
          "",
          "收藏成功后，新笔记会先进入收件箱，默认是 `00_收件箱/`。"
        ].join("\n")
      },
      {
        path: normalizePath(`${guideFolder}/02_Obsidian插件怎么用.md`),
        body: [
          "# Obsidian 插件怎么用",
          "",
          "`Aegean剪藏助手` 负责接收浏览器插件发来的内容，并在 Obsidian 中保存、分析和归档。",
          "",
          "## 保存目录",
          "",
          "- `00_收件箱/`：新收藏先进入这里。",
          "- `01_网站/`：网站类收藏整理后进入这里。",
          "- `02_文章/`：文章、公众号、长文整理后进入这里。",
          "- `03_Git/`：GitHub 或 GitLab 项目整理后进入这里。",
          "- `90_系统资料/附件/`：截图、公众号图片、GitHub README 图片等附件。",
          "",
          "## 整理方式",
          "",
          "- `分析当前收藏并归档`：只整理当前打开的收藏笔记。",
          "- `批量分析收件箱收藏`：整理收件箱里的收藏笔记。",
          "",
          "批量整理会跳过 `00_收件箱/使用说明/`，这些说明文件不会被移动。",
          "",
          "## AI 配置",
          "",
          "不配置 API Key 也可以收藏和按规则归档。填写 API Key 后，可以获得更完整的摘要、分类和标签。"
        ].join("\n")
      }
    ];
  }

  registerFloatingToc() {
    if (!this.app?.workspace?.on || !this.registerEvent) {
      return;
    }
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.refreshFloatingToc()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.refreshFloatingToc()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.refreshFloatingToc()));
    setTimeout(() => this.refreshFloatingToc(), 300);
  }

  async refreshFloatingToc() {
    const file = this.app?.workspace?.getActiveFile?.();
    if (!(file instanceof TFile)) {
      this.removeFloatingToc();
      return;
    }

    const view = this.app.workspace.getActiveViewOfType?.(require("obsidian").MarkdownView);
    if (!view || typeof document === "undefined") {
      this.removeFloatingToc();
      return;
    }

    const content = await this.app.vault.cachedRead(file);
    if (!this.shouldShowFloatingToc(content)) {
      this.removeFloatingToc();
      return;
    }

    const headings = this.getFloatingTocHeadings(file, content).filter((heading) => heading.level <= 3);
    if (headings.length < 2) {
      this.removeFloatingToc();
      return;
    }

    this.renderFloatingToc(document.body, headings);
  }

  renderFloatingToc(container, headings) {
    this.removeFloatingToc();
    const toc = document.createElement("aside");
    toc.className = `bookmark-ai-floating-toc${this.floatingTocCollapsed ? " is-collapsed" : ""}`;

    const toggle = document.createElement("button");
    toggle.className = "bookmark-ai-floating-toc-toggle";
    toggle.type = "button";
    toggle.textContent = this.floatingTocCollapsed ? "目录" : "收起";
    toggle.addEventListener("click", () => {
      this.floatingTocCollapsed = !this.floatingTocCollapsed;
      toc.classList.toggle("is-collapsed", this.floatingTocCollapsed);
      toggle.textContent = this.floatingTocCollapsed ? "目录" : "收起";
    });
    toc.appendChild(toggle);

    const list = document.createElement("nav");
    list.className = "bookmark-ai-floating-toc-list";
    for (const heading of headings) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `bookmark-ai-floating-toc-item level-${heading.level}`;
      item.textContent = this.getTocDisplayText(heading.text);
      item.title = heading.text;
      item.dataset.tocText = heading.text;
      item.addEventListener("click", () => this.scrollToHeading(heading));
      list.appendChild(item);
    }
    toc.appendChild(list);

    container.appendChild(toc);
    this.floatingTocEl = toc;
  }

  removeFloatingToc() {
    this.floatingTocEl?.remove?.();
    this.floatingTocEl = null;
  }

  scrollToHeading(heading) {
    const text = typeof heading === "string" ? heading : heading?.text;
    const activeView = this.app?.workspace?.getActiveViewOfType?.(require("obsidian").MarkdownView);
    const previewMode = this.isPreviewMode(activeView);
    if (!previewMode && this.scrollEditorToTocHeading(activeView, heading)) {
      return;
    }

    const target = this.findRenderedTocTarget(activeView, heading, text);

    if (target?.scrollIntoView) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (previewMode && this.scrollPreviewToTocHeading(activeView, heading, text)) {
      return;
    }

    this.scrollEditorToTocHeading(activeView, heading);
  }

  isPreviewMode(view) {
    return view?.getMode?.() === "preview" || view?.currentMode?.type === "preview";
  }

  findRenderedTocTarget(activeView, heading, text) {
    const root = activeView?.contentEl || activeView?.containerEl || (typeof document !== "undefined" ? document : null);
    if (!root?.querySelectorAll) {
      return null;
    }
    const headings = [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")];
    return (
      this.pickTocTarget(headings, heading) ||
      this.findRenderedTextTarget(root, "li,strong,p,summary", text) ||
      this.findRenderedTextTarget(root, "section,div", text) ||
      null
    );
  }

  findRenderedTextTarget(root, selector, text) {
    return [...root.querySelectorAll(selector)].find((element) => {
      if (element.closest?.(".bookmark-ai-floating-toc")) {
        return false;
      }
      return this.isTocTargetText(element.textContent, text);
    });
  }

  scrollPreviewToTocHeading(activeView, heading, text) {
    if (typeof heading?.line !== "number") {
      return false;
    }
    const scroller =
      activeView?.contentEl?.querySelector?.(".markdown-preview-view") ||
      activeView?.contentEl?.querySelector?.(".markdown-reading-view") ||
      activeView?.contentEl;
    if (!scroller || typeof scroller.scrollTop !== "number") {
      return false;
    }
    const editorLineCount = activeView?.editor?.getValue
      ? String(activeView.editor.getValue() || "").split("\n").length
      : 0;
    const lineCount = heading.lineCount || editorLineCount;
    if (!lineCount || lineCount < 2) {
      return false;
    }
    const maxScrollTop = Math.max(0, (scroller.scrollHeight || 0) - (scroller.clientHeight || 0));
    if (maxScrollTop <= 0) {
      return false;
    }
    const ratio = Math.max(0, Math.min(1, heading.line / Math.max(1, lineCount - 1)));
    scroller.scrollTop = Math.max(0, Math.min(maxScrollTop, ratio * maxScrollTop));
    this.refinePreviewTocScroll(activeView, heading, text);
    return true;
  }

  refinePreviewTocScroll(activeView, heading, text) {
    const scheduler =
      typeof window !== "undefined" && window.setTimeout
        ? window.setTimeout.bind(window)
        : typeof setTimeout !== "undefined"
          ? setTimeout
          : null;
    if (!scheduler) {
      return;
    }
    for (const delay of [120, 320, 700]) {
      scheduler(() => {
        const target = this.findRenderedTocTarget(activeView, heading, text);
        target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      }, delay);
    }
  }

  async analyzeCurrentFile() {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile)) {
      new Notice("请先打开一条要分析的收藏笔记。");
      return;
    }

    try {
      const analyzedFile = await this.analyzeFile(file);
      await this.app.workspace.getLeaf().openFile(analyzedFile);
      new Notice(`已完成分析：${analyzedFile.basename}`);
    } catch (error) {
      console.error(error);
      new Notice(`分析失败：${error.message}`);
    }
  }

  async analyzeStagingFolder() {
    const stagingFiles = this.getStagingFiles();
    if (stagingFiles.length === 0) {
      new Notice("收件箱里没有可分析的收藏。");
      return;
    }

    new Notice(`开始分析 ${stagingFiles.length} 条收件箱收藏。`);
    let successCount = 0;

    for (const file of stagingFiles) {
      try {
        await this.analyzeFile(file);
        successCount += 1;
      } catch (error) {
        console.error(`Failed to analyze ${file.path}`, error);
      }
    }

    new Notice(`批量分析完成，共处理 ${successCount}/${stagingFiles.length} 条收藏。`);
  }

  getStagingFiles() {
    const stagingFolders = [normalizePath(this.settings.stagingFolder)];
    const legacyStagingFolders = ["00_暂存", "temp"];
    for (const legacyStagingFolder of legacyStagingFolders) {
      if (!stagingFolders.includes(legacyStagingFolder) && this.app.vault.getAbstractFileByPath(legacyStagingFolder)) {
        stagingFolders.push(legacyStagingFolder);
      }
    }

    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => stagingFolders.some((folder) => file.path.startsWith(`${folder}/`)))
      .filter((file) => !this.isGuideFile(file))
      .filter((file) => !file.basename.includes("说明"));
  }

  isGuideFile(file) {
    const stagingFolder = normalizePath(this.settings.stagingFolder || DEFAULT_SETTINGS.stagingFolder);
    const guideFolder = normalizePath(`${stagingFolder}/使用说明`);
    return normalizePath(file.path).startsWith(`${guideFolder}/`);
  }

  async analyzeFile(file) {
    const config = await this.getResolvedConfig();
    const rawContent = await this.app.vault.cachedRead(file);
    const parsed = this.parseNote(file, rawContent);
    const aiResult = config.apiKey
      ? await this.requestAnalysis(config, parsed)
      : this.createRuleBasedAnalysis(parsed);
    const category = this.forceCategoryByUrl(parsed.url) || this.normalizeCategory(aiResult.category);
    const tags = this.normalizeTags(aiResult.tags);
    const targetFolder = this.getTargetFolder(category);

    await this.ensureFolder(targetFolder);

    const updatedContent = this.renderAnalyzedNote({
      title: parsed.title,
      url: parsed.url,
      category,
      tags,
      summary: aiResult.summary,
      originalBody: parsed.originalBody,
      screenshotPaths: parsed.screenshotPaths,
      metadata: parsed.metadata
    });

    await this.app.vault.modify(file, updatedContent);

    const archiveFileName = this.buildArchiveFileName(category, aiResult.fileName || parsed.title || file.basename, parsed);
    const targetPath = await this.getAvailablePath(targetFolder, archiveFileName);
    if (normalizePath(file.path) !== normalizePath(targetPath)) {
      await this.app.fileManager.renameFile(file, targetPath);
    }

    return file;
  }

  async startCaptureServer() {
    await this.stopCaptureServer();

    this.captureServer = http.createServer(async (request, response) => {
      try {
        await this.handleServerRequest(request, response);
      } catch (error) {
        console.error("Capture server error", error);
        this.sendJson(response, 500, { ok: false, error: error.message || "未知错误" });
      }
    });

    await new Promise((resolve, reject) => {
      this.captureServer.once("error", reject);
      this.captureServer.listen(this.settings.serverPort, this.settings.serverHost, () => {
        this.captureServer.off("error", reject);
        resolve();
      });
    });
  }

  async stopCaptureServer() {
    if (!this.captureServer) {
      return;
    }

    await new Promise((resolve) => {
      this.captureServer.close(() => resolve());
    });
    this.captureServer = null;
  }

  async handleServerRequest(request, response) {
    this.setCorsHeaders(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      this.sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method !== "POST") {
      this.sendJson(response, 405, { ok: false, error: "仅支持 POST 请求" });
      return;
    }

    if (request.url === "/capture/text") {
      const payload = await this.readJsonBody(request);
      const file = await this.createTextCaptureNote(payload);
      this.sendJson(response, 200, { ok: true, path: file.path });
      return;
    }

    if (request.url === "/capture/screenshot") {
      const payload = await this.readJsonBody(request);
      const note = await this.createScreenshotCaptureNote(payload);
      this.sendJson(response, 200, { ok: true, path: note.path });
      return;
    }

    if (request.url === "/capture/wechat") {
      const payload = await this.readJsonBody(request);
      const note = await this.createWechatCaptureNote(payload);
      this.sendJson(response, 200, { ok: true, path: note.path });
      return;
    }

    if (request.url === "/capture/github") {
      const payload = await this.readJsonBody(request);
      const note = await this.createGithubCaptureNote(payload);
      this.sendJson(response, 200, { ok: true, path: note.path });
      return;
    }

    this.sendJson(response, 404, { ok: false, error: "未找到接口" });
  }

  setCorsHeaders(response) {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  sendJson(response, statusCode, data) {
    response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(data));
  }

  async readJsonBody(request) {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    if (!raw) {
      return {};
    }
    return JSON.parse(raw);
  }

  async createTextCaptureNote(payload) {
    const title = this.sanitizeFileName(payload.title || "未命名收藏");
    const url = String(payload.url || "").trim();
    const content = String(payload.content || "").trim();
    const description = String(payload.description || "").trim();
    const collectedAt = this.getIsoTimestamp();
    if (!content) {
      throw new Error("没有收到正文内容。请改用截图收藏，或换到正文可见的页面后再试。");
    }
    const body = [
      "---",
      "capture_mode: text",
      `原始标题: "${this.escapeYaml(payload.title || "未命名收藏")}"`,
      `链接: "${this.escapeYaml(url)}"`,
      "作者:",
      "发布时间:",
      `收藏时间: "${this.escapeYaml(collectedAt)}"`,
      `页面描述: "${this.escapeYaml(description)}"`,
      `source_url: "${this.escapeYaml(url)}"`,
      `page_description: "${this.escapeYaml(description)}"`,
      "---",
      "",
      "## 原始标题",
      "",
      payload.title || "未命名收藏",
      "",
      "## 原文链接",
      "",
      url,
      "",
      description ? "## 页面描述" : "",
      description ? "" : "",
      description || "",
      description ? "" : "",
      "## 原文内容",
      "",
      content
    ]
      .filter((line, index, array) => !(line === "" && array[index - 1] === "" && array[index + 1] === ""))
      .join("\n");

    await this.ensureFolder(this.settings.stagingFolder);
    const filePath = await this.getAvailablePath(this.settings.stagingFolder, title);
    return this.app.vault.create(filePath, body);
  }

  async createScreenshotCaptureNote(payload) {
    const title = this.sanitizeFileName(payload.title || "未命名截图收藏");
    const url = String(payload.url || "").trim();
    const imageDataUrl = String(payload.imageDataUrl || "").trim();
    const note = String(payload.note || "").trim();
    const description = String(payload.description || "").trim();
    const collectedAt = this.getIsoTimestamp();

    if (!imageDataUrl.startsWith("data:image/")) {
      throw new Error("截图数据无效。");
    }

    await this.ensureFolder(this.settings.stagingFolder);
    await this.ensureFolder(this.settings.screenshotFolder);

    const imageBaseName = `${title}-${this.getTimestampSlug()}`;
    const imagePath = await this.getAvailableBinaryPath(this.settings.screenshotFolder, imageBaseName, "png");
    const binary = this.decodeDataUrl(imageDataUrl);
    await this.app.vault.adapter.writeBinary(normalizePath(imagePath), binary);

    const notePath = await this.getAvailablePath(this.settings.stagingFolder, title);
    const embedPath = normalizePath(imagePath);
    const noteContent = [
      "---",
      "capture_mode: screenshot",
      `原始标题: "${this.escapeYaml(payload.title || "未命名截图收藏")}"`,
      `链接: "${this.escapeYaml(url)}"`,
      "作者:",
      "发布时间:",
      `收藏时间: "${this.escapeYaml(collectedAt)}"`,
      `页面描述: "${this.escapeYaml(description)}"`,
      `source_url: "${this.escapeYaml(url)}"`,
      `page_description: "${this.escapeYaml(description)}"`,
      `screenshot_path: "${this.escapeYaml(embedPath)}"`,
      "---",
      "",
      `# ${payload.title || "未命名截图收藏"}`,
      "",
      `原始标题：${payload.title || "未命名截图收藏"}`,
      `原文链接：${url}`,
      "收藏模式：截图",
      "",
      "## 内容摘要",
      "",
      "待分析",
      "",
      "## 网页截图",
      "",
      `![[${embedPath}]]`,
      note ? "" : "",
      note ? "## 备注" : "",
      note ? "" : "",
      note || ""
    ]
      .filter((line, index, array) => !(line === "" && array[index - 1] === "" && array[index + 1] === ""))
      .join("\n");

    return this.app.vault.create(notePath, noteContent);
  }

  async createWechatCaptureNote(payload) {
    const title = this.sanitizeFileName(payload.title || "未命名公众号文章");
    const url = String(payload.url || "").trim();
    const description = String(payload.description || "").trim();
    const account = String(payload.account || "").trim();
    const author = String(payload.author || "").trim();
    const publishTime = String(payload.publishTime || "").trim();
    const blocks = Array.isArray(payload.blocks) ? payload.blocks : [];
    const html = String(payload.html || "").trim();
    const collectedAt = this.getIsoTimestamp();

    if (blocks.length === 0) {
      throw new Error("没有收到公众号正文或图片内容。");
    }

    await this.ensureFolder(this.settings.stagingFolder);
    await this.ensureFolder(this.settings.wechatAssetFolder || DEFAULT_SETTINGS.wechatAssetFolder);

    const assetFolder = await this.getAvailableFolderPath(
      this.settings.wechatAssetFolder || DEFAULT_SETTINGS.wechatAssetFolder,
      `${title}-${this.getTimestampSlug()}`
    );
    await this.ensureFolder(assetFolder);

    if (html) {
      try {
        await this.app.vault.adapter.write(normalizePath(`${assetFolder}/original.html`), html);
      } catch (error) {
        console.warn("Failed to write original HTML", error);
      }
    }

    const imageCache = new Map();
    let imageIndex = 1;
    const contentLines = [];
    const failedImages = [];

    for (const block of blocks) {
      if (block?.type === "text") {
        const text = String(block.text || "").trim();
        if (text) {
          const richHtml = this.sanitizeWechatRichHtml(block.html);
          contentLines.push(richHtml || text, "");
        }
        continue;
      }

      if (block?.type === "image") {
        const imageUrl = String(block.url || "").trim();
        if (!imageUrl) {
          continue;
        }

        if (!imageCache.has(imageUrl)) {
          let savedPath = await this.downloadWechatImage(imageUrl, assetFolder, imageIndex, url);
          if (!savedPath && block.dataUrl) {
            savedPath = await this.writeImageDataUrl(block.dataUrl, assetFolder, imageIndex, "png");
          }
          imageCache.set(imageUrl, savedPath);
          if (savedPath) {
            imageIndex += 1;
          } else {
            failedImages.push(imageUrl);
          }
        }

        const localPath = imageCache.get(imageUrl);
        contentLines.push(localPath ? `![[${localPath}]]` : `![图片下载失败](${imageUrl})`, "");
      }
    }

    const notePath = await this.getAvailablePath(this.settings.stagingFolder, title);
    const noteContent = [
      "---",
      "capture_mode: wechat",
      `原始标题: "${this.escapeYaml(payload.title || "未命名公众号文章")}"`,
      `链接: "${this.escapeYaml(url)}"`,
      `作者: "${this.escapeYaml(author || account)}"`,
      `发布时间: "${this.escapeYaml(publishTime)}"`,
      `收藏时间: "${this.escapeYaml(collectedAt)}"`,
      `页面描述: "${this.escapeYaml(description)}"`,
      `source_url: "${this.escapeYaml(url)}"`,
      `page_description: "${this.escapeYaml(description)}"`,
      `asset_folder: "${this.escapeYaml(assetFolder)}"`,
      "---",
      "",
      `# ${payload.title || "未命名公众号文章"}`,
      "",
      `原始标题：${payload.title || "未命名公众号文章"}`,
      `原文链接：${url}`,
      account ? `公众号：${account}` : "",
      author ? `作者：${author}` : "",
      publishTime ? `发布时间：${publishTime}` : "",
      "收藏模式：公众号完整收藏",
      "",
      "## 内容摘要",
      "",
      "待分析",
      "",
      "## 原文内容",
      "",
      ...contentLines,
      failedImages.length > 0 ? "## 图片下载失败" : "",
      ...failedImages.map((imageUrl) => `- ${imageUrl}`)
    ]
      .filter((line, index, array) => !(line === "" && array[index - 1] === "" && array[index + 1] === ""))
      .join("\n");

    return this.app.vault.create(notePath, noteContent);
  }

  async createGithubCaptureNote(payload) {
    const url = String(payload.url || "").trim();
    const owner = String(payload.owner || "").trim();
    const repo = String(payload.repo || "").trim();
    const dedupeKey = `github:${url || `${owner}/${repo}`}`;
    const deduped = this.getRecentCapture(dedupeKey);
    if (deduped) {
      return deduped;
    }

    const capturePromise = this.createGithubCaptureNoteOnce(payload);
    this.trackRecentCapture(dedupeKey, capturePromise);
    return capturePromise;
  }

  async createGithubCaptureNoteOnce(payload) {
    const repoName = this.sanitizeFileName(payload.repo || payload.title || "未命名 GitHub 项目");
    const title = this.sanitizeFileName(payload.title || `${payload.owner || ""}/${payload.repo || ""}` || "未命名 GitHub 项目");
    const url = String(payload.url || "").trim();
    const description = String(payload.description || "").trim();
    const owner = String(payload.owner || "").trim();
    const repo = String(payload.repo || "").trim();
    const stars = String(payload.stars || "").trim();
    const forks = String(payload.forks || "").trim();
    const language = String(payload.language || "").trim();
    const license = String(payload.license || "").trim();
    const topics = Array.isArray(payload.topics) ? payload.topics.map((topic) => String(topic || "").trim()).filter(Boolean) : [];
    const blocks = Array.isArray(payload.blocks) ? payload.blocks : [];
    const html = String(payload.html || "").trim();
    const collectedAt = this.getIsoTimestamp();

    if (!owner || !repo) {
      throw new Error("没有收到 GitHub 仓库信息。");
    }
    if (blocks.length === 0) {
      throw new Error("没有收到 GitHub README 内容。");
    }

    await this.ensureFolder(this.settings.stagingFolder);
    await this.ensureFolder(this.settings.githubAssetFolder || DEFAULT_SETTINGS.githubAssetFolder);

    const assetFolder = await this.getAvailableFolderPath(
      this.settings.githubAssetFolder || DEFAULT_SETTINGS.githubAssetFolder,
      `${repoName}-${this.getTimestampSlug()}`
    );
    await this.ensureFolder(assetFolder);

    if (html) {
      try {
        await this.app.vault.adapter.write(normalizePath(`${assetFolder}/original.html`), html);
      } catch (error) {
        console.warn("Failed to write GitHub README HTML", error);
      }
    }

    const imageCache = new Map();
    let imageIndex = 1;
    const contentLines = [];
    const failedImages = [];

    for (const block of blocks) {
      if (block?.type === "text") {
        const text = String(block.text || "").trim();
        if (text) {
          const richHtml = this.sanitizeWechatRichHtml(block.html);
          contentLines.push(richHtml || text, "");
        }
        continue;
      }

      if (block?.type === "details") {
        const text = String(block.text || "").trim();
        const richHtml = this.sanitizeWechatRichHtml(block.html);
        const detailsImageLines = [];
        for (const image of Array.isArray(block.images) ? block.images : []) {
          const imageUrl = String(image?.url || "").trim();
          if (!imageUrl) {
            continue;
          }
          if (!imageCache.has(imageUrl)) {
            const savedPath = await this.downloadGithubImage(imageUrl, assetFolder, imageIndex, url);
            imageCache.set(imageUrl, savedPath);
            if (savedPath) {
              imageIndex += 1;
            } else {
              failedImages.push(imageUrl);
            }
          }
          const localPath = imageCache.get(imageUrl);
          detailsImageLines.push(localPath ? this.renderSizedEmbed(localPath, 720) : `![${image.alt || "图片下载失败"}](${imageUrl})`);
        }
        const detailsHtml = this.renderDetailsBlock(richHtml || text, detailsImageLines);
        if (detailsHtml) {
          contentLines.push(detailsHtml, "");
        }
        continue;
      }

      if (block?.type === "image") {
        const imageUrl = String(block.url || "").trim();
        if (!imageUrl) {
          continue;
        }

        if (!imageCache.has(imageUrl)) {
          const savedPath = await this.downloadGithubImage(imageUrl, assetFolder, imageIndex, url);
          imageCache.set(imageUrl, savedPath);
          if (savedPath) {
            imageIndex += 1;
          } else {
            failedImages.push(imageUrl);
          }
        }

        const localPath = imageCache.get(imageUrl);
        contentLines.push(localPath ? this.renderSizedEmbed(localPath, 720) : `![${block.alt || "图片下载失败"}](${imageUrl})`, "");
      }
    }

    const notePath = await this.getAvailablePath(this.settings.stagingFolder, repo || title);
    const noteContent = [
      "---",
      "capture_mode: github",
      `原始标题: "${this.escapeYaml(payload.title || `${owner}/${repo}`)}"`,
      `链接: "${this.escapeYaml(url)}"`,
      "作者:",
      "发布时间:",
      `收藏时间: "${this.escapeYaml(collectedAt)}"`,
      `页面描述: "${this.escapeYaml(description)}"`,
      `source_url: "${this.escapeYaml(url)}"`,
      `page_description: "${this.escapeYaml(description)}"`,
      `asset_folder: "${this.escapeYaml(assetFolder)}"`,
      `github_owner: "${this.escapeYaml(owner)}"`,
      `github_repo: "${this.escapeYaml(repo)}"`,
      "---",
      "",
      `# ${owner}/${repo}`,
      "",
      `仓库：${owner}/${repo}`,
      `原文链接：${url}`,
      description ? `描述：${description}` : "",
      stars ? `Stars：${stars}` : "",
      forks ? `Forks：${forks}` : "",
      language ? `主要语言：${language}` : "",
      license ? `License：${license}` : "",
      topics.length > 0 ? `Topics：${topics.join("、")}` : "",
      "收藏模式：GitHub 项目完整收藏",
      "",
      "## 内容摘要",
      "",
      "待分析",
      "",
      "## 原文内容",
      "",
      ...contentLines,
      failedImages.length > 0 ? "## 图片下载失败" : "",
      ...failedImages.map((imageUrl) => `- ${imageUrl}`)
    ]
      .filter((line, index, array) => !(line === "" && array[index - 1] === "" && array[index + 1] === ""))
      .join("\n");

    return this.app.vault.create(notePath, noteContent);
  }

  getRecentCapture(key) {
    this.recentCapturePromises = this.recentCapturePromises || new Map();
    const entry = this.recentCapturePromises.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.recentCapturePromises.delete(key);
      return null;
    }
    return entry.promise;
  }

  trackRecentCapture(key, promise) {
    this.recentCapturePromises = this.recentCapturePromises || new Map();
    this.recentCapturePromises.set(key, {
      promise,
      expiresAt: Date.now() + 30000
    });
    promise.catch(() => {
      const entry = this.recentCapturePromises?.get(key);
      if (entry?.promise === promise) {
        this.recentCapturePromises.delete(key);
      }
    });
  }

  renderSizedEmbed(path, width) {
    return `![[${normalizePath(path)}|${width}]]`;
  }

  renderDetailsBlock(html, imageLines) {
    const raw = String(html || "").trim();
    if (!raw) {
      return "";
    }
    const images = (imageLines || []).filter(Boolean).join("\n\n");
    const withoutOpen = raw.replace(/<details\b([^>]*)\sopen(?:=["'][^"']*["'])?([^>]*)>/i, "<details$1$2>");
    if (!images) {
      return withoutOpen;
    }
    if (/<\/details>\s*$/i.test(withoutOpen)) {
      return withoutOpen.replace(/<\/details>\s*$/i, `\n\n${images}\n</details>`);
    }
    return `${withoutOpen}\n\n${images}`;
  }

  async downloadWechatImage(imageUrl, assetFolder, imageIndex, referer) {
    try {
      const response = await fetch(imageUrl, {
        headers: {
          Referer: referer || "https://mp.weixin.qq.com/",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari"
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const contentType = response.headers.get("content-type") || "";
      const extension = this.extensionFromContentType(contentType) || this.extensionFromUrl(imageUrl) || "jpg";
      const imagePath = await this.getAvailableBinaryPath(assetFolder, `image-${String(imageIndex).padStart(3, "0")}`, extension);
      const arrayBuffer = await response.arrayBuffer();
      await this.app.vault.adapter.writeBinary(normalizePath(imagePath), Buffer.from(arrayBuffer));
      return normalizePath(imagePath);
    } catch (error) {
      console.warn(`Failed to download image ${imageUrl}`, error);
      return "";
    }
  }

  async writeImageDataUrl(dataUrl, assetFolder, imageIndex, fallbackExtension) {
    const raw = String(dataUrl || "").trim();
    if (!raw.startsWith("data:image/")) {
      return "";
    }
    try {
      const mime = raw.match(/^data:([^;]+);base64,/)?.[1] || "";
      const extension = this.extensionFromContentType(mime) || fallbackExtension || "png";
      const imagePath = await this.getAvailableBinaryPath(assetFolder, `image-${String(imageIndex).padStart(3, "0")}`, extension);
      const binary = this.decodeDataUrl(raw);
      await this.app.vault.adapter.writeBinary(normalizePath(imagePath), binary);
      return normalizePath(imagePath);
    } catch (error) {
      console.warn("Failed to write browser image data", error);
      return "";
    }
  }

  async downloadGithubImage(imageUrl, assetFolder, imageIndex, referer) {
    try {
      const response = await fetch(imageUrl, {
        headers: {
          Referer: referer || "https://github.com/",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari"
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const contentType = response.headers.get("content-type") || "";
      const extension = this.extensionFromContentType(contentType) || this.extensionFromUrl(imageUrl) || "png";
      const imagePath = await this.getAvailableBinaryPath(assetFolder, `image-${String(imageIndex).padStart(3, "0")}`, extension);
      const arrayBuffer = await response.arrayBuffer();
      const compressed = this.compressGithubImageBuffer(Buffer.from(arrayBuffer), extension);
      await this.app.vault.adapter.writeBinary(normalizePath(imagePath), compressed);
      return normalizePath(imagePath);
    } catch (error) {
      console.warn(`Failed to download GitHub image ${imageUrl}`, error);
      return "";
    }
  }

  compressGithubImageBuffer(buffer, extension) {
    try {
      const { nativeImage } = require("electron");
      const image = nativeImage.createFromBuffer(buffer);
      if (!image || image.isEmpty()) {
        return buffer;
      }
      const size = image.getSize();
      const resized = size.width > 1440 ? image.resize({ width: 1440, quality: "good" }) : image;
      const normalizedExtension = String(extension || "").toLowerCase();
      if (["jpg", "jpeg"].includes(normalizedExtension)) {
        return resized.toJPEG(82);
      }
      return resized.toPNG();
    } catch (error) {
      console.warn("Failed to compress GitHub image, writing original image", error);
      return buffer;
    }
  }

  sanitizeWechatRichHtml(html) {
    const raw = String(html || "").trim();
    if (!raw) {
      return "";
    }

    return raw
      .replace(/<\s*(script|style|noscript|iframe|object|embed|svg|canvas|video|audio)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\s+(?:src|srcset|data-src|data-original|data-backsrc|data-croporisrc)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\s+href\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, "")
      .replace(/url\([^)]*\)/gi, "")
      .replace(/expression\([^)]*\)/gi, "")
      .trim();
  }

  async getResolvedConfig() {
    return {
      apiBaseUrl: this.settings.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl,
      apiKey: this.settings.apiKey || "",
      model: this.settings.model || DEFAULT_SETTINGS.model,
      temperature: Number.isFinite(this.settings.temperature) ? this.settings.temperature : DEFAULT_SETTINGS.temperature
    };
  }

  buildChatEndpoint(apiBaseUrl) {
    const trimmed = String(apiBaseUrl || "").trim().replace(/\/+$/, "");
    if (!trimmed) {
      return "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
    }
    if (trimmed.endsWith("/chat/completions")) {
      return trimmed;
    }
    if (trimmed.endsWith("/v1")) {
      return `${trimmed}/chat/completions`;
    }
    return `${trimmed}/v1/chat/completions`;
  }

  parseNote(file, content) {
    const frontmatter = this.extractFrontmatter(content);
    const sectionTitle = this.extractSectionBody(content, ["原始标题", "标题"]);
    const sectionUrl = this.extractSectionBody(content, ["原文链接", "链接"]);
    const pageDescription = this.extractFrontmatterValue(frontmatter, ["page_description"]);
    const originalTitle =
      sectionTitle ||
      this.extractFrontmatterValue(frontmatter, ["original_title", "title"]) ||
      this.extractLineValue(content, ["原始标题", "标题"]) ||
      this.extractFirstHeading(content) ||
      file.basename;
    const url =
      sectionUrl ||
      this.extractFrontmatterValue(frontmatter, ["url", "link"]) ||
      this.extractLineValue(content, ["原文链接", "链接", "URL", "Url", "url"]) ||
      "";
    const originalBody = this.extractOriginalBody(content);
    const screenshotPaths = this.extractScreenshotPaths(frontmatter, content);
    const metadata = this.extractMetadata(frontmatter, content);

    return {
      title: originalTitle.trim(),
      url: url.trim(),
      originalBody: (originalBody || pageDescription || "").trim(),
      screenshotPaths,
      metadata
    };
  }

  extractMetadata(frontmatter, content) {
    const metadata = {
      originalTitle:
        this.extractFrontmatterValue(frontmatter, ["原始标题", "original_title", "title"]) ||
        this.extractLineValue(content, ["原始标题", "标题"]),
      url:
        this.extractFrontmatterValue(frontmatter, ["链接", "source_url", "url", "link"]) ||
        this.extractLineValue(content, ["原文链接", "链接", "URL", "Url", "url"]),
      author:
        this.extractFrontmatterValue(frontmatter, ["作者", "author"]) ||
        this.extractLineValue(content, ["作者", "公众号"]),
      publishTime:
        this.extractFrontmatterValue(frontmatter, ["发布时间", "publish_time", "published_at"]) ||
        this.extractLineValue(content, ["发布时间"]),
      collectedAt: this.extractFrontmatterValue(frontmatter, ["收藏时间", "collected_at"]),
      description:
        this.extractFrontmatterValue(frontmatter, ["页面描述", "page_description", "description"]) ||
        this.extractLineValue(content, ["页面描述"]),
      captureMode: this.extractFrontmatterValue(frontmatter, ["capture_mode"]),
      assetFolder: this.extractFrontmatterValue(frontmatter, ["asset_folder"])
    };

    return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, String(value || "").trim()]));
  }

  extractLineValue(content, labels) {
    for (const label of labels) {
      const pattern = new RegExp(`^${this.escapeRegExp(label)}[：:][ \\t]*(.*)$`, "m");
      const match = content.match(pattern);
      const value = String(match?.[1] || "").trim();
      if (value) {
        return value;
      }
    }
    return "";
  }

  extractFirstHeading(content) {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : "";
  }

  extractSectionBody(content, headings) {
    for (const heading of headings) {
      const pattern = new RegExp(
        `^#{1,2}\\s+${this.escapeRegExp(heading)}\\s*$([\\s\\S]*?)(?=^#{1,2}\\s+|\\Z)`,
        "m"
      );
      const match = content.match(pattern);
      if (match && match[1]) {
        const value = match[1].trim();
        if (value) {
          return value;
        }
      }
    }
    return "";
  }

  extractFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
    return match ? match[1] : "";
  }

  extractFrontmatterValue(frontmatter, keys) {
    if (!frontmatter) {
      return "";
    }
    for (const key of keys) {
      const pattern = new RegExp(`^${this.escapeRegExp(key)}:[ \\t]*(.*)$`, "mi");
      const match = frontmatter.match(pattern);
      const value = String(match?.[1] || "").trim();
      if (value) {
        return value.replace(/^["']|["']$/g, "");
      }
    }
    return "";
  }

  shouldShowFloatingToc(content) {
    const frontmatter = this.extractFrontmatter(content);
    const captureMode = this.extractFrontmatterValue(frontmatter, ["capture_mode"]);
    const category = this.extractFrontmatterValue(frontmatter, ["分类", "category"]);
    const url =
      this.extractFrontmatterValue(frontmatter, ["链接", "source_url", "url", "link"]) ||
      this.extractLineValue(content, ["原文链接", "链接", "URL", "Url", "url"]);
    return Boolean(
      captureMode ||
        ["Git", "网站", "文章"].includes(category) ||
        String(url || "").trim()
    );
  }

  getFloatingTocHeadings(file, content) {
    const lineCount = String(content || "").split("\n").length;
    const metadataHeadings = this.extractObsidianMetadataHeadings(file);
    if (metadataHeadings.length === 0) {
      return this.extractMarkdownHeadings(content).map((heading) => ({ ...heading, lineCount }));
    }

    const metadataLines = new Set(
      metadataHeadings
        .map((heading) => heading.line)
        .filter((line) => typeof line === "number")
    );
    const contentLines = String(content || "").split("\n");
    const structuralHeadings = this.extractMarkdownHeadings(content)
      .filter((heading) => typeof heading.line === "number" && !metadataLines.has(heading.line))
      .filter((heading) => !/^(#{1,6})\s+/.test(contentLines[heading.line] || ""))
      .map((heading) => ({ ...heading, source: "structural" }));

    return this.assignTocIdentity([...metadataHeadings, ...structuralHeadings]).map((heading) => ({ ...heading, lineCount }));
  }

  extractObsidianMetadataHeadings(file) {
    const headings = this.app?.metadataCache?.getFileCache?.(file)?.headings;
    if (!Array.isArray(headings) || headings.length === 0) {
      return [];
    }

    const usedSlugs = new Map();
    const normalizedHeadings = [];
    for (const heading of headings) {
      const text = this.normalizeTocText(heading?.heading);
      if (!text) {
        continue;
      }
      const level = Number.isFinite(heading?.level) ? heading.level : 2;
      const baseSlug = this.slugifyHeading(text);
      const count = usedSlugs.get(baseSlug) || 0;
      usedSlugs.set(baseSlug, count + 1);
      normalizedHeadings.push({
        level,
        text,
        slug: count === 0 ? baseSlug : `${baseSlug}-${count + 1}`,
        line: heading?.position?.start?.line,
        occurrence: count,
        source: "metadata"
      });
    }
    return normalizedHeadings;
  }

  assignTocIdentity(headings) {
    const usedSlugs = new Map();
    return headings
      .slice()
      .sort((left, right) => {
        const leftLine = typeof left.line === "number" ? left.line : Number.MAX_SAFE_INTEGER;
        const rightLine = typeof right.line === "number" ? right.line : Number.MAX_SAFE_INTEGER;
        return leftLine - rightLine;
      })
      .map((heading) => {
        const baseSlug = this.slugifyHeading(heading.text);
        const count = usedSlugs.get(baseSlug) || 0;
        usedSlugs.set(baseSlug, count + 1);
        return {
          ...heading,
          slug: count === 0 ? baseSlug : `${baseSlug}-${count + 1}`,
          occurrence: count
        };
      });
  }

  extractMarkdownHeadings(content) {
    const headings = [];
    const usedSlugs = new Map();
    const lines = String(content || "").split("\n");
    let inFence = false;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) {
        continue;
      }

      const markdownHeading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      const htmlHeading = !markdownHeading ? this.extractHtmlHeading(line) : null;
      const structuralHeading = !markdownHeading && !htmlHeading ? this.extractStructuralHeadingText(line) : "";
      if (!markdownHeading && !htmlHeading && !structuralHeading) {
        continue;
      }

      const text = markdownHeading ? markdownHeading[2].trim() : htmlHeading?.text || structuralHeading;
      if (!text) {
        continue;
      }

      const baseSlug = this.slugifyHeading(text);
      const count = usedSlugs.get(baseSlug) || 0;
      usedSlugs.set(baseSlug, count + 1);
      headings.push({
        level: markdownHeading ? markdownHeading[1].length : htmlHeading?.level || 2,
        text,
        slug: count === 0 ? baseSlug : `${baseSlug}-${count + 1}`,
        line: lineIndex,
        lineCount: lines.length,
        occurrence: count
      });
    }

    return headings;
  }

  extractHtmlHeading(line) {
    const text = this.extractHtmlText(line);
    if (!text || text.length > 100) {
      return null;
    }

    const tagHeading = String(line || "").match(/<h([1-6])\b/i);
    if (tagHeading) {
      return { level: Number(tagHeading[1]), text };
    }

    if (/<(section|p)\b/i.test(line) && this.isProminentHtmlHeading(line)) {
      return { level: this.isMajorHtmlHeading(line) ? 2 : 3, text };
    }

    return null;
  }

  extractHtmlText(line) {
    return String(line || "")
      .replace(/&nbsp;/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  isProminentHtmlHeading(line) {
    const fontSizes = [...String(line || "").matchAll(/font-size:\s*([0-9.]+)px/gi)].map((match) => Number(match[1]));
    const maxFontSize = fontSizes.length > 0 ? Math.max(...fontSizes) : 0;
    const fontWeights = [...String(line || "").matchAll(/font-weight:\s*([^;"']+)/gi)].map((match) =>
      String(match[1]).trim().toLowerCase()
    );
    const hasHeavyWeight = fontWeights.some((weight) => weight === "bold" || Number(weight) >= 700);
    const hasVisualMarker = /border-left\s*:/i.test(line);

    return (maxFontSize >= 22 && hasHeavyWeight) || (maxFontSize >= 18 && hasHeavyWeight && hasVisualMarker);
  }

  isMajorHtmlHeading(line) {
    const fontSizes = [...String(line || "").matchAll(/font-size:\s*([0-9.]+)px/gi)].map((match) => Number(match[1]));
    const maxFontSize = fontSizes.length > 0 ? Math.max(...fontSizes) : 0;
    return maxFontSize >= 22;
  }

  extractStructuralHeadingText(line) {
    if (/<[^>]+>/.test(line)) {
      if (/\s(style|class)=/i.test(line)) {
        return "";
      }
      const htmlText = this.extractHtmlText(line);
      if (!htmlText || htmlText.length > 80) {
        return "";
      }
      const htmlPatterns = [
        /^[一二三四五六七八九十]+[、.．]\s*\S+/,
        /^\d{1,2}[、.．]\s*\S+/,
        /^第[一二三四五六七八九十\d]+[章节部分]\s*\S+/,
        /^[（(][一二三四五六七八九十\d]+[）)]\s*\S+/
      ];
      return htmlPatterns.some((pattern) => pattern.test(htmlText)) ? htmlText : "";
    }
    const text = String(line || "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .trim();
    if (!text || text.length > 80) {
      return "";
    }
    const patterns = [
      /^[一二三四五六七八九十]+[、.．]\s*\S+/,
      /^\d{1,2}[、.．]\s*\S+/,
      /^第[一二三四五六七八九十\d]+[章节部分]\s*\S+/,
      /^[（(][一二三四五六七八九十\d]+[）)]\s*\S+/
    ];
    return patterns.some((pattern) => pattern.test(text)) ? text : "";
  }

  slugifyHeading(text) {
    return String(text || "")
      .trim()
      .replace(/[\\[\]#`*_~<>]/g, "")
      .replace(/\s+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  normalizeTocText(value) {
    return String(value || "")
      .replace(/<[^>]+>/g, "")
      .replace(/[¶#]/g, "")
      .replace(/[*_`~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  getTocDisplayText(value) {
    return this.normalizeTocText(value);
  }

  normalizeTocMatchText(value) {
    return this.normalizeTocText(value).replace(
      /^(\d{1,2}|[一二三四五六七八九十]+)[、.．)]\s*/,
      ""
    );
  }

  isTocTargetText(candidate, target) {
    const normalizedCandidate = this.normalizeTocMatchText(candidate);
    const normalizedTarget = this.normalizeTocMatchText(target);
    if (!normalizedCandidate || !normalizedTarget) {
      return false;
    }
    return normalizedCandidate === normalizedTarget || normalizedCandidate.startsWith(normalizedTarget);
  }

  pickTocTarget(elements, heading) {
    const text = typeof heading === "string" ? heading : heading?.text;
    const matches = elements.filter((element) => this.isTocTargetText(element.textContent, text));
    if (matches.length === 0) {
      return null;
    }
    const occurrence = typeof heading?.occurrence === "number" ? heading.occurrence : 0;
    return matches[Math.min(occurrence, matches.length - 1)];
  }

  scrollEditorToTocHeading(view, heading) {
    const editor = view?.editor;
    if (!editor?.getValue || !editor?.setCursor) {
      return false;
    }
    if (typeof heading?.line === "number") {
      this.scrollEditorToLine(editor, heading.line);
      return true;
    }
    const text = typeof heading === "string" ? heading : heading?.text;
    const lines = String(editor.getValue() || "").split("\n");
    const lineIndex = lines.findIndex((line) => {
      const markdownHeading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      const candidate = markdownHeading ? markdownHeading[2] : this.extractStructuralHeadingText(line) || line;
      return this.isTocTargetText(candidate, text);
    });
    if (lineIndex < 0) {
      return false;
    }
    this.scrollEditorToLine(editor, lineIndex);
    return true;
  }

  scrollEditorToLine(editor, lineIndex) {
    editor.setCursor({ line: lineIndex, ch: 0 });
    editor.scrollIntoView?.({ from: { line: lineIndex, ch: 0 }, to: { line: lineIndex, ch: 0 } }, true);
  }

  extractOriginalBody(content) {
    const captureMode = this.extractFrontmatterValue(this.extractFrontmatter(content), ["capture_mode"]);
    if (captureMode === "screenshot") {
      return "";
    }
    const rawMarker = "## 原文内容";
    if (content.includes(rawMarker)) {
      return content.split(rawMarker).slice(1).join(rawMarker).trim();
    }
    return content.trim();
  }

  extractScreenshotPaths(frontmatter, content) {
    const paths = [];
    const frontmatterPath = this.extractFrontmatterValue(frontmatter, ["screenshot_path"]);
    if (frontmatterPath) {
      paths.push(frontmatterPath);
    }

    const captureMode = this.extractFrontmatterValue(frontmatter, ["capture_mode"]);
    if (captureMode && captureMode !== "screenshot") {
      return [...new Set(paths.map((path) => normalizePath(path)).filter(Boolean))];
    }

    const embedPattern = /!\[\[([^\]]+\.(?:png|jpe?g|webp|gif))(?:\|[^\]]*)?\]\]/gi;
    let match;
    while ((match = embedPattern.exec(content)) !== null) {
      paths.push(match[1].trim());
    }

    return [...new Set(paths.map((path) => normalizePath(path)).filter(Boolean))];
  }

  async requestAnalysis(config, parsed) {
    const endpoint = this.buildChatEndpoint(config.apiBaseUrl);
    let payload = this.buildAnalysisPayload(config, parsed, parsed.originalBody || "无正文");
    let response = await this.sendAnalysisRequest(endpoint, config.apiKey, payload);

    if (!response.ok) {
      const errorText = await response.text();
      if (!this.isDataInspectionFailure(errorText)) {
        throw new Error(`模型请求失败：${response.status} ${errorText}`);
      }

      payload = this.buildAnalysisPayload(config, parsed, this.cleanAnalysisBody(parsed.originalBody || "无正文"), {
        safeMode: true
      });
      response = await this.sendAnalysisRequest(endpoint, config.apiKey, payload);
      if (!response.ok) {
        const retryErrorText = await response.text();
        if (this.isDataInspectionFailure(retryErrorText)) {
          return this.createFallbackAnalysis(parsed);
        }
        throw new Error(`模型请求失败：${response.status} ${retryErrorText}`);
      }
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message?.content;
    if (!message) {
      throw new Error("模型没有返回可用内容。");
    }

    const parsedJson = this.parseJsonResponse(message);
    return {
      category: parsedJson.category || "文章",
      fileName: this.normalizeSuggestedFileName(parsedJson.fileName || parsedJson.filename || ""),
      tags: Array.isArray(parsedJson.tags) ? parsedJson.tags : [],
      summary: {
        problem: parsedJson?.summary?.problem || "",
        approach: parsedJson?.summary?.approach || "",
        solution: parsedJson?.summary?.solution || "",
        value: parsedJson?.summary?.value || ""
      }
    };
  }

  buildAnalysisPayload(config, parsed, body, options = {}) {
    return {
      model: config.model,
      temperature: config.temperature,
      messages: [
        {
          role: "system",
          content: [
            "你是一个 Obsidian 收藏分析助手。",
            "你的任务是分析一条收藏内容，并返回严格 JSON。",
            "你必须完成三件事：判断分类、选择标签、输出摘要。",
            "你还要输出 fileName，用于保存文件。",
            "分类 category 只能是：网站、文章、Git。",
            "业务范围不要放进 category；如内容适合学习方案、Prompt、新知识、案例、工具方法或可复用资产，请通过 tags 表达。",
            "fileName 规则：网站用“【网站名】-简短描述”，必须用【】包住网站名；文章直接用文章标题；Git 用 AI 分析总结后的中文用途名称。",
            "fileName 不要包含 .md 后缀，不要包含路径，不要超过 24 个中文字符或 48 个英文字符。",
            `标签 tags 只能从以下列表里选 1 到 3 个：${this.settings.tagPool.join("、")}。`,
            "summary 必须包含四个字段：problem、approach、solution、value。",
            "四个字段都必须用中文、短句、信息密度高，不要空泛。",
            "只输出 JSON，不要代码块，不要解释。"
          ].join("\n")
        },
        {
          role: "user",
          content: [
            `标题：${parsed.title || "无"}`,
            `链接：${parsed.url || "无"}`,
            options.safeMode ? "正文（已去除 HTML、图片和外链，仅用于分类摘要）：" : "正文：",
            this.truncate(body || "无正文", options.safeMode ? 4000 : 12000),
            "",
            "请输出这个 JSON：",
            '{"category":"网站","fileName":"【网站名】-简短描述","tags":["AI"],"summary":{"problem":"","approach":"","solution":"","value":""}}'
          ].join("\n")
        }
      ]
    };
  }

  async sendAnalysisRequest(endpoint, apiKey, payload) {
    return fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });
  }

  isDataInspectionFailure(errorText) {
    const normalized = String(errorText || "").toLowerCase();
    return normalized.includes("data_inspection_failed") || normalized.includes("inappropriate content");
  }

  cleanAnalysisBody(body) {
    return String(body || "")
      .replace(/!\[\[[^\]]+\.(?:png|jpe?g|webp|gif)(?:\|[^\]]*)?\]\]/gi, " ")
      .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/https?:\/\/\S+/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|li|h[1-6]|blockquote|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  createFallbackAnalysis(parsed) {
    const title = this.normalizeSuggestedFileName(parsed?.title || "未命名收藏") || "未命名收藏";
    const category = this.forceCategoryByUrl(parsed?.url) || "文章";
    return {
      category,
      fileName: title,
      tags: ["待整理"],
      summary: {
        problem: "模型内容审核拦截，已保留原文待人工整理",
        approach: "自动跳过 AI 摘要，先完成收藏归档",
        solution: "后续可手动补充摘要和标签",
        value: "避免单篇文章导致整个归档流程失败"
      }
    };
  }

  createRuleBasedAnalysis(parsed) {
    const title = this.normalizeSuggestedFileName(parsed?.title || "未命名收藏") || "未命名收藏";
    const url = String(parsed?.url || "");
    const captureMode = String(parsed?.metadata?.captureMode || "").toLowerCase();
    const category =
      this.forceCategoryByUrl(url) ||
      (captureMode === "github" ? "Git" : captureMode === "wechat" || captureMode === "text" ? "文章" : "网站");
    return {
      category,
      fileName: title,
      tags: ["待整理"],
      summary: {
        problem: "未配置 AI Key，已按链接和采集类型完成规则归档",
        approach: "保留原始标题、链接、正文和附件内容",
        solution: "后续可在插件设置中配置模型后重新分析",
        value: "新用户无需配置模型也能先完成收藏入库"
      }
    };
  }

  parseJsonResponse(content) {
    const cleaned = String(content || "")
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "");

    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("模型返回的内容不是有效 JSON。");
    }

    return JSON.parse(cleaned.slice(start, end + 1));
  }

  normalizeCategory(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw.includes("git")) {
      return "Git";
    }
    if (raw.includes("网站")) {
      return "网站";
    }
    if (raw.includes("文章") || raw.includes("blog") || raw.includes("article")) {
      return "文章";
    }
    return "文章";
  }

  forceCategoryByUrl(url) {
    const normalized = String(url || "").toLowerCase();
    if (normalized.includes("github.com") || normalized.includes("gitlab.com")) {
      return "Git";
    }
    if (normalized.includes("mp.weixin.qq.com")) {
      return "文章";
    }
    return "";
  }

  normalizeTags(tags) {
    const whitelist = new Set(this.settings.tagPool);
    const filtered = (Array.isArray(tags) ? tags : [])
      .map((tag) => String(tag || "").trim())
      .filter((tag) => whitelist.has(tag));

    if (filtered.length > 0) {
      return [...new Set(filtered)].slice(0, 3);
    }
    return ["待整理"];
  }

  normalizeSuggestedFileName(value) {
    const fileName = this.sanitizeFileName(value || "");
    return fileName.slice(0, 80);
  }

  buildArchiveFileName(category, suggestedName, parsed = {}) {
    const baseName = this.normalizeSuggestedFileName(suggestedName || parsed.title || "未命名收藏") || "未命名收藏";
    if (category !== "网站") {
      return baseName;
    }
    return this.formatWebsiteFileName(baseName);
  }

  formatWebsiteFileName(fileName) {
    const cleanName = this.normalizeSuggestedFileName(fileName || "未命名网站") || "未命名网站";
    if (/^【[^】]+】/.test(cleanName)) {
      return cleanName;
    }

    const separatorMatch = cleanName.match(/[-－—–]/);
    if (!separatorMatch) {
      return `【${cleanName}】`;
    }

    const separatorIndex = separatorMatch.index;
    const siteName = cleanName.slice(0, separatorIndex).trim() || "未命名网站";
    const description = cleanName.slice(separatorIndex + separatorMatch[0].length).trim();
    return description ? `【${siteName}】-${description}` : `【${siteName}】`;
  }

  getTargetFolder(category) {
    if (category === "Git") {
      return normalizePath(this.settings.gitFolder);
    }
    if (category === "网站") {
      return normalizePath(this.settings.websiteFolder);
    }
    return normalizePath(this.settings.articleFolder);
  }

  renderAnalyzedNote({ title, url, category, tags, summary, originalBody, screenshotPaths, metadata }) {
    const safeSummary = summary || {};
    const screenshotLines = (screenshotPaths || []).flatMap((path) => ["", `![[${path}]]`]);
    const safeMetadata = metadata || {};
    const originalTitle = safeMetadata.originalTitle || title || "未命名收藏";
    const sourceUrl = safeMetadata.url || url || "";
    const pageDescription = this.composeSummaryDescription(safeSummary, safeMetadata.description || "");

    return [
      "---",
      ...(safeMetadata.captureMode ? [`capture_mode: "${this.escapeYaml(safeMetadata.captureMode)}"`] : []),
      `原始标题: "${this.escapeYaml(originalTitle)}"`,
      `链接: "${this.escapeYaml(sourceUrl)}"`,
      `作者: "${this.escapeYaml(safeMetadata.author || "")}"`,
      `发布时间: "${this.escapeYaml(safeMetadata.publishTime || "")}"`,
      `收藏时间: "${this.escapeYaml(safeMetadata.collectedAt || this.getIsoTimestamp())}"`,
      `页面描述: "${this.escapeYaml(pageDescription)}"`,
      `分类: "${this.escapeYaml(category || "")}"`,
      `标签: [${(tags || []).map((tag) => `"${this.escapeYaml(tag)}"`).join(", ")}]`,
      ...(safeMetadata.assetFolder ? [`asset_folder: "${this.escapeYaml(safeMetadata.assetFolder)}"`] : []),
      "---",
      "",
      `# ${originalTitle}`,
      "",
      "## 收藏概览",
      "",
      safeSummary.problem ? `- 问题：${safeSummary.problem}` : "",
      safeSummary.approach ? `- 方式：${safeSummary.approach}` : "",
      safeSummary.solution ? `- 解法：${safeSummary.solution}` : "",
      safeSummary.value ? `- 价值：${safeSummary.value}` : "",
      ...(screenshotLines.length > 0 ? ["", "## 网页截图", ...screenshotLines] : []),
      "",
      "## 原文内容",
      "",
      originalBody || "无原文内容"
    ]
      .filter((line, index, array) => !(line === "" && array[index - 1] === "" && array[index + 1] === ""))
      .join("\n");
  }

  composeSummaryDescription(summary, fallback) {
    const parts = [summary?.problem, summary?.approach, summary?.solution, summary?.value]
      .map((part) => String(part || "").trim())
      .filter((part) => part && part !== "待补充");
    if (parts.length > 0) {
      return parts.join("；");
    }
    return String(fallback || "").trim();
  }

  async ensureFolder(folderPath) {
    const normalized = normalizePath(folderPath);
    const exists = this.app.vault.getAbstractFileByPath(normalized);
    if (!exists) {
      await this.app.vault.createFolder(normalized);
    }
  }

  async getAvailablePath(folderPath, basename) {
    const safeBasename = this.sanitizeFileName(basename || "未命名收藏");
    let candidate = normalizePath(`${folderPath}/${safeBasename}.md`);
    let index = 1;

    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = normalizePath(`${folderPath}/${safeBasename} ${index}.md`);
      index += 1;
    }

    return candidate;
  }

  async getAvailableFolderPath(parentFolder, basename) {
    const safeBasename = this.sanitizeFileName(basename || "未命名文件夹");
    let candidate = normalizePath(`${parentFolder}/${safeBasename}`);
    let index = 1;

    while (this.app.vault.getAbstractFileByPath(candidate) || (await this.app.vault.adapter.exists(candidate))) {
      candidate = normalizePath(`${parentFolder}/${safeBasename} ${index}`);
      index += 1;
    }

    return candidate;
  }

  async getAvailableBinaryPath(folderPath, basename, extension) {
    const safeBasename = this.sanitizeFileName(basename || "未命名截图");
    let candidate = normalizePath(`${folderPath}/${safeBasename}.${extension}`);
    let index = 1;

    while (await this.app.vault.adapter.exists(candidate)) {
      candidate = normalizePath(`${folderPath}/${safeBasename} ${index}.${extension}`);
      index += 1;
    }

    return candidate;
  }

  sanitizeFileName(name) {
    return String(name || "未命名收藏")
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  decodeDataUrl(dataUrl) {
    const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (!match) {
      throw new Error("无法解析截图数据。");
    }
    return Buffer.from(match[1], "base64");
  }

  getTimestampSlug() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      "-",
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds())
    ].join("");
  }

  getIsoTimestamp() {
    return new Date().toISOString();
  }

  escapeYaml(value) {
    return String(value || "").replace(/"/g, '\\"');
  }

  truncate(value, maxLength) {
    const text = String(value || "");
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength)}\n\n[内容已截断]`;
  }

  escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  extensionFromContentType(contentType) {
    const normalized = String(contentType || "").toLowerCase();
    if (normalized.includes("png")) {
      return "png";
    }
    if (normalized.includes("webp")) {
      return "webp";
    }
    if (normalized.includes("gif")) {
      return "gif";
    }
    if (normalized.includes("jpeg") || normalized.includes("jpg")) {
      return "jpg";
    }
    return "";
  }

  extensionFromUrl(url) {
    try {
      const pathname = new URL(url).pathname.toLowerCase();
      const match = pathname.match(/\.([a-z0-9]+)$/);
      if (match && ["png", "jpg", "jpeg", "webp", "gif"].includes(match[1])) {
        return match[1] === "jpeg" ? "jpg" : match[1];
      }
    } catch (_error) {
      return "";
    }
    return "";
  }
};

class BookmarkAIAssistantSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Aegean剪藏助手设置" });

    new Setting(containerEl)
      .setName("目录初始化")
      .setDesc("给新用户准备的保存目录模板。收藏按来源归档，业务范围用专题页、资产区和标签管理。")
      .addButton((button) =>
        button
          .setButtonText("中文默认结构")
          .onClick(async () => {
            await this.plugin.applyDirectoryPreset("default");
            new Notice("已应用中文默认目录。");
            this.display();
          })
      )
      .addButton((button) =>
        button
          .setButtonText("极简 Inbox 模式")
          .onClick(async () => {
            await this.plugin.applyDirectoryPreset("simple");
            new Notice("已应用极简 Inbox 目录。");
            this.display();
          })
      );

    new Setting(containerEl)
      .setName("API 地址")
      .setDesc("兼容 OpenAI 的基础地址。留空时使用默认地址；没有 API Key 时仍可收藏和规则归档。")
      .addText((text) =>
        text
          .setPlaceholder("https://dashscope.aliyuncs.com/compatible-mode")
          .setValue(this.plugin.settings.apiBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.apiBaseUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("仅用于 AI 摘要、分类和标签。留空时插件不会读取其他插件配置。")
      .addText((text) =>
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("模型")
      .setDesc("推荐快模型，例如 qwen-flash。")
      .addText((text) =>
        text
          .setPlaceholder("qwen-flash")
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("温度")
      .setDesc("摘要和分类建议保持较低。")
      .addText((text) =>
        text
          .setPlaceholder("0.2")
          .setValue(String(this.plugin.settings.temperature))
          .onChange(async (value) => {
            const number = Number(value);
            this.plugin.settings.temperature = Number.isFinite(number) ? number : DEFAULT_SETTINGS.temperature;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("收件箱目录")
      .setDesc("浏览器收藏先统一进入这里。")
      .addText((text) =>
        text
          .setPlaceholder("00_收件箱")
          .setValue(this.plugin.settings.stagingFolder)
          .onChange(async (value) => {
            this.plugin.settings.stagingFolder = value.trim() || DEFAULT_SETTINGS.stagingFolder;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("网站目录")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.websiteFolder)
          .onChange(async (value) => {
            this.plugin.settings.websiteFolder = value.trim() || DEFAULT_SETTINGS.websiteFolder;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("文章目录")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.articleFolder)
          .onChange(async (value) => {
            this.plugin.settings.articleFolder = value.trim() || DEFAULT_SETTINGS.articleFolder;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Git 目录")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.gitFolder)
          .onChange(async (value) => {
            this.plugin.settings.gitFolder = value.trim() || DEFAULT_SETTINGS.gitFolder;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("知识专题目录")
      .setDesc("放学习方案、提示词库、新知识等业务索引页，不保存原始收藏。")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.knowledgeTopicFolder || DEFAULT_SETTINGS.knowledgeTopicFolder)
          .onChange(async (value) => {
            this.plugin.settings.knowledgeTopicFolder = value.trim() || DEFAULT_SETTINGS.knowledgeTopicFolder;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("可复用资产目录")
      .setDesc("放下次能直接拿来用的提示词、模板、SOP 和清单。")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.reusableAssetFolder || DEFAULT_SETTINGS.reusableAssetFolder)
          .onChange(async (value) => {
            this.plugin.settings.reusableAssetFolder = value.trim() || DEFAULT_SETTINGS.reusableAssetFolder;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Git 附件目录")
      .setDesc("GitHub README 里的图片和原始 HTML 会保存到这里。")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.githubAssetFolder || DEFAULT_SETTINGS.githubAssetFolder)
          .onChange(async (value) => {
            this.plugin.settings.githubAssetFolder = value.trim() || DEFAULT_SETTINGS.githubAssetFolder;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("截图附件目录")
      .setDesc("截图收藏的图片会保存到这里，并自动嵌入笔记。")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.screenshotFolder)
          .onChange(async (value) => {
            this.plugin.settings.screenshotFolder = value.trim() || DEFAULT_SETTINGS.screenshotFolder;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("本地接收地址")
      .setDesc("浏览器收藏插件会把内容发送到这个本地服务。修改后请重启 Obsidian。")
      .addText((text) =>
        text
          .setPlaceholder("127.0.0.1")
          .setValue(this.plugin.settings.serverHost)
          .onChange(async (value) => {
            this.plugin.settings.serverHost = value.trim() || DEFAULT_SETTINGS.serverHost;
            await this.plugin.saveSettings();
          })
      )
      .addText((text) =>
        text
          .setPlaceholder("27124")
          .setValue(String(this.plugin.settings.serverPort))
          .onChange(async (value) => {
            const port = Number(value);
            this.plugin.settings.serverPort = Number.isFinite(port) ? port : DEFAULT_SETTINGS.serverPort;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("标签池")
      .setDesc("用中文逗号分隔。AI 只会从这里挑 1 到 3 个标签。")
      .addTextArea((text) =>
        text
          .setValue(this.plugin.settings.tagPool.join("，"))
          .onChange(async (value) => {
            this.plugin.settings.tagPool = value
              .split(/[，,]/)
              .map((item) => item.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    const note = containerEl.createDiv({ cls: "bookmark-ai-assistant-setting-note" });
    note.setText("命令面板里可直接使用“分析当前收藏并归档”和“批量分析收件箱收藏”。");
  }
}
