const input = document.querySelector("#text-input");
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
const toast = document.querySelector("#toast");
const cleanControls = [...document.querySelectorAll(".clean-options input")];

const cleanZero = document.querySelector("#clean-zero");
const cleanBidi = document.querySelector("#clean-bidi");
const cleanReplacement = document.querySelector("#clean-replacement");
const cleanSpace = document.querySelector("#clean-space");
const cleanPunct = document.querySelector("#clean-punct");
const cleanLines = document.querySelector("#clean-lines");

const ZERO_WIDTH = new Map([
  ["\u034F", ["CGJ", "Combining grapheme joiner"]],
  ["\u00AD", ["SHY", "Soft hyphen"]],
  ["\u180E", ["MVS", "Mongolian vowel separator"]],
  ["\u200B", ["ZWSP", "Zero width space"]],
  ["\u200C", ["ZWNJ", "Zero width non-joiner"]],
  ["\u200D", ["ZWJ", "Zero width joiner"]],
  ["\u2060", ["WJ", "Word joiner"]],
  ["\u2061", ["FUNC", "Function application"]],
  ["\u2062", ["ITIMES", "Invisible times"]],
  ["\u2063", ["ISEP", "Invisible separator"]],
  ["\u2064", ["IPLUS", "Invisible plus"]],
  ["\uFEFF", ["BOM", "Zero width no-break space / BOM"]],
]);

const AI_COPY_MARKERS = new Set(["SHY", "ZWSP", "WJ", "FUNC", "ITIMES", "ISEP", "IPLUS", "TAG", "TAGEND"]);

const SPECIAL_SPACES = new Map([
  ["\u0009", ["TAB", "Horizontal tab"]],
  ["\u00A0", ["NBSP", "No-break space"]],
  ["\u1680", ["OGHAM", "Ogham space mark"]],
  ["\u2000", ["ENQ", "En quad"]],
  ["\u2001", ["EMQ", "Em quad"]],
  ["\u2002", ["ENSP", "En space"]],
  ["\u2003", ["EMSP", "Em space"]],
  ["\u2004", ["3/MSP", "Three-per-em space"]],
  ["\u2005", ["4/MSP", "Four-per-em space"]],
  ["\u2006", ["6/MSP", "Six-per-em space"]],
  ["\u2007", ["FSP", "Figure space"]],
  ["\u2008", ["PSP", "Punctuation space"]],
  ["\u2009", ["THSP", "Thin space"]],
  ["\u200A", ["HSP", "Hair space"]],
  ["\u202F", ["NNBSP", "Narrow no-break space"]],
  ["\u205F", ["MMSP", "Medium mathematical space"]],
  ["\u3000", ["IDSP", "Ideographic space"]],
]);

const BIDI = new Map([
  ["\u061C", ["ALM", "Arabic letter mark"]],
  ["\u200E", ["LRM", "Left-to-right mark"]],
  ["\u200F", ["RLM", "Right-to-left mark"]],
  ["\u202A", ["LRE", "Left-to-right embedding"]],
  ["\u202B", ["RLE", "Right-to-left embedding"]],
  ["\u202C", ["PDF", "Pop directional formatting"]],
  ["\u202D", ["LRO", "Left-to-right override"]],
  ["\u202E", ["RLO", "Right-to-left override"]],
  ["\u2066", ["LRI", "Left-to-right isolate"]],
  ["\u2067", ["RLI", "Right-to-left isolate"]],
  ["\u2068", ["FSI", "First strong isolate"]],
  ["\u2069", ["PDI", "Pop directional isolate"]],
]);

const PUNCTUATION = new Map([
  ["\u2018", ["LSQUO", "Left single quotation mark", "'"]],
  ["\u2019", ["RSQUO", "Right single quotation mark", "'"]],
  ["\u201C", ["LDQUO", "Left double quotation mark", '"']],
  ["\u201D", ["RDQUO", "Right double quotation mark", '"']],
  ["\u2013", ["ENDASH", "En dash", "-"]],
  ["\u2014", ["EMDASH", "Em dash", "-"]],
  ["\u2026", ["ELLIPSIS", "Horizontal ellipsis", "..."]],
  ["\u2212", ["MINUS", "Minus sign", "-"]],
]);

