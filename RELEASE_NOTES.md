# Aegean剪藏助手 v0.2.2

## 包含内容

- Obsidian 插件：`obsidian-plugin/bookmark-ai-assistant`
- 浏览器插件：`browser-extension/browser-capture-extension`
- 浏览器插件使用说明：`browser-extension/README-browser-extension.md`
- Obsidian 插件使用说明：`obsidian-plugin/README-obsidian-plugin.md`
- 安装说明：`docs/install.md`
- 功能说明书：`docs/feature-guide.md`
- AI Agent 安装技能：`skills/aegean-obsidian-ai-clipper-installer`
- 开源 README：`README.md`
- 许可证：`LICENSE`
- 隐私说明：`PRIVACY.md`
- 安全说明：`SECURITY.md`
- 开源审计说明：`OPEN_SOURCE_AUDIT.md`

## 新增能力

- 首次启用 Obsidian 插件时，自动创建 `00_收件箱/使用说明/`。
- 自动写入三份新手说明：
  - `00_首次使用检查清单.md`
  - `01_浏览器插件怎么用.md`
  - `02_Obsidian插件怎么用.md`
- 批量整理收件箱时，明确跳过 `00_收件箱/使用说明/`，避免说明文件被移动。
- 发布包拆分浏览器插件说明和 Obsidian 插件说明，方便分发给新用户。
- 发布包内部说明文件名使用 ASCII，降低跨平台解压后文件名乱码的风险。
- 补齐开源发布文件：完整中文 README、MIT License、隐私说明、安全说明和 `.gitignore`。
- 补充开源审计说明，记录本次未发现个人路径、真实密钥、本地配置或 vault 内容。
- 新增 `aegean-obsidian-ai-clipper-installer` skill，方便 Codex、Claude Code、OpenClaw 按说明从 GitHub 下载并安装插件。

## 默认整理目录

- 新收藏：`00_收件箱/`
- 网站类：`01_网站/`
- 文章类：`02_文章/`
- Git 类：`03_Git/`

## 隐私说明

本发布包不包含个人笔记、不包含本地 API Key、不包含 Obsidian 插件的 `data.json` 本地配置文件。
