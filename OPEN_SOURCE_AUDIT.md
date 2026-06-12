# 开源发布审计说明

审计日期：2026-06-12

## 审计范围

本次审计范围是：

```text
v0.2.2/
```

也就是当前开源发布包目录，不包含整个 Obsidian 笔记库。

## 已确认不包含

- 个人笔记内容
- `00_收件箱/` 实际收藏内容
- `01_网站/`、`02_文章/`、`03_Git/` 实际收藏内容
- 图片附件目录
- 外部目录挂载清单
- `.obsidian/plugins/bookmark-ai-assistant/data.json`
- `.env`
- API Key
- 本机绝对路径
- 固定到个人 vault 的 Obsidian 链接

## 扫描说明

本次扫描重点检查了：

- 本机绝对路径
- 常见密钥形态
- `.env`、`data.json`、证书和私钥文件
- 个人 vault 内容目录
- 附件目录

扫描中出现的以下内容属于产品正常配置或说明，不是泄露：

- `127.0.0.1` / `localhost`：浏览器扩展连接本机 Obsidian 插件服务所需。
- `apiKey`：代码变量名和用户配置说明。
- `Authorization: Bearer ${apiKey}`：运行时使用用户自己填写的 API Key。
- `https://dashscope.aliyuncs.com/compatible-mode`：默认 API 地址，不含密钥。
- `qwen-flash`：默认模型名称，不含密钥。

## 后续发布建议

如果继续修改后再公开发布，请重新检查：

- 是否误加入 `data.json`
- 是否误加入个人笔记或附件
- 是否出现本机绝对路径
- 是否出现真实 API Key
- 是否出现临时调试文件