const CONTROL_NAMES = new Map([
  ["\u0000", ["NUL", "Null"]],
  ["\u0008", ["BS", "Backspace"]],
  ["\u000B", ["VT", "Vertical tab"]],
  ["\u000C", ["FF", "Form feed"]],
  ["\u001B", ["ESC", "Escape"]],
  ["\u007F", ["DEL", "Delete"]],
  ["\uFFFD", ["REPL", "Replacement character"]],
]);

const state = {
  plain: "",
  html: "",
  activeSource: "plain",
  findings: [],
  tokens: [],
  cleaned: "",
  pendingPaste: false,
};

function codePointLabel(value) {
  return `U+${value.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
}

function isUnicodeTag(value) {
  const point = value.codePointAt(0);
  return point >= 0xE0000 && point <= 0xE007F;
}

function classify(value, index) {
  if (value === "\r\n") {
    return { value, index, type: "line", short: "CRLF", name: "Windows line break", code: "U+000D U+000A" };
  }

  if (value === "\r") {
    return { value, index, type: "line", short: "CR", name: "Carriage return", code: "U+000D" };
  }

  if (value === "\n") {
    return { value, index, type: "line", short: "LF", name: "Line feed", code: "U+000A" };
  }

  if (value === "\u0085") {
    return { value, index, type: "line", short: "NEL", name: "Next line", code: "U+0085" };
  }

  if (value === "\u2028") {
    return { value, index, type: "line", short: "LS", name: "Line separator", code: "U+2028" };
  }

  if (value === "\u2029") {
    return { value, index, type: "line", short: "PS", name: "Paragraph separator", code: "U+2029" };
  }

  if (ZERO_WIDTH.has(value)) {
    const [short, name] = ZERO_WIDTH.get(value);
    return { value, index, type: "zero", short, name, code: codePointLabel(value) };
  }

  if (isUnicodeTag(value)) {
    const isTerminator = value.codePointAt(0) === 0xE007F;
    return {
      value,
      index,
      type: "zero",
      short: isTerminator ? "TAGEND" : "TAG",
      name: isTerminator ? "Cancel tag" : "Unicode tag character",
      code: codePointLabel(value),
    };
  }

  if (SPECIAL_SPACES.has(value)) {
    const [short, name] = SPECIAL_SPACES.get(value);
    return { value, index, type: "space", short, name, code: codePointLabel(value) };
  }

  if (BIDI.has(value)) {
    const [short, name] = BIDI.get(value);
    return { value, index, type: "bidi", short, name, code: codePointLabel(value) };
  }

  if (PUNCTUATION.has(value)) {
    const [short, name] = PUNCTUATION.get(value);
    return { value, index, type: "punct", short, name, code: codePointLabel(value) };
  }

  if (CONTROL_NAMES.has(value) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u.test(value)) {
    const [short = "CTRL", name = "Control character"] = CONTROL_NAMES.get(value) || [];
    return { value, index, type: value === "\uFFFD" ? "unknown" : "control", short, name, code: codePointLabel(value) };
  }

  return null;
}

function tokenize(text) {
  const tokens = [];
  let stringIndex = 0;

  for (let i = 0; i < text.length; ) {
    let value;
    if (text[i] === "\r" && text[i + 1] === "\n") {
      value = "\r\n";
      i += 2;
    } else {
      const point = text.codePointAt(i);
      value = String.fromCodePoint(point);
      i += value.length;
    }

    const finding = classify(value, stringIndex);
    tokens.push({ value, finding });
    stringIndex += [...value].length;
  }

  return tokens;
}

function countHtmlTags(html) {
  if (!html) return 0;
  try {
    const documentFragment = new DOMParser().parseFromString(html, "text/html");
    return documentFragment.body.querySelectorAll("*").length;
  } catch {
    return (html.match(/<[^>]+>/g) || []).length;
  }
}

function buildFindings(tokens) {
  return tokens.filter((token) => token.finding).map((token) => token.finding);
}

function assessFindings(findings) {
  const lineFindings = findings.filter((finding) => finding.type === "line");
  const regularLines = lineFindings.filter((finding) => ["LF", "CRLF", "CR"].includes(finding.short));
  const regularCounts = new Map();

  regularLines.forEach((finding) => {
    regularCounts.set(finding.short, (regularCounts.get(finding.short) || 0) + 1);
  });

  const commonOrder = ["LF", "CRLF", "CR"];
  const baseline = [...regularCounts.entries()].sort((a, b) => {
    const countDifference = b[1] - a[1];
    return countDifference || commonOrder.indexOf(a[0]) - commonOrder.indexOf(b[0]);
  })[0]?.[0];

  const mixedRegularLines = regularCounts.size > 1;
  return findings.map((finding) => {
    let severity = "notice";
    let explanation = "建议结合来源确认是否需要保留";
    let origin = "可能由编辑器、网页或复制过程写入";
    let action = "查看它两侧的文字，并根据最终用途决定是否保留";
    let recovery = "可判断";

    if (finding.type === "line") {
      if (!["LF", "CRLF", "CR"].includes(finding.short)) {
        severity = "notice";
        explanation = "较少见的 Unicode 换行方式";
        origin = "可能来自特定语言环境、文档格式或转换工具";
        action = "若目标是代码或通用纯文本，建议统一为 LF";
        recovery = "可标准化";
      } else if (finding.short === "CR") {
        severity = "notice";
        explanation = "旧式 Mac 换行；现代文本中较少见";
        origin = "可能来自旧文件或跨平台文本转换";
        action = "确认目标平台后统一为 LF 或 CRLF";
        recovery = "可标准化";
      } else if (mixedRegularLines && finding.short !== baseline) {
        severity = "notice";
        explanation = `与文档主要使用的 ${baseline} 换行不一致`;
        origin = "同一文本可能被多个系统或编辑器修改过";
        action = `若用于代码或版本控制，建议统一为 ${baseline}`;
        recovery = "可标准化";
      } else {
        severity = "structure";
        explanation = `统一的 ${finding.short} 换行，属于正常文本结构`;
        origin = "由编辑器在按下回车时写入";
        action = "无需处理；它负责保留段落和换行";
        recovery = "无需处理";
      }
    } else if (finding.type === "zero") {
      if (["TAG", "TAGEND"].includes(finding.short)) {
        severity = "risk";
        explanation = "默认不可见的 Unicode 标签字符，可在可见文本中夹带额外信息";
        origin = "可能来自文本水印、隐写、网页或 AI 对话复制；仅凭它不能判断内容是否由 AI 生成";
        action = "普通文章、代码和标识符通常不需要它；核对来源后可删除";
        recovery = "可清理";
      } else if (["ZWJ", "ZWNJ"].includes(finding.short)) {
        explanation = "可能属于 emoji 或某些语言的正常文字连接";
        origin = "常见于 emoji 组合、阿拉伯语和南亚文字";
        action = "不要批量删除；先确认两侧字符和原文语言";
        recovery = "谨慎清理";
      } else if (["CGJ", "MVS"].includes(finding.short)) {
        explanation = "可能参与特定语言的字符组合或断词，肉眼通常不可见";
        origin = "常见于 Unicode 规范化、蒙古文或专业排版";
        action = "多语言文本中先保留；用于代码、链接或标识符时再核对";
        recovery = "谨慎清理";
      } else if (["FUNC", "ITIMES", "ISEP", "IPLUS"].includes(finding.short)) {
        explanation = "不可见的数学排版控制符，也会影响搜索和字符串精确比较";
        origin = "可能来自公式编辑器、网页、PDF 或 AI 对话复制；仅凭它不能判断内容是否由 AI 生成";
        action = "数学公式中可能有用；普通文章、代码、链接或标识符中建议删除";
        recovery = "可清理";
      } else if (finding.short === "ZWSP") {
        explanation = "肉眼不可见；可用于断词，也会让看似相同的字符串不相等";
        origin = "可能来自 AI 对话、网页、PDF 或富文本复制；部分语言也会用它断词。仅凭它不能判断内容是否由 AI 生成";
        action = "用于代码、链接、命令或标识符时建议删除；自然语言文本先确认排版用途";
        recovery = "可清理";
      } else if (["SHY", "WJ"].includes(finding.short)) {
        explanation = "肉眼通常不可见，但会参与换行、搜索和字符串精确比较";
        origin = "可能来自 AI 对话、网页、PDF 或富文本排版；仅凭它不能判断内容是否由 AI 生成";
        action = "普通文章中可结合排版判断；代码、链接、命令或标识符中建议删除";
        recovery = "可清理";
      } else if (finding.short === "BOM" && finding.index > 0) {
        severity = "risk";
        explanation = "出现在文本中部，可能影响比较、解析或搜索";
        origin = "常见于文件拼接或错误的编码转换";
        action = "若不是文件开头的编码标记，可以删除";
        recovery = "可清理";
      } else if (finding.short === "BOM") {
        explanation = "可能是文本编码标记，粘贴内容通常不需要它";
        origin = "通常来自带 BOM 的 UTF 文本文件";
        action = "纯文本粘贴通常可删除；原文件编码场景需保留判断";
        recovery = "可清理";
      } else {
        explanation = "可能来自编辑器排版，也可能影响搜索和字符串比较";
        origin = "常见于网页、Word、Typora 或富文本复制";
        action = "用于代码、命令或精确匹配时可删除；普通排版可保留";
        recovery = "可清理";
      }
    } else if (finding.type === "space") {
      if (finding.short === "TAB") {
        severity = "structure";
        explanation = "常规制表符，用于缩进或列对齐";
        origin = "由 Tab 键、代码编辑器或表格文本产生";
        action = "除非格式规范要求空格缩进，否则无需处理";
        recovery = "无需处理";
      } else {
        explanation = "常见于网页、Word、Typora 等富文本排版";
        origin = "编辑器可能用特殊空格防止换行或控制视觉间距";
        action = "用于代码、搜索或数据导入时可转换为普通空格";
        recovery = "可标准化";
      }
    } else if (finding.type === "bidi") {
      if (["LRE", "RLE", "PDF", "LRO", "RLO"].includes(finding.short)) {
        severity = "risk";
        explanation = "可改变文字的视觉顺序，需确认是否符合原文语言方向";
        origin = "可能来自双向语言排版，也可能被用于伪装文件名或代码";
        action = "对照逻辑顺序和显示顺序；非多语言内容建议移除";
        recovery = "可清理";
      } else {
        explanation = "多语言文本中可能正常，用于控制从左到右或从右到左显示";
        origin = "常见于阿拉伯语、希伯来语与拉丁字符混排";
        action = "原文含双向语言时保留；否则确认后移除";
        recovery = "谨慎清理";
      }
    } else if (finding.type === "punct") {
      severity = "structure";
      explanation = "常见的智能排版标点，本身可见且通常无需清理";
      origin = "通常由 Typora、Word、输入法或智能标点功能产生";
      action = "文章排版可保留；代码或机器输入可转换为 ASCII 标点";
      recovery = "无需处理";
    } else if (finding.short === "REPL") {
      severity = "risk";
      explanation = "原字符已在上游解码时丢失，当前粘贴文本无法恢复";
      origin = "通常是 UTF-8、GBK 等编码不匹配，或复制源本身已经损坏";
      action = "回到原文件，用正确编码重新打开后再复制；删除 � 也无法猜回原字符";
      recovery = "无法恢复";
    } else if (["control", "unknown"].includes(finding.type)) {
      severity = "risk";
      explanation = "不可打印控制字符，可能影响终端、解析器或数据处理";
      origin = "可能来自二进制数据、终端内容或损坏的文本转换";
      action = "确认来源后移除，或从原始来源重新复制";
      recovery = "可清理";
    }

    finding.severity = severity;
    finding.explanation = explanation;
    finding.origin = origin;
    finding.action = action;
    finding.recovery = recovery;
    return finding;
  });
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

  tokens.forEach(({ value, finding }) => {
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
  xrayOutput.append(fragment);
}

function friendlyFindingName(finding) {
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
  return `检测到 ${count} 个可能随 AI 对话、网页或 PDF 复制带入的不可见字符。它只能说明文本中存在隐藏 Unicode，不能证明内容由 AI 生成。`;
}

function contextSnippet(finding) {
  const points = [...state.plain];
  const targetLength = [...finding.value].length;
  const radius = 18;
  const start = Math.max(0, finding.index - radius);
  const end = Math.min(points.length, finding.index + targetLength + radius);
  const showWhitespace = (value) => value.replace(/\r\n|\r|\n/g, "↵").replace(/\t/g, "⇥");
  const prefix = showWhitespace(points.slice(start, finding.index).join(""));
  const suffix = showWhitespace(points.slice(finding.index + targetLength, end).join(""));
  return `${start ? "…" : ""}${prefix}⟦${finding.short}⟧${suffix}${end < points.length ? "…" : ""}`;
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
    verdictCopy.textContent = `检测到 ${replacements} 个 �（U+FFFD）。请回到原文件，用正确编码重新打开后再复制；当前文本无法恢复这些字符。${notices ? `另有 ${notices} 个字符需要确认。` : ""}${htmlNote}`;
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
    result = result.replace(/\r\n?/g, "\n");
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
    count += (text.match(/\r\n|\r/g) || []).length;
  }

  return count;
}

function renderCleanPreview() {
  state.cleaned = cleanText(state.plain);
  cleanOutput.textContent = state.plain ? state.cleaned : "清理后的文本会显示在这里";
  const changes = countPlannedChanges(state.plain);
  removedCount.textContent = `将改变 ${changes} 处`;
  copyButton.disabled = !state.plain;
}

function renderSource() {
  sourceFormatHelp.textContent = state.activeSource === "plain"
    ? "当前输入框中的纯文本，也是字符检测实际分析的内容。"
    : "粘贴网页或富文本时附带的 HTML 源码，可用于发现隐藏标签、样式和链接。";

  if (!state.plain) {
    sourceOutput.textContent = "尚未读取源数据。\n请在上方输入框中粘贴内容；直接输入文字不会产生 text/html。";
    return;
  }

  if (state.activeSource === "plain") {
    sourceOutput.textContent = state.plain;
  } else {
    sourceOutput.textContent = state.html || "此次输入没有提供 text/html。\n请直接从网页、富文本编辑器或文档中粘贴以检测隐藏 HTML。";
  }
}

function analyze() {
  state.plain = input.value;
  state.tokens = tokenize(state.plain);
  state.findings = assessFindings(buildFindings(state.tokens));
  const groups = aggregateFindings(state.findings);

  characterCount.textContent = `${[...state.plain].length} 字符`;
  emptyHint.classList.toggle("is-hidden", Boolean(state.plain));
  renderXray(state.tokens);
  renderFindingList(groups);
  renderVerdict(state.findings);
  renderSource();
  renderCleanPreview();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

input.addEventListener("input", () => {
  if (!input.value) state.html = "";
  if (state.pendingPaste) {
    state.pendingPaste = false;
  } else {
    clipboardStatus.textContent = input.value ? "手动输入" : "等待输入";
  }
  analyze();
});

input.addEventListener("paste", (event) => {
  state.pendingPaste = true;
  state.html = event.clipboardData?.getData("text/html") || "";
  const types = [...(event.clipboardData?.types || [])];
  clipboardStatus.textContent = state.html ? "已读取纯文本 + HTML" : types.length ? "已读取纯文本" : "已粘贴";
  window.setTimeout(analyze, 0);
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
  state.html = '<p style="font-family: Arial">Invoice&nbsp;<strong>#2048</strong><span style="display:none">tracking</span></p>';
  input.value = "AI 输出复制示例：这段\u200B文字看起来完全正常。\r\n文本传输失败\u2060\uFFFD，可能来自错误编码。\r\nInvoice\u00A0#2048 — approved\r\nPath: src/\u202Etxt.exe\u202C";
  clipboardStatus.textContent = "已载入演示样本";
  analyze();
  input.focus();
});

copyButton.addEventListener("click", async () => {
  if (!state.plain) return;
  try {
    await navigator.clipboard.writeText(state.cleaned);
  } catch {
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(cleanOutput);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("copy");
    selection.removeAllRanges();
  }

  copyLabel.textContent = "已复制";
  showToast("清理后的文本已复制");
  window.setTimeout(() => {
    copyLabel.textContent = "复制清理后的文本";
  }, 1500);
});

analyze();
