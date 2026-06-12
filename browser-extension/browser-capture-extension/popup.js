const DEFAULT_API_BASE = "http://127.0.0.1:27124";

const statusEl = document.getElementById("status");
const saveTextButton = document.getElementById("saveText");
const saveWechatButton = document.getElementById("saveWechat");
const saveGithubButton = document.getElementById("saveGithub");
const saveScreenshotButton = document.getElementById("saveScreenshot");
const serverUrlInput = document.getElementById("serverUrl");
const saveServerButton = document.getElementById("saveServer");
const checkConnectionButton = document.getElementById("checkConnection");
const connectionSettingsEl = document.querySelector(".connection-settings");
const connectionTitleEl = document.getElementById("connectionTitle");
const connectionHelpEl = document.getElementById("connectionHelp");

let apiBase = DEFAULT_API_BASE;

saveTextButton?.addEventListener("click", () => runCapture("text"));
saveWechatButton?.addEventListener("click", () => runCapture("wechat"));
saveGithubButton?.addEventListener("click", () => runCapture("github"));
saveScreenshotButton?.addEventListener("click", () => runCapture("screenshot"));
saveServerButton?.addEventListener("click", saveServerUrl);
checkConnectionButton?.addEventListener("click", checkConnection);

loadServerUrl();

async function loadServerUrl() {
  const stored = await chrome.storage.sync.get({ apiBase: DEFAULT_API_BASE });
  apiBase = normalizeApiBase(stored.apiBase || DEFAULT_API_BASE);
  if (serverUrlInput) {
    serverUrlInput.value = apiBase;
  }
  await checkConnection({ silent: true });
}

async function saveServerUrl() {
  apiBase = normalizeApiBase(serverUrlInput?.value || DEFAULT_API_BASE);
  await chrome.storage.sync.set({ apiBase });
  if (serverUrlInput) {
    serverUrlInput.value = apiBase;
  }
  await checkConnection();
}

function normalizeApiBase(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_API_BASE;
}

async function checkConnection(options = {}) {
  try {
    const response = await fetch(`${apiBase}/health`, { method: "GET", cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error("health check failed");
    }
    setConnectionState(
      "connected",
      "Obsidian 已连接",
      "可以开始收藏。正常情况下不用修改高级设置。"
    );
    if (!options.silent) {
      setStatus("连接正常，可以开始收藏。", "success");
    }
  } catch (_error) {
    setConnectionState(
      "disconnected",
      "还没连接到 Obsidian",
      "请先打开 Obsidian，并确认 Aegean剪藏助手已启用。"
    );
    if (!options.silent) {
      setStatus("未连接到 Obsidian，请确认插件已启用。", "error");
    }
  }
}

function setConnectionState(state, title, help) {
  if (connectionSettingsEl) {
    connectionSettingsEl.classList.toggle("is-connected", state === "connected");
    connectionSettingsEl.classList.toggle("is-disconnected", state === "disconnected");
  }
  if (connectionTitleEl) {
    connectionTitleEl.textContent = title;
  }
  if (connectionHelpEl) {
    connectionHelpEl.textContent = help;
  }
}

async function runCapture(mode) {
  setBusy(true);
  const statusMessage = {
    text: "正在提取正文并发送到 Obsidian...",
    wechat: "正在完整保存公众号正文和图片...",
    github: "正在保存 GitHub README 和图片...",
    screenshot: "正在截图并发送到 Obsidian..."
  };
  setStatus(statusMessage[mode] || "正在发送到 Obsidian...");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) {
      throw new Error("没有找到当前网页。");
    }

    if (mode === "text") {
      const payload = await buildTextPayload(tab);
      await postJson("/capture/text", payload);
      setStatus("正文收藏已进入 Obsidian 收件箱。点击页面后面板会收起。", "success");
      return;
    }

    if (mode === "wechat") {
        const payload = await buildWechatPayload(tab);
      try {
        await postJson("/capture/wechat", payload);
      } catch (error) {
        if (error?.status === 404 || String(error?.message || "").includes("未找到接口")) {
          throw new Error("Aegean剪藏助手还没加载公众号接口。请重启 Obsidian，或关闭再启用插件。");
        }
        await postJson("/capture/text", {
          title: payload.title,
          url: payload.url,
          description: payload.description,
          content: renderWechatFallbackMarkdown(payload)
        });
        setStatus("完整保存失败，已先按 Markdown 正文收藏。", "success");
        return;
      }
      setStatus("公众号文章收藏已进入 Obsidian 收件箱。点击页面后面板会收起。", "success");
      return;
    }

    if (mode === "github") {
      const payload = await buildGithubPayload(tab);
      try {
        await postJson("/capture/github", payload);
      } catch (error) {
        if (error?.status === 404 || String(error?.message || "").includes("未找到接口")) {
          throw new Error("Aegean剪藏助手还没加载 GitHub 收藏接口。请重启 Obsidian，或关闭再启用插件。");
        }
        throw error;
      }
      setStatus("GitHub 项目已进入 Obsidian 收件箱。点击页面后面板会收起。", "success");
      return;
    }

    const payload = await buildScreenshotPayload(tab);
    await postJson("/capture/screenshot", payload);
    setStatus("截图收藏已进入 Obsidian 收件箱。点击页面后面板会收起。", "success");
  } catch (error) {
    console.error(error);
    setStatus(formatErrorMessage(error), "error");
  } finally {
    setBusy(false);
  }
}

