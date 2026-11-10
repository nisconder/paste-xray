const input = document.querySelector("#text-input");
const textareaWrap = document.querySelector(".textarea-wrap");
const fileInput = document.querySelector("#file-input");
const emptyHint = document.querySelector("#empty-hint");
const characterCount = document.querySelector("#character-count");
const clipboardStatus = document.querySelector("#clipboard-status");
const issueCount = document.querySelector("#issue-count");
const verdictTitle = document.querySelector("#verdict-title");
const verdictCopy = document.querySelector("#verdict-copy");
const originHint = document.querySelector("#origin-hint");
const meterFill = document.querySelector("#meter-fill");
const verdictPanel = document.querySelector(".verdict-panel");
const riskCount = document.querySelector("#risk-count");
const noticeCount = document.querySelector("#notice-count");
const structureCount = document.querySelector("#structure-count");
const xrayOutput = document.querySelector("#xray-output");
const findingsList = document.querySelector("#findings-list");
const findingBadge = document.querySelector("#finding-badge");
const sourceOutput = document.querySelector("#source-output");
const sourceTabs = [...document.querySelectorAll(".source-tab")];
const sourceFormatHelp = document.querySelector("#source-format-help");
const htmlTabCount = document.querySelector("#html-tab-count");
const showStructure = document.querySelector("#show-structure");
const cleanOutput = document.querySelector("#clean-output");
const removedCount = document.querySelector("#removed-count");
const copyButton = document.querySelector("#copy-button");
const copyLabel = document.querySelector("#copy-label");
const sampleButton = document.querySelector("#sample-button");
const reportButton = document.querySelector("#report-button");
const toast = document.querySelector("#toast");
const runtimeNote = document.querySelector("#runtime-note");
const cleanControls = [...document.querySelectorAll(".clean-options input")];

const cleanZero = document.querySelector("#clean-zero");
const cleanBidi = document.querySelector("#clean-bidi");
const cleanReplacement = document.querySelector("#clean-replacement");
const cleanSpace = document.querySelector("#clean-space");
const cleanPunct = document.querySelector("#clean-punct");
const cleanLines = document.querySelector("#clean-lines");

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_XRAY_TOKENS = 10000;
const TEXT_FILE_EXTENSIONS = new Set([
  "txt", "md", "csv", "tsv", "json", "xml", "html", "htm", "css", "js", "mjs", "cjs",
  "ts", "tsx", "jsx", "py", "java", "c", "cpp", "h", "hpp", "go", "rs", "php", "rb",
  "sh", "ps1", "sql", "yaml", "yml", "toml", "ini", "log", "svg",
]);

const state = {
  plain: "",
  html: "",
  activeSource: "plain",
  findings: [],
  tokens: [],
  cleaned: "",
  pendingPaste: false,
  source: { kind: "empty", name: "", size: 0, modified: false },
};

function countHtmlTags(html) {
  if (!html) return 0;
  try {
    const documentFragment = new DOMParser().parseFromString(html, "text/html");
    return documentFragment.body.querySelectorAll("*").length;
  } catch {
    return (html.match(/<[^>]+>/g) || []).length;
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isSupportedTextFile(file) {
  const extension = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
  return file.type.startsWith("text/") || TEXT_FILE_EXTENSIONS.has(extension);
}

function decodeTextBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  let encoding = "utf-8";

  if (bytes[0] === 0xFF && bytes[1] === 0xFE) encoding = "utf-16le";
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) encoding = "utf-16be";

  return new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(bytes);
}

async function loadTextFile(file) {
  if (!file) return;
  if (!isSupportedTextFile(file)) {
    throw new Error("只支持文本和常见代码文件；请先转换为 TXT、Markdown、JSON 或源码文件。");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`文件为 ${formatFileSize(file.size)}，超过 5 MB 本地扫描上限。`);
  }

  let text;
  try {
    text = decodeTextBuffer(await file.arrayBuffer());
  } catch {
    throw new Error("这个文件的文字格式无法识别。请先用记事本打开并重新保存，再拖进来检查。");
  }

  state.html = "";
  state.source = { kind: "file", name: file.name, size: file.size, modified: false };
  input.value = text;
  clipboardStatus.textContent = `本地文件 · ${file.name} · ${formatFileSize(file.size)}`;
  analyze();
  input.focus();
  showToast(`已在本机读取 ${file.name}`);
}

