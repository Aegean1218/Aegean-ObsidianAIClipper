# Aegean剪藏助手

Aegean剪藏助手是一套面向 Obsidian 用户的本地网页剪藏工具。它由 Chrome 浏览器扩展和 Obsidian 插件两部分组成，可以把网页正文、公众号文章、GitHub 项目和网页截图保存到当前 Obsidian 笔记库，并按网站、文章、Git 等来源类型整理。

## 核心特点

- 本地优先：浏览器扩展把内容发送到本机正在运行的 Obsidian 插件。
- 双插件协作：浏览器扩展负责提取网页内容，Obsidian 插件负责接收、保存和整理。
- 无 API Key 可用：不配置 AI 也可以正常收藏和按基础规则归档。
- 可选 AI 增强：配置 API Key 后，可以自动生成摘要、分类、标签和文件名建议。
- 新手友好：首次启用 Obsidian 插件后，会自动在收件箱中生成使用说明。
- 隐私边界清晰：发布包不包含个人笔记、不包含本地配置、不包含 API Key。

## 项目组成

```text
.
├── browser-extension/
│   ├── browser-capture-extension/      # Chrome 浏览器扩展本体
│   └── README-browser-extension.md     # 浏览器扩展使用说明
├── obsidian-plugin/
│   ├── bookmark-ai-assistant/          # Obsidian 插件本体
│   └── README-obsidian-plugin.md       # Obsidian 插件使用说明
├── docs/
│   ├── install.md                      # 安装说明
│   └── feature-guide.md                # 功能说明
├── skills/
│   └── aegean-obsidian-ai-clipper-installer/
│       └── SKILL.md                    # 给 Codex / Claude Code / OpenClaw 使用的安装技能
├── README.md
├── RELEASE_NOTES.md
├── PRIVACY.md
├── SECURITY.md
├── OPEN_SOURCE_AUDIT.md
├── .gitignore
└── LICENSE
```

## 安装方式

### AI Agent 辅助安装

如果你正在使用 Codex、Claude Code 或 OpenClaw，可以把下面这个目录复制到对应工具的 skills 目录中：

```text
skills/aegean-obsidian-ai-clipper-installer
```

然后对 AI Agent 说：

```text
请使用 aegean-obsidian-ai-clipper-installer 帮我安装 Aegean剪藏助手。
```

它会从公开 GitHub 仓库下载最新版本，把 Obsidian 插件安装到你指定的 Obsidian 笔记库，并把浏览器扩展准备到下载目录。浏览器扩展仍需要你在 Chrome 或 Edge 的扩展管理页中手动点击“加载已解压的扩展程序”，这是浏览器的安全限制。

### 1. 安装 Obsidian 插件

1. 打开你的 Obsidian 笔记库文件夹，也就是存放所有笔记的文件夹。
2. 进入 `.obsidian/plugins/`。
3. 如果没有 `plugins` 文件夹，就手动新建一个。
4. 把下面这个文件夹复制进去：

```text
obsidian-plugin/bookmark-ai-assistant
```

5. 打开 Obsidian。
6. 进入 `设置 -> 第三方插件`。
7. 启用第三方插件。
8. 启用 `Aegean剪藏助手`。

首次启用后，插件会在当前笔记库中创建：

```text
00_收件箱/
└── 使用说明/
    ├── 00_首次使用检查清单.md
    ├── 01_浏览器插件怎么用.md
    └── 02_Obsidian插件怎么用.md
```

### 2. 安装 Chrome 浏览器扩展

1. 打开 Chrome。
2. 进入 `chrome://extensions/`。
3. 打开右上角 `开发者模式`。
4. 点击 `加载已解压的扩展程序`。
5. 选择下面这个文件夹：

```text
browser-extension/browser-capture-extension
```

6. 把 `Obsidian 收藏助手` 固定到浏览器工具栏。

### 3. 确认连接

1. 先打开 Obsidian。
2. 确认 `Aegean剪藏助手` 已启用。
3. 打开浏览器扩展面板。
4. 点击 `重新检测`。
5. 看到 `Obsidian 已连接` 后即可开始收藏。

## 可以收藏什么

### 正文收藏

适合教程、博客、产品介绍、经验分享、长文资料。会保存标题、链接、页面描述、正文和收藏时间。

### 公众号文章

适合保存微信公众号文章。会尽量保留正文顺序、图片和富文本层级。

### GitHub 项目

适合保存开源项目和工具库。会保存仓库信息、README 内容、README 图片和原始 HTML 备份。

### 截图收藏

适合工具站、管理后台、设计参考页、临时状态页。会保存当前网页可见区域截图。

## 默认目录

新收藏会先进入：

```text
00_收件箱/
```

在 Obsidian 中点击 `批量分析收件箱收藏` 后，收藏会按来源类型移动到：

```text
01_网站/
02_文章/
03_Git/
```

说明文件所在的目录会被自动跳过：

```text
00_收件箱/使用说明/
```

## AI 配置

不配置 API Key 时，仍然可以：

- 收藏网页正文
- 收藏公众号文章
- 收藏 GitHub 项目
- 收藏网页截图
- 保存图片和附件
- 按基础规则归档

如果希望自动生成摘要、分类、标签和文件名建议，可以在 Obsidian 插件设置中填写：

- API 地址
- API Key
- 模型名称

插件不会读取其他 Obsidian 插件里的 API Key。用户的 API Key 会保存在自己本地 Obsidian 插件配置中，不应提交到开源仓库。

## 隐私说明

这个项目默认只在本机工作：

- 浏览器扩展连接本机地址 `http://127.0.0.1:27124`。
- Obsidian 插件在本机接收内容并写入当前笔记库。
- 不配置 API Key 时，不会调用 AI 服务。
- 配置 API Key 后，只有在执行 AI 分析时，才会把需要分析的文本发送到用户配置的 API 服务。
- 发布包不包含个人笔记、不包含附件、不包含本地 API Key、不包含 `data.json`。

更详细的隐私边界见 `PRIVACY.md`。

本次发布前的开源检查结论见 `OPEN_SOURCE_AUDIT.md`。

## 开发与验证

本项目当前是纯 JavaScript 插件，没有构建步骤。修改后建议运行：

```bash
node --check "obsidian-plugin/bookmark-ai-assistant/main.js"
node --check "browser-extension/browser-capture-extension/popup.js"
```

在 Aegean 原始维护仓库中还有回归测试：

```bash
node "90_系统资料/插件/tests/capture-plugin.test.js"
```

## 开源边界

建议公开发布本目录，而不是公开整个 Obsidian 笔记库。不要提交：

- 个人笔记
- 收件箱内容
- 附件目录
- `.obsidian/plugins/bookmark-ai-assistant/data.json`
- `.env`
- API Key
- 本机绝对路径

## 许可证

本项目使用 MIT License，见 `LICENSE`。
