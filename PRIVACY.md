# 隐私说明

Aegean剪藏助手是本地优先的 Obsidian 剪藏工具。

## 默认情况下

- 浏览器扩展只连接本机 Obsidian 插件服务。
- 默认连接地址是 `http://127.0.0.1:27124`。
- Obsidian 插件把收藏内容写入当前用户自己的 Obsidian 笔记库。
- 不配置 API Key 时，不会调用 AI 服务。

## 配置 AI 后

如果用户在 Obsidian 插件设置中填写 API 地址、API Key 和模型名称，插件会在执行 AI 分析时，把需要分析的收藏文本发送到用户配置的 API 服务。

插件不会读取其他 Obsidian 插件里的 API Key，也不会内置任何 API Key。

## 本发布包不包含

- 个人笔记
- 收件箱内容
- 图片附件
- 用户 API Key
- `.obsidian/plugins/bookmark-ai-assistant/data.json`
- `.env`
- 本机绝对路径

## 建议

如果你基于本项目二次分发，请不要把自己的 Obsidian 笔记库、插件配置、API Key 或附件目录一起提交。