async function handleFileList(files) {
  const file = files?.[0];
  if (!file) return;
  try {
    await loadTextFile(file);
    if (files.length > 1) showToast(`已扫描第一个文件：${file.name}`);
  } catch (error) {
    showToast(error.message || "文件读取失败");
  } finally {
    fileInput.value = "";
  }
}

function isCollapsibleStructure(finding) {
  return finding.severity === "structure" && (finding.type === "line" || finding.short === "TAB");
}

function aggregateFindings(findings) {
  const groups = new Map();
  findings.forEach((finding) => {
    const key = `${finding.severity}:${finding.type}:${finding.code}`;
    if (!groups.has(key)) {
      groups.set(key, { ...finding, count: 0, positions: [] });
    }
    const group = groups.get(key);
    group.count += 1;
    if (group.positions.length < 6) group.positions.push(finding.index);
  });
  return [...groups.values()];
}

function renderXray(tokens) {
  xrayOutput.replaceChildren();

  if (!tokens.length) {
    const empty = document.createElement("p");
    empty.className = "result-empty";
    empty.textContent = "还没有证据。粘贴文本后，所有隐藏字符都会在这里显形。";
    xrayOutput.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  let normalBuffer = "";

  const flushNormal = () => {
    if (!normalBuffer) return;
    fragment.append(document.createTextNode(normalBuffer));
    normalBuffer = "";
  };

  tokens.slice(0, MAX_XRAY_TOKENS).forEach(({ value, finding }) => {
    if (!finding || (isCollapsibleStructure(finding) && !showStructure.checked)) {
      normalBuffer += value;
      return;
    }

    flushNormal();
    const token = document.createElement("span");
    token.className = `xray-token type-${finding.type} severity-${finding.severity}`;
    token.dataset.code = finding.code.replace("U+", "");
    token.title = `${finding.name} · ${finding.code} · 位置 ${finding.index}`;
    token.textContent = finding.short;
    fragment.append(token);

    if (finding.type === "line") {
      const breakMarker = document.createElement("span");
      breakMarker.className = "xray-line-break";
      fragment.append(breakMarker);
    }
  });

  flushNormal();
  if (tokens.length > MAX_XRAY_TOKENS) {
    const note = document.createElement("p");
    note.className = "result-preview-note";
    note.textContent = "文本较长，显影区已截断预览；检测数量、明细和导出报告仍包含全文。";
    fragment.append(note);
  }
  xrayOutput.append(fragment);
}

function friendlyFindingName(finding) {
  if (finding.type === "homoglyph") {
    return `冒牌字母 ${finding.value}，看起来像 ${finding.skeleton}`;
  }

  const names = {
    REPL: "替换字符（原字符已丢失）",
    WJ: "禁止断行连接符",
    ZWSP: "零宽空格",
    ZWJ: "零宽连接符",
    ZWNJ: "零宽非连接符",
    TAG: "Unicode 隐藏标签",
    TAGEND: "Unicode 标签结束符",
    FUNC: "不可见函数应用符",
    ITIMES: "不可见乘号",
    ISEP: "不可见分隔符",
    IPLUS: "不可见加号",
    CGJ: "组合字素连接符",
    BOM: "字节序标记",
    NBSP: "不换行空格",
    NNBSP: "窄不换行空格",
    TAB: "制表符",
    LF: "LF 换行符",
    CRLF: "CRLF 换行符",
    CR: "CR 换行符",
    RLO: "从右到左覆盖符",
    LRO: "从左到右覆盖符",
  };
  return names[finding.short] || finding.name;
}

function buildAiCopyHint(findings) {
  const count = findings.filter((finding) => AI_COPY_MARKERS.has(finding.short)).length;
  if (!count) return "";
  return `这段文字里藏着 ${count} 个肉眼看不见的字符。它们可能在复制 AI 回答、网页或 PDF 时被悄悄带入，造成搜索匹配失败、链接失效，或让代码和命令报错。先别直接使用，也别急着全部删除：请查看下方位置并核对来源。这些字符本身不能证明内容由 AI 生成。`;
}

function contextSnippetForText(finding, text) {
  const points = [...text];
  const targetLength = [...finding.value].length;
  const radius = 18;
  const start = Math.max(0, finding.index - radius);
  const end = Math.min(points.length, finding.index + targetLength + radius);
  const showWhitespace = (value) => value.replace(/\r\n|\r|\n/g, "↵").replace(/\t/g, "⇥");
  const prefix = showWhitespace(points.slice(start, finding.index).join(""));
  const suffix = showWhitespace(points.slice(finding.index + targetLength, end).join(""));
  return `${start ? "…" : ""}${prefix}⟦${finding.short}⟧${suffix}${end < points.length ? "…" : ""}`;
}

function contextSnippet(finding) {
  return contextSnippetForText(finding, state.plain);
}

function renderFindingList(groups) {
  findingsList.replaceChildren();
  findingBadge.textContent = `${groups.length} 项`;

  if (!groups.length) {
    const empty = document.createElement("p");
    empty.className = "result-empty";
    empty.textContent = state.plain ? "没有识别到特殊字符。" : "暂未识别到特殊字符。";
    findingsList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  groups.forEach((finding) => {
    const row = document.createElement("div");
    row.className = "finding-row";
    row.dataset.type = finding.type;
    row.dataset.severity = finding.severity;

    const swatch = document.createElement("span");
    swatch.className = "finding-swatch";
    swatch.setAttribute("aria-hidden", "true");

    const body = document.createElement("div");
    body.className = "finding-body";

    const summary = document.createElement("div");
    summary.className = "finding-summary";

    const name = document.createElement("div");
    name.className = "finding-name";
    const title = document.createElement("b");
    title.textContent = friendlyFindingName(finding);
    const meta = document.createElement("small");
    meta.textContent = `${finding.short} · ${finding.code} · 位置 ${finding.positions.join(", ")}${finding.count > 6 ? "…" : ""}`;
    name.append(title, meta);

    const severity = document.createElement("span");
    severity.className = "finding-severity";
    severity.textContent = finding.severity === "risk" ? "风险" : finding.severity === "notice" ? "确认" : "正常";

    const recovery = document.createElement("span");
    recovery.className = "finding-recovery";
    recovery.textContent = finding.recovery;

    const total = document.createElement("span");
    total.className = "finding-total";
    total.textContent = `×${finding.count}`;

    summary.append(name, recovery, severity, total);

    const context = document.createElement("code");
    context.className = "finding-context";
    context.textContent = contextSnippet(finding);

    const explanation = document.createElement("p");
    explanation.className = "finding-explanation";
    explanation.textContent = finding.explanation;

    const guidance = document.createElement("dl");
    guidance.className = "finding-guidance";
    const originTerm = document.createElement("dt");
    originTerm.textContent = "常见来源";
    const originDescription = document.createElement("dd");
    originDescription.textContent = finding.origin;
    const actionTerm = document.createElement("dt");
    actionTerm.textContent = "下一步";
    const actionDescription = document.createElement("dd");
    actionDescription.textContent = finding.action;
    guidance.append(originTerm, originDescription, actionTerm, actionDescription);

    body.append(summary, context, explanation, guidance);
    row.append(swatch, body);
    fragment.append(row);
  });
  findingsList.append(fragment);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function severityLabel(severity) {
  if (severity === "risk") return "较高风险";
  if (severity === "notice") return "需要确认";
  return "正常结构";
}

function sourceLabel(source = state.source) {
  if (source.kind === "file") {
    return `${source.name}${source.modified ? "（读取后已编辑）" : ""} · ${formatFileSize(source.size)}`;
  }
  if (source.kind === "clipboard") return "剪贴板粘贴";
  if (source.kind === "extension") {
    return source.truncated ? "浏览器选中文字（只检查前 100 万字）" : "浏览器选中文字";
  }
  if (source.kind === "sample") return "内置问题样本";
  if (source.kind === "manual") return "手动输入";
  return "未记录";
}

function buildReportXray(tokens) {
  return tokens.map(({ value, finding }) => {
    if (!finding) return escapeHtml(value);
    const marker = `<span class="token ${finding.severity}" title="${escapeHtml(`${finding.name} · ${finding.code}`)}"><small>${escapeHtml(finding.code)}</small>${escapeHtml(finding.short)}</span>`;
    return finding.type === "line" ? `${marker}\n` : marker;
  }).join("");
}

function buildReportHtml(generatedAt = new Date()) {
  const groups = aggregateFindings(state.findings);
  const risks = state.findings.filter(({ severity }) => severity === "risk").length;
  const notices = state.findings.filter(({ severity }) => severity === "notice").length;
  const issueTotal = risks + notices;
  const generatedLabel = generatedAt.toLocaleString("zh-CN", { hour12: false });

  const findingCards = groups.length
    ? groups.map((finding) => `
      <article class="finding ${finding.severity}">
        <div class="finding-head">
          <div><b>${escapeHtml(friendlyFindingName(finding))}</b><small>${escapeHtml(`${finding.short} · ${finding.code} · 位置 ${finding.positions.join(", ")}${finding.count > 6 ? "…" : ""}`)}</small></div>
          <span>${escapeHtml(severityLabel(finding.severity))} · ×${finding.count}</span>
        </div>
        <code>${escapeHtml(contextSnippetForText(finding, state.plain))}</code>
        <p>${escapeHtml(finding.explanation)}</p>
        <dl><dt>常见来源</dt><dd>${escapeHtml(finding.origin)}</dd><dt>下一步</dt><dd>${escapeHtml(finding.action)}</dd><dt>处理建议</dt><dd>${escapeHtml(finding.recovery)}</dd></dl>
      </article>`).join("")
    : '<p class="empty">没有识别到特殊字符。</p>';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
  <title>Paste X-Ray 扫描报告</title>
  <style>
    :root{--ink:#17213f;--soft:#53607c;--paper:#f4f6fb;--line:#cbd2e3;--blue:#3157e1;--marker:#d8ff59;--risk:#b53751;--notice:#ffac4b;--structure:#aeb7ca}
    *{box-sizing:border-box}body{margin:0;color:var(--ink);background:linear-gradient(rgba(49,87,225,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(49,87,225,.045) 1px,transparent 1px),var(--paper);background-size:28px 28px;font-family:"Segoe UI","Microsoft YaHei",sans-serif}.page{width:min(1080px,calc(100% - 32px));margin:0 auto;padding:42px 0 60px}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:28px;padding-bottom:24px;border-bottom:1px solid var(--line)}.brand{margin:0;font:900 clamp(2rem,6vw,4.6rem)/.95 "Arial Narrow","Segoe UI",sans-serif;letter-spacing:-.05em}.brand span{color:var(--blue);box-shadow:inset 0 -.18em var(--marker)}.meta{margin:3px 0 0;color:var(--soft);font:12px/1.7 Consolas,monospace;text-align:right}.summary{display:grid;grid-template-columns:repeat(4,1fr);margin:30px 0;border:1px solid var(--ink);border-radius:10px;background:#fff;overflow:hidden;box-shadow:8px 8px 0 var(--ink)}.summary div{padding:20px;border-right:1px solid var(--line)}.summary div:last-child{border:0}.summary small{display:block;color:var(--soft);font:11px Consolas,monospace}.summary b{display:block;margin-top:7px;font:900 2rem "Arial Narrow","Segoe UI",sans-serif}.risk-text{color:var(--risk)}h2{margin:46px 0 14px;font-size:1.35rem}.xray{min-height:180px;padding:28px;border:1px solid var(--ink);border-radius:9px;background:#fff;box-shadow:0 18px 60px rgba(23,33,63,.09);font:15px/2.5 Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}.token{position:relative;display:inline-block;margin:0 2px;padding:1px 5px;border-radius:3px;font-size:11px;font-weight:800;line-height:1.7;white-space:nowrap}.token small{position:absolute;top:-16px;left:50%;color:#73809d;font-size:7px;font-weight:500;transform:translateX(-50%)}.token.risk{color:#fff;background:var(--risk)}.token.notice{color:var(--ink);background:#ffe0b6;box-shadow:inset 0 -2px 0 var(--notice)}.token.structure{color:var(--soft);background:#eef1f7}.findings{display:grid;gap:10px}.finding{padding:19px;border:1px solid var(--line);border-radius:7px;background:#fff}.finding.risk{border-color:#e3a6b3;background:#fffafb}.finding-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.finding-head b,.finding-head small{display:block}.finding-head small{margin-top:4px;color:var(--soft);font:10px/1.5 Consolas,monospace}.finding-head>span{padding:5px 7px;border-radius:4px;background:#eef1f7;font:700 10px Consolas,monospace;white-space:nowrap}.finding.risk .finding-head>span{color:#9a2941;background:#ffe2e8}.finding code{display:block;margin:15px 0 11px;padding:11px 13px;border:1px solid var(--line);border-radius:5px;background:var(--paper);font:12px/1.6 Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}.finding p{margin:0 0 12px;font-size:13px;font-weight:650;line-height:1.65}.finding dl{display:grid;grid-template-columns:70px 1fr;gap:7px 12px;margin:0;padding-top:12px;border-top:1px dashed var(--line);font-size:12px;line-height:1.6}.finding dt{color:var(--soft);font:700 10px Consolas,monospace}.finding dd{margin:0;color:var(--soft)}.empty{padding:28px;border:1px solid var(--line);background:#fff;color:var(--soft)}footer{margin-top:44px;padding-top:20px;border-top:1px solid var(--line);color:var(--soft);font:11px/1.7 Consolas,monospace}footer b{color:var(--ink)}
    @media(max-width:700px){.top{display:block}.meta{margin-top:14px;text-align:left}.summary{grid-template-columns:repeat(2,1fr)}.summary div:nth-child(2){border-right:0}.summary div:nth-child(-n+2){border-bottom:1px solid var(--line)}.finding-head{display:block}.finding-head>span{display:inline-block;margin-top:10px}.finding dl{grid-template-columns:1fr}.page{padding-top:24px}}
    @media print{body{background:#fff}.page{width:100%;padding:0}.summary,.xray{box-shadow:none}.finding{break-inside:avoid}}
  </style>
</head>
<body>
  <main class="page">
    <header class="top">
      <h1 class="brand">PASTE <span>X-RAY</span></h1>
      <p class="meta">扫描时间：${escapeHtml(generatedLabel)}<br>输入来源：${escapeHtml(sourceLabel())}<br>本报告由浏览器本地生成</p>
    </header>
    <section class="summary" aria-label="扫描摘要">
      <div><small>待处理项目</small><b>${issueTotal}</b></div>
      <div><small>较高风险</small><b class="risk-text">${risks}</b></div>
      <div><small>需要确认</small><b>${notices}</b></div>
      <div><small>文本字符</small><b>${[...state.plain].length}</b></div>
    </section>
    <section><h2>字符显影带</h2><div class="xray">${buildReportXray(state.tokens)}</div></section>
    <section><h2>检测明细 · ${groups.length} 项</h2><div class="findings">${findingCards}</div></section>
    <footer><b>隐私说明</b><br>报告包含被扫描文本及其上下文。分享前请确认其中没有密码、密钥、个人信息或其他敏感内容。Paste X-Ray 不上传、不保存、不追踪文本。</footer>
  </main>
</body>
</html>`;
}

function reportFilename(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15).replace("T", "-");
  const sourceBase = state.source.kind === "file"
    ? state.source.name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 48)
    : "text";
  return `paste-xray-${sourceBase || "text"}-${stamp}.html`;
}

function exportReport() {
  if (!state.plain) return;
  const now = new Date();
  const blob = new Blob([buildReportHtml(now)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = reportFilename(now);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast("扫描报告已导出；分享前请检查敏感内容");
}

function renderVerdict(findings) {
  const risks = findings.filter((item) => item.severity === "risk").length;
  const notices = findings.filter((item) => item.severity === "notice").length;
  const structures = findings.filter((item) => item.severity === "structure").length;
  const replacements = findings.filter((item) => item.short === "REPL").length;
  const total = risks + notices;
  const tagCount = countHtmlTags(state.html);
  const aiCopyHint = buildAiCopyHint(findings);

  issueCount.textContent = total;
  riskCount.textContent = state.plain ? risks : "—";
  noticeCount.textContent = state.plain ? notices : "—";
  structureCount.textContent = state.plain ? structures : "—";
  htmlTabCount.hidden = tagCount === 0;
  htmlTabCount.textContent = tagCount ? String(tagCount) : "";
  reportButton.disabled = !state.plain;
  meterFill.style.width = state.plain ? `${Math.min(100, Math.max(4, risks * 16 + notices * 5))}%` : "0%";
  verdictPanel.dataset.status = risks ? "risk" : notices ? "notice" : "safe";
  originHint.hidden = !aiCopyHint;
  originHint.textContent = aiCopyHint;

  if (!state.plain) {
    verdictPanel.dataset.status = "waiting";
    verdictTitle.textContent = "等待样本";
    verdictCopy.textContent = "粘贴文本后，这里会给出检测结论。";
    originHint.hidden = true;
    return;
  }

  const htmlNote = tagCount ? `剪贴板另含 ${tagCount} 个富文本标签。` : "";
  if (replacements > 0) {
    verdictTitle.textContent = "原字符已经丢失";
    verdictCopy.textContent = `发现 ${replacements} 个 �，说明文字在打开或复制时已经损坏。请回到原文件，用原来的应用或记事本重新打开后再复制；现在无法猜回丢失内容。${notices ? `另有 ${notices} 个字符需要确认。` : ""}${htmlNote}`;
  } else if (risks > 0) {
    verdictTitle.textContent = "建议检查";
    verdictCopy.textContent = `发现 ${risks} 个较高风险字符和 ${notices} 个需要确认的字符。${htmlNote}`;
  } else if (notices > 0) {
    verdictTitle.textContent = "可能来自正常排版";
    verdictCopy.textContent = `没有较高风险；${notices} 个字符需要结合编辑器、语言和用途判断。${htmlNote}`;
  } else {
    verdictTitle.textContent = "文本结构正常";
    verdictCopy.textContent = structures
      ? `识别到 ${structures} 个正常结构或排版字符，无需清理。${htmlNote}`
      : `没有发现需要处理的特殊字符。${htmlNote}`;
  }
}

function cleanText(text) {
  let result = text;

  if (cleanZero.checked) {
    result = [...result].filter((char) => !ZERO_WIDTH.has(char) && !isUnicodeTag(char)).join("");
  }

  if (cleanBidi.checked) {
    result = [...result].filter((char) => !BIDI.has(char)).join("");
  }

  if (cleanReplacement.checked) {
    result = result.replace(/\uFFFD/g, "");
  }

  if (cleanSpace.checked) {
    result = [...result].map((char) => (SPECIAL_SPACES.has(char) && char !== "\t" ? " " : char)).join("");
  }

  if (cleanPunct.checked) {
    result = [...result].map((char) => PUNCTUATION.get(char)?.[2] ?? char).join("");
  }

  if (cleanLines.checked) {
    result = result.replace(/\r\n?|[\u0085\u2028\u2029]/g, "\n");
  }

  return result;
}

function countPlannedChanges(text) {
  let count = 0;
  const points = [...text];

  points.forEach((char) => {
    if (cleanZero.checked && (ZERO_WIDTH.has(char) || isUnicodeTag(char))) count += 1;
    else if (cleanBidi.checked && BIDI.has(char)) count += 1;
    else if (cleanReplacement.checked && char === "\uFFFD") count += 1;
    else if (cleanSpace.checked && SPECIAL_SPACES.has(char) && char !== "\t") count += 1;
    else if (cleanPunct.checked && PUNCTUATION.has(char)) count += 1;
  });

  if (cleanLines.checked) {
    count += (text.match(/\r\n?|[\u0085\u2028\u2029]/g) || []).length;
  }

  return count;
}

function renderCleanPreview() {
  state.cleaned = cleanText(state.plain);
  cleanOutput.textContent = state.plain ? state.cleaned : "清理后的文本会显示在这里";
  const changes = countPlannedChanges(state.plain);
  removedCount.textContent = `将改变 ${changes} 处`;
  copyButton.disabled = !state.plain || analysisWorker !== null;
}

function renderSource() {
  sourceFormatHelp.textContent = state.activeSource === "plain"
    ? state.source.kind === "file"
      ? `读取自 ${sourceLabel()}，也是字符检测实际分析的内容。`
      : "当前输入框中的纯文本，也是字符检测实际分析的内容。"
    : "粘贴网页或富文本时附带的 HTML 源码；文件输入不会生成此格式。";

  if (!state.plain) {
    sourceOutput.textContent = "尚未读取源数据。\n请在上方粘贴文字或拖入文本文件；文件和直接输入不会产生 text/html。";
    return;
  }

  if (state.activeSource === "plain") {
    sourceOutput.textContent = state.plain;
  } else {
    sourceOutput.textContent = state.html || "此次输入没有提供 text/html。\n只有直接从网页、富文本编辑器或文档粘贴时，剪贴板才可能携带 HTML。";
  }
}

let analysisWorker = null;
let analysisRevision = 0;
const WORKER_THRESHOLD = 20000;

function finishAnalysis(result) {
  state.tokens = result.tokens;
  state.findings = result.findings;
  const groups = aggregateFindings(state.findings);

  characterCount.textContent = `${[...state.plain].length} 字符`;
  emptyHint.classList.toggle("is-hidden", Boolean(state.plain));
  renderXray(state.tokens);
  renderFindingList(groups);
  renderVerdict(state.findings);
  renderSource();
  renderCleanPreview();
  reportButton.disabled = !state.plain;
}

function analyze() {
  const id = ++analysisRevision;
  if (analysisWorker) analysisWorker.terminate();
  analysisWorker = null;
  state.plain = input.value;
  const text = state.plain;

  // file:// and browsers without Workers retain the existing synchronous path.
  if (text.length < WORKER_THRESHOLD || typeof Worker === "undefined") {
    finishAnalysis(analyzeText(text));
    return;
  }

  characterCount.textContent = `${[...text].length} 字符 · 正在本机后台检查`;
  state.tokens = [];
  state.findings = [];
  renderXray([]);
  renderFindingList([]);
  renderSource();
  verdictTitle.textContent = "正在检查当前文本";
  verdictCopy.textContent = "全文检测在本机后台进行。完成后会显示当前文本的结果。";
  issueCount.textContent = "…";
  riskCount.textContent = "—";
  noticeCount.textContent = "—";
  structureCount.textContent = "—";
  originHint.textContent = "";
  cleanOutput.textContent = "正在检查当前文本…";
  copyButton.disabled = true;
  reportButton.disabled = true;
  const fallback = () => {
    if (id !== analysisRevision) return;
    analysisWorker?.terminate();
    analysisWorker = null;
    finishAnalysis(analyzeText(text));
  };
  try {
    const worker = new Worker("analysis-worker.js?v=20261107-1");
    analysisWorker = worker;
    worker.onmessage = ({ data }) => {
      if (id !== analysisRevision || data.id !== id) return;
      if (data.error) return fallback();
      worker.terminate();
      analysisWorker = null;
      finishAnalysis(data);
    };
    worker.onerror = (event) => { event.preventDefault(); fallback(); };
    worker.onmessageerror = fallback;
    worker.postMessage({ id, text });
  } catch {
    fallback();
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

async function loadExtensionSelection() {
  const extensionStorage = globalThis.chrome?.storage?.session;
  if (!extensionStorage || typeof location === "undefined") return;

  const scanKey = new URLSearchParams(location.search).get("scan");
  if (!scanKey) return;

  try {
    const stored = await extensionStorage.get(scanKey);
    await extensionStorage.remove(scanKey);
    const payload = stored?.[scanKey];
    if (!payload || typeof payload.text !== "string") return;

    input.value = payload.text;
    state.html = "";
    state.source = {
      kind: "extension",
      name: "",
      size: 0,
      modified: false,
      truncated: Boolean(payload.truncated),
    };
    clipboardStatus.textContent = payload.truncated
      ? "选中文字过长，已载入前 100 万字"
      : "已载入网页选中文字";
    analyze();
    input.focus();

    if (typeof history !== "undefined" && history.replaceState) {
      history.replaceState({}, "", `${location.pathname}${location.hash || ""}`);
    }
  } catch {
    clipboardStatus.textContent = "无法读取选中文字，请返回网页重新选择";
  }
}

input.addEventListener("input", () => {
  if (!input.value || !state.pendingPaste) state.html = "";
  if (state.pendingPaste) {
    state.pendingPaste = false;
  } else if (!input.value) {
    state.source = { kind: "empty", name: "", size: 0, modified: false };
    clipboardStatus.textContent = "等待输入";
  } else if (state.source.kind === "file") {
    state.source.modified = true;
    clipboardStatus.textContent = `文件内容已编辑 · ${state.source.name}`;
  } else {
    state.source = { kind: "manual", name: "", size: 0, modified: false };
    clipboardStatus.textContent = "手动输入";
  }
  analyze();
});

input.addEventListener("paste", (event) => {
  state.pendingPaste = true;
  state.html = event.clipboardData?.getData("text/html") || "";
  state.source = { kind: "clipboard", name: "", size: 0, modified: false };
  const types = [...(event.clipboardData?.types || [])];
  clipboardStatus.textContent = state.html ? "已读取纯文本 + HTML" : types.length ? "已读取纯文本" : "已粘贴";
  window.setTimeout(() => {
    state.pendingPaste = false;
    analyze();
  }, 0);
});

fileInput.addEventListener("change", () => handleFileList(fileInput.files));

let fileDragDepth = 0;
const isFileDrag = (event) => [...(event.dataTransfer?.types || [])].includes("Files");

textareaWrap.addEventListener("dragenter", (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  fileDragDepth += 1;
  textareaWrap.classList.add("is-dragging");
});

textareaWrap.addEventListener("dragover", (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});

textareaWrap.addEventListener("dragleave", (event) => {
  if (!isFileDrag(event)) return;
  fileDragDepth = Math.max(0, fileDragDepth - 1);
  if (!fileDragDepth) textareaWrap.classList.remove("is-dragging");
});

textareaWrap.addEventListener("drop", (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  fileDragDepth = 0;
  textareaWrap.classList.remove("is-dragging");
  handleFileList(event.dataTransfer.files);
});

sourceTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.activeSource = tab.dataset.source;
    sourceTabs.forEach((candidate) => {
      const active = candidate === tab;
      candidate.classList.toggle("is-active", active);
      candidate.setAttribute("aria-selected", String(active));
    });
    renderSource();
  });
});

cleanControls.forEach((control) => control.addEventListener("change", renderCleanPreview));
showStructure.addEventListener("change", () => renderXray(state.tokens));

sampleButton.addEventListener("click", () => {
  state.pendingPaste = false;
  state.html = '<p style="font-family: Arial">Invoice&nbsp;<strong>#2048</strong><span style="display:none">tracking</span></p>';
  state.source = { kind: "sample", name: "", size: 0, modified: false };
  input.value = "先别直接使用：这段内容从 AI 回答复制而来，看起来完全正常，却藏着\u200B肉眼看不见的字符。\r\n损坏警告：这里有一个字符已经丢失\u2060\uFFFD，复制后的内容可能无法恢复。\r\n订单状态：Invoice\u00A0#2048 — approved\r\n仿冒链接：https://\u0440\u0430ypal.com/verify\r\n可疑文件：src/\u202Etxt.exe\u202C";
  clipboardStatus.textContent = "已载入演示样本";
  analyze();
  input.focus();
});

reportButton.addEventListener("click", exportReport);

copyButton.addEventListener("click", async () => {
  if (!state.plain) return;
  let copied = false;
  try {
    await navigator.clipboard.writeText(state.cleaned);
    copied = true;
  } catch {
    try {
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(cleanOutput);
      selection.removeAllRanges();
      selection.addRange(range);
      copied = document.execCommand("copy");
      if (copied) selection.removeAllRanges();
    } catch {
      copied = false;
    }
  }

  if (!copied) {
    copyLabel.textContent = "复制清理后的文本";
    showToast("复制失败，请选中清理预览后手动复制");
    return;
  }

  copyLabel.textContent = "已复制";
  showToast("清理后的文本已复制");
  window.setTimeout(() => {
    copyLabel.textContent = "复制清理后的文本";
  }, 1500);
});

if (globalThis.chrome?.runtime?.id && runtimeNote) {
  runtimeNote.textContent = "浏览器插件 · 仅在本机处理";
}

analyze();
void loadExtensionSelection();