function formatErrorMessage(error) {
  const message = error?.message || "保存失败，请确认 Obsidian 已打开。";
  if (message.includes("Cannot access contents of url") || message.includes("The extensions gallery cannot be scripted")) {
    return "当前页面不允许插件读取。若是本地文件，请在 Chrome 扩展详情里开启“允许访问文件网址”。";
  }
  return message;
}

async function buildWechatPayload(tab) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: runExtractor,
    args: ["wechat"]
  });
  const meta = normalizePageMeta(result, tab, "未命名公众号文章");
  const blocks = Array.isArray(result?.blocks) ? result.blocks : [];
  const hasText = blocks.some((block) => block.type === "text" && normalizeText(block.text));
  const hasImage = blocks.some((block) => block.type === "image" && block.url);
  if (!hasText && !hasImage) {
    throw new Error("没有提取到公众号正文或图片。请确认当前页是文章正文页。");
  }
  const payload = {
    ...meta,
    account: result?.account || "",
    author: result?.author || "",
    publishTime: result?.publishTime || "",
    html: result?.html || "",
    blocks
  };
  await hydrateWechatImageData(payload.blocks);
  return payload;
}

async function hydrateWechatImageData(blocks) {
  const imageBlocks = (Array.isArray(blocks) ? blocks : []).filter((block) => block?.type === "image" && block.url && !block.dataUrl);
  for (const block of imageBlocks) {
    block.dataUrl = await fetchImageDataUrl(block.url);
  }
}

async function fetchImageDataUrl(url) {
  try {
    const response = await fetch(url, {
      credentials: "include",
      cache: "force-cache",
      referrerPolicy: "no-referrer-when-downgrade"
    });
    if (!response.ok) {
      return "";
    }
    const blob = await response.blob();
    if (!String(blob.type || "").startsWith("image/")) {
      return "";
    }
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch (_error) {
    return "";
  }
}

async function buildGithubPayload(tab) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: runExtractor,
    args: ["github"]
  });
  const meta = normalizePageMeta(result, tab, "未命名 GitHub 项目");
  const blocks = Array.isArray(result?.blocks) ? result.blocks : [];
  const hasContent = blocks.some((block) => block.type === "text" && normalizeText(block.text)) || blocks.some((block) => block.type === "image" && block.url);
  if (!result?.owner || !result?.repo || !String(meta.url || "").includes("github.com/")) {
    throw new Error("请在 GitHub 仓库首页使用 GitHub 项目收藏。");
  }
  if (!hasContent) {
    throw new Error("没有提取到 README 内容。请确认当前页是 GitHub 仓库页面。");
  }
  return {
    ...meta,
    owner: result.owner || "",
    repo: result.repo || "",
    stars: result.stars || "",
    forks: result.forks || "",
    language: result.language || "",
    license: result.license || "",
    topics: Array.isArray(result.topics) ? result.topics : [],
    html: result.html || "",
    blocks
  };
}

