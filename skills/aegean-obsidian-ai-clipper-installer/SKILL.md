---
name: aegean-obsidian-ai-clipper-installer
description: Use when installing, updating, downloading, or setting up Aegean-ObsidianAIClipper, Aegean剪藏助手, Obsidian 收藏助手, the bookmark-ai-assistant Obsidian plugin, or its Chrome/Edge browser extension from GitHub into a user's Obsidian vault.
---

# Aegean ObsidianAIClipper Installer

## Overview

Install Aegean剪藏助手 from the public GitHub repository into a user's local Obsidian vault, and prepare the companion browser extension for manual loading in Chrome or Edge.

Repository: `https://github.com/Aegean1218/Aegean-ObsidianAIClipper`

## Installation Rules

- Treat the GitHub repository as the source of truth; do not depend on the maintainer's local vault paths.
- Install only the Obsidian plugin files under `obsidian-plugin/bookmark-ai-assistant/`.
- Do not create or copy `data.json`, API keys, `.env`, personal notes, or browser profile data.
- Never guess between multiple Obsidian vaults. If more than one plausible vault is found and the user did not name one, ask which vault to use.
- Browser extensions cannot be silently installed by a local agent. Download and prepare the extension folder, then open or point the user to the browser's `extensions` page for manual loading.

## Quick Workflow

1. Find the target Obsidian vault.
2. Download the latest repository snapshot.
3. Copy `obsidian-plugin/bookmark-ai-assistant/` into `<vault>/.obsidian/plugins/bookmark-ai-assistant/`.
4. Prepare `browser-extension/browser-capture-extension/` in a user-visible folder, preferably `~/Downloads/Aegean-ObsidianAIClipper/browser-extension/browser-capture-extension`.
5. Verify required files exist.
6. Tell the user to enable `Aegean剪藏助手` in Obsidian and load the unpacked browser extension.

## Find the Vault

Use this order:

1. If the user provided a path, use that path after confirming it contains or can contain `.obsidian/`.
2. If the current working directory contains `.obsidian/`, use the current directory.
3. On macOS, search common Obsidian locations:

```bash
find "$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents" "$HOME/Documents" -maxdepth 3 -type d -name ".obsidian" 2>/dev/null
```

4. On Linux or Windows shell environments, search the user's home directory at shallow depth:

```bash
find "$HOME" -maxdepth 4 -type d -name ".obsidian" 2>/dev/null
```

The vault path is the parent directory of `.obsidian`.

## Download Source

Prefer a temporary working directory:

```bash
workdir="$(mktemp -d)"
cd "$workdir"
curl -L -o aegean-clipper.zip "https://github.com/Aegean1218/Aegean-ObsidianAIClipper/archive/refs/heads/main.zip"
unzip -q aegean-clipper.zip
src="$workdir/Aegean-ObsidianAIClipper-main"
```

If `curl` or `unzip` is unavailable but `git` exists:

```bash
workdir="$(mktemp -d)"
git clone --depth 1 "https://github.com/Aegean1218/Aegean-ObsidianAIClipper.git" "$workdir/Aegean-ObsidianAIClipper"
src="$workdir/Aegean-ObsidianAIClipper"
```

Before installing, verify:

```bash
test -f "$src/obsidian-plugin/bookmark-ai-assistant/manifest.json"
test -f "$src/obsidian-plugin/bookmark-ai-assistant/main.js"
test -f "$src/browser-extension/browser-capture-extension/manifest.json"
```

## Install Obsidian Plugin

Set `vault` to the chosen Obsidian vault path, then run:

```bash
plugin_dir="$vault/.obsidian/plugins/bookmark-ai-assistant"
mkdir -p "$vault/.obsidian/plugins"
rm -rf "$plugin_dir"
cp -R "$src/obsidian-plugin/bookmark-ai-assistant" "$plugin_dir"
```

Verify:

```bash
test -f "$plugin_dir/manifest.json"
test -f "$plugin_dir/main.js"
test -f "$plugin_dir/styles.css"
```

If Node.js is available, also run:

```bash
node --check "$plugin_dir/main.js"
```

## Prepare Browser Extension

Copy the unpacked browser extension to a stable folder:

```bash
target="$HOME/Downloads/Aegean-ObsidianAIClipper/browser-extension"
mkdir -p "$target"
rm -rf "$target/browser-capture-extension"
cp -R "$src/browser-extension/browser-capture-extension" "$target/browser-capture-extension"
```

Verify:

```bash
test -f "$target/browser-capture-extension/manifest.json"
test -f "$target/browser-capture-extension/popup.js"
```

If Node.js is available, also run:

```bash
node --check "$target/browser-capture-extension/popup.js"
```

Then tell the user:

- Chrome: open `chrome://extensions/`, enable Developer mode, choose "Load unpacked", and select `~/Downloads/Aegean-ObsidianAIClipper/browser-extension/browser-capture-extension`.
- Edge: open `edge://extensions/`, enable Developer mode, choose "Load unpacked", and select the same folder.

Open the extension page only if the environment supports browser automation or `open`:

```bash
open "chrome://extensions/" 2>/dev/null || true
```

## Final User Handoff

After installation, give the user only the essential next steps:

1. Restart or reload Obsidian.
2. Go to `设置 -> 第三方插件`, enable community plugins, then enable `Aegean剪藏助手`.
3. Load the unpacked browser extension from the prepared folder.
4. Keep Obsidian open, click the browser extension's `重新检测`, and confirm it shows `Obsidian 已连接`.

Mention the exact vault path and browser extension folder used.