async function buildTextPayload(tab) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: runExtractor,
    args: ["text"]
  });
  const meta = normalizePageMeta(result, tab, "未命名收藏");
  const content = normalizeText(result?.content);
  if (!content) {
    throw new Error("没有提取到正文内容。这个页面可以改用截图收藏。");
  }
  return {
    ...meta,
    content
  };
}

async function buildScreenshotPayload(tab) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: runExtractor,
    args: ["meta"]
  });
  const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const meta = normalizePageMeta(result, tab, "未命名截图收藏");
  return {
    ...meta,
    imageDataUrl
  };
}

function normalizePageMeta(result, tab, fallbackTitle) {
  return {
    title: result?.title || tab.title || fallbackTitle,
    url: result?.url || tab.url || "",
    description: result?.description || ""
  };
}

function normalizeText(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

async function postJson(path, payload) {
  try {
    return await postJsonOnce(path, payload);
  } catch (error) {
    if (isObsidianUnavailableError(error)) {
      throw new Error("请先打开 Obsidian 后再使用插件。");
    }
    throw error;
  }
}

async function postJsonOnce(path, payload) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || "发送到 Obsidian 失败。");
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function isObsidianUnavailableError(error) {
  if (error?.status) {
    return false;
  }
  const message = String(error?.message || error || "");
  return /failed to fetch|load failed|networkerror|err_connection_refused|err_failed/i.test(message);
}

  function renderWechatFallbackMarkdown(payload) {
  const lines = [];
  if (payload.account) {
    lines.push(`公众号：${payload.account}`, "");
  }
  if (payload.author) {
    lines.push(`作者：${payload.author}`, "");
  }
  if (payload.publishTime) {
    lines.push(`发布时间：${payload.publishTime}`, "");
  }
  lines.push("收藏模式：公众号 Markdown 兜底", "");

  for (const block of payload.blocks || []) {
    if (block?.type === "text" && normalizeText(block.text)) {
      lines.push(String(block.html || "").trim() || normalizeText(block.text), "");
      continue;
    }
    if (block?.type === "image" && block.url) {
      lines.push(`![${block.alt || "图片"}](${block.url})`, "");
    }
  }

  return lines.join("\n").trim();
}

function setBusy(busy) {
  if (saveTextButton) {
    saveTextButton.disabled = busy;
  }
  if (saveWechatButton) {
    saveWechatButton.disabled = busy;
  }
  if (saveGithubButton) {
    saveGithubButton.disabled = busy;
  }
  if (saveScreenshotButton) {
    saveScreenshotButton.disabled = busy;
  }
}

function setStatus(message, tone = "") {
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.classList.toggle("success", tone === "success");
    statusEl.classList.toggle("error", tone === "error");
  }
}

function runExtractor(mode) {
  function normalizeText(value) {
    return String(value || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  function extractVisibleText(root) {
    if (!root) {
      return "";
    }
    const directText = root.innerText || root.textContent || "";
    if (directText.trim()) {
      return directText;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const parts = [];
    let current;
    while ((current = walker.nextNode())) {
      const text = normalizeText(current.nodeValue);
      if (text) {
        parts.push(text);
      }
    }
    return parts.join("\n\n");
  }

  function toAbsoluteUrl(url) {
    try {
      return new URL(url, window.location.href).href;
    } catch (_error) {
      return url;
    }
  }

  function getElementImageUrl(element) {
    const direct =
      element.getAttribute("data-src") ||
      element.getAttribute("data-original") ||
      element.getAttribute("data-backsrc") ||
      element.getAttribute("data-croporisrc");
    if (direct) {
      return toAbsoluteUrl(direct);
    }

    const style = element.getAttribute("style") || "";
    const match = style.match(/background(?:-image)?\s*:\s*url\((['"]?)(.*?)\1\)/i);
    return match?.[2] ? toAbsoluteUrl(match[2]) : "";
  }

  function getImageUrl(image) {
    const candidates = [
      image.getAttribute("data-src"),
      image.getAttribute("data-original"),
      image.getAttribute("data-backsrc"),
      image.getAttribute("data-croporisrc"),
      image.currentSrc,
      image.getAttribute("src")
    ];
    const url = candidates.find((value) => value && !value.startsWith("data:image/svg"));
    return url ? toAbsoluteUrl(url) : "";
  }

  function sanitizeStyleValue(value) {
    return String(value || "")
      .replace(/url\([^)]*\)/gi, "")
      .replace(/expression\([^)]*\)/gi, "")
      .trim();
  }

  function sanitizeRichHtml(element) {
    if (!element?.cloneNode) {
      return "";
    }

    const clone = element.cloneNode(true);
    clone.querySelectorAll("script,style,noscript,svg,canvas,video,audio,img").forEach((node) => node.remove());

    const nodes = [clone, ...clone.querySelectorAll("*")];
    for (const node of nodes) {
      for (const attribute of [...node.attributes]) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value || "";
        if (name.startsWith("on") || name === "contenteditable") {
          node.removeAttribute(attribute.name);
          continue;
        }
        if (name === "href" && /^\s*javascript:/i.test(value)) {
          node.removeAttribute(attribute.name);
          continue;
        }
        if (name === "style") {
          const safeStyle = sanitizeStyleValue(value);
          if (safeStyle) {
            node.setAttribute("style", safeStyle);
          } else {
            node.removeAttribute("style");
          }
          continue;
        }
        if (!["class", "style", "href", "title", "alt", "target", "rel"].includes(name)) {
          node.removeAttribute(attribute.name);
        }
      }
    }

    return clone.outerHTML.trim();
  }

  function flushTextBlock(blocks, textBuffer, htmlBuffer, seenTexts) {
    const text = normalizeText(textBuffer.join(""));
    if (!text || seenTexts.has(text)) {
      return;
    }
    seenTexts.add(text);
    blocks.push({
      type: "text",
      text,
      html: htmlBuffer.filter(Boolean).join("\n")
    });
  }

  function collectLooseImages(root, seenImages) {
    const urls = [];
    const candidates = root.querySelectorAll("img,[data-src],[data-original],[data-backsrc],[data-croporisrc],[style*='background']");
    for (const element of candidates) {
      const url = element.tagName === "IMG" ? getImageUrl(element) : getElementImageUrl(element);
      if (url && !seenImages.has(url)) {
        seenImages.add(url);
        urls.push(url);
      }
    }
    return urls;
  }

  function getTextBlockContainer(node) {
    const element = node.parentElement;
    return element?.closest("h1,h2,h3,h4,h5,h6,p,blockquote,li,pre,table,ul,ol,dl,section,div") || element || node;
  }

  function extractPageMeta() {
    const description =
      document.querySelector('meta[name="description"]')?.content?.trim() ||
      document.querySelector('meta[property="og:description"]')?.content?.trim() ||
      "";

    return {
      title: document.title || "未命名收藏",
      url: window.location.href,
      description
    };
  }

  function extractPageContent() {
    const meta = extractPageMeta();
    const candidates = [
      document.querySelector("#js_content"),
      document.querySelector("#img-content"),
      document.querySelector(".rich_media_content"),
      document.querySelector("article"),
      document.querySelector("main"),
      document.querySelector('[role="main"]'),
      document.querySelector(".article"),
      document.querySelector(".post"),
      document.querySelector(".content"),
      document.body
    ].filter(Boolean);

    const rawText = candidates
      .map((element) => extractVisibleText(element))
      .sort((a, b) => b.length - a.length)[0] || "";

    return {
      title: meta.title,
      url: meta.url,
      description: meta.description,
      content: rawText.slice(0, 30000)
    };
  }

  function extractContentBlocks(root) {
    const blocks = [];
    const seenImages = new Set();
    const seenTexts = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          return normalizeText(node.nodeValue).length >= 2 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }

        const tagName = node.tagName;
        if (["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "CANVAS", "VIDEO", "AUDIO"].includes(tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (tagName === "IMG" || getElementImageUrl(node)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    });

    let current;
    let textBuffer = [];
    let htmlBuffer = [];
    const htmlContainers = new Set();
    let lastTextContainer = null;
    while ((current = walker.nextNode())) {
      if (current.nodeType === Node.TEXT_NODE) {
        const text = normalizeText(current.nodeValue);
        if (text) {
          const textContainer = getTextBlockContainer(current);
          if (lastTextContainer && textContainer !== lastTextContainer && textBuffer.length > 0) {
            textBuffer.push("\n\n");
          }
          if (textContainer?.nodeType === Node.ELEMENT_NODE && !htmlContainers.has(textContainer)) {
            const richHtml = sanitizeRichHtml(textContainer);
            if (richHtml) {
              htmlBuffer.push(richHtml);
              htmlContainers.add(textContainer);
            }
          }
          textBuffer.push(text);
          lastTextContainer = textContainer;
        }
        continue;
      }

      const url = current.tagName === "IMG" ? getImageUrl(current) : getElementImageUrl(current);
      if (url) {
        flushTextBlock(blocks, textBuffer, htmlBuffer, seenTexts);
        textBuffer = [];
        htmlBuffer = [];
        htmlContainers.clear();
        lastTextContainer = null;
        if (!seenImages.has(url)) {
          seenImages.add(url);
          blocks.push({
            type: "image",
            url,
            alt: current.getAttribute("alt") || current.getAttribute("data-w") || ""
          });
        }
      }
    }

    collectLooseImages(root, seenImages).forEach((url) => {
      flushTextBlock(blocks, textBuffer, htmlBuffer, seenTexts);
      textBuffer = [];
      htmlBuffer = [];
      htmlContainers.clear();
      blocks.push({
        type: "image",
        url,
        alt: ""
      });
    });
    flushTextBlock(blocks, textBuffer, htmlBuffer, seenTexts);

    if (!blocks.some((block) => block.type === "text")) {
      const fallbackText = normalizeText(extractVisibleText(root) || extractVisibleText(document.body));
      if (fallbackText) {
        blocks.unshift({
          type: "text",
          text: fallbackText
        });
      }
    }

    return blocks;
  }

  function extractWechatContent() {
    const meta = extractPageMeta();
    const root =
      document.querySelector("#js_content") ||
      document.querySelector(".rich_media_content") ||
      document.querySelector("article") ||
      document.querySelector("main") ||
      document.body;
    let blocks = extractContentBlocks(root);
    if (blocks.length === 0 && root !== document.body) {
      blocks = extractContentBlocks(document.body);
    }

    return {
      title: meta.title,
      url: meta.url,
      description: meta.description,
      account: normalizeText(document.querySelector("#js_name")?.innerText || document.querySelector("#js_name")?.textContent || ""),
      author: normalizeText(document.querySelector("#js_author_name")?.innerText || document.querySelector("#js_author_name")?.textContent || ""),
      publishTime: normalizeText(document.querySelector("#publish_time")?.innerText || document.querySelector("#publish_time")?.textContent || ""),
      html: root.outerHTML || "",
      blocks
    };
  }

  function parseGitHubRepoFromUrl() {
    try {
      const url = new URL(window.location.href);
      if (url.hostname === "github.com") {
        const [owner, repo] = url.pathname.split("/").filter(Boolean);
        return { owner: owner || "", repo: repo || "" };
      }
    } catch (_error) {
      // Fall through to DOM-based detection.
    }
    const repoLink = document.querySelector('strong[itemprop="name"] a[href^="/"]') || document.querySelector('a[href^="/"][href*="/"]');
    const [owner, repo] = String(repoLink?.getAttribute("href") || "").split("/").filter(Boolean);
    return { owner: owner || "", repo: repo || "" };
  }

  function queryText(selectors) {
    for (const selector of selectors) {
      const value = normalizeText(document.querySelector(selector)?.innerText || document.querySelector(selector)?.textContent || "");
      if (value) {
        return value;
      }
    }
    return "";
  }

  function queryAllTexts(selector) {
    return [...document.querySelectorAll(selector)]
      .map((element) => normalizeText(element.innerText || element.textContent || ""))
      .filter(Boolean);
  }

  function extractGithubCount(hrefPart) {
    const link = [...document.querySelectorAll("a[href]")].find((element) => String(element.getAttribute("href") || "").includes(hrefPart));
    return normalizeText(link?.innerText || link?.textContent || "").split(/\s+/)[0] || "";
  }

  function collectImagesFromElement(element, seenImages) {
    const candidates = element.tagName === "IMG" ? [element] : [...element.querySelectorAll("img,[data-src],[data-original],[data-backsrc],[data-croporisrc]")];
    return candidates
      .map((candidate) => ({
        url: candidate.tagName === "IMG" ? getImageUrl(candidate) : getElementImageUrl(candidate),
        alt: candidate.getAttribute("alt") || candidate.getAttribute("title") || ""
      }))
      .filter((image) => image.url && !seenImages.has(image.url))
      .map((image) => {
        seenImages.add(image.url);
        return image;
      });
  }

  function extractGithubReadmeBlocks(readme) {
    const blocks = [];
    const seenImages = new Set();
    const seenTexts = new Set();
    const children = [...readme.children].filter((element) => {
      const tagName = element.tagName;
      return !["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "CANVAS", "VIDEO", "AUDIO"].includes(tagName);
    });

    for (const element of children) {
      if (element.tagName === "DETAILS") {
        const text = normalizeText(extractVisibleText(element));
        const images = collectImagesFromElement(element, seenImages);
        if (text || images.length > 0) {
          blocks.push({
            type: "details",
            text,
            html: sanitizeRichHtml(element) || text,
            images
          });
        }
        continue;
      }

      const text = normalizeText(extractVisibleText(element));
      if (text && !seenTexts.has(text)) {
        seenTexts.add(text);
        blocks.push({
          type: "text",
          text,
          html: sanitizeRichHtml(element) || text
        });
      }

      for (const image of collectImagesFromElement(element, seenImages)) {
        blocks.push({
          type: "image",
          url: image.url,
          alt: image.alt
        });
      }
    }

    if (blocks.length === 0) {
      return extractContentBlocks(readme);
    }
    return blocks;
  }

  function extractGithubContent() {
    const meta = extractPageMeta();
    const repoInfo = parseGitHubRepoFromUrl();
    const readme =
      document.querySelector("#readme article.markdown-body") ||
      document.querySelector("article.markdown-body") ||
      document.querySelector("#readme") ||
      document.querySelector('[data-testid="readme"]');
    if (!repoInfo.owner || !repoInfo.repo || !readme) {
      return {
        ...meta,
        ...repoInfo,
        blocks: []
      };
    }

    return {
      title: `${repoInfo.owner}/${repoInfo.repo}`,
      url: meta.url,
      description:
        queryText(['[itemprop="about"]', ".f4.my-3", "p.f4", 'meta[name="description"]']) ||
        meta.description,
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      stars: extractGithubCount("/stargazers"),
      forks: extractGithubCount("/forks"),
      language: queryText(["[itemprop='programmingLanguage']", ".color-fg-default.text-bold.mr-1"]),
      license: queryText(["a[href$='/LICENSE']", "a[href*='/blob/'][href*='LICENSE']"]),
      topics: queryAllTexts("a.topic-tag, a[data-ga-click*='topic']"),
      html: readme.outerHTML || "",
      blocks: extractGithubReadmeBlocks(readme)
    };
  }

  if (mode === "wechat") {
    return extractWechatContent();
  }
  if (mode === "github") {
    return extractGithubContent();
  }
  if (mode === "text") {
    return extractPageContent();
  }
  return extractPageMeta();
}
