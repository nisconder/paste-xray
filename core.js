// Shared, DOM-free Unicode analysis for the browser, Worker and Git diff CLI.
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

const HOMOGLYPH_GROUPS = [
  ["Cyrillic", "CYR", "A", "\u0410"], ["Cyrillic", "CYR", "B", "\u0412"],
  ["Cyrillic", "CYR", "C", "\u0421"], ["Cyrillic", "CYR", "E", "\u0415"],
  ["Cyrillic", "CYR", "G", "\u050C"], ["Cyrillic", "CYR", "H", "\u041D"],
  ["Cyrillic", "CYR", "I", "\u0406"], ["Cyrillic", "CYR", "J", "\u0408"],
  ["Cyrillic", "CYR", "K", "\u041A"], ["Cyrillic", "CYR", "M", "\u041C"],
  ["Cyrillic", "CYR", "O", "\u041E"], ["Cyrillic", "CYR", "P", "\u0420"],
  ["Cyrillic", "CYR", "S", "\u0405"], ["Cyrillic", "CYR", "T", "\u0422"],
  ["Cyrillic", "CYR", "X", "\u0425"], ["Cyrillic", "CYR", "Y", "\u0423"],
  ["Cyrillic", "CYR", "a", "\u0430"], ["Cyrillic", "CYR", "c", "\u0441"],
  ["Cyrillic", "CYR", "d", "\u0501"], ["Cyrillic", "CYR", "e", "\u0435"],
  ["Cyrillic", "CYR", "i", "\u0456"], ["Cyrillic", "CYR", "j", "\u0458"],
  ["Cyrillic", "CYR", "l", "\u04CF"], ["Cyrillic", "CYR", "o", "\u043E"],
  ["Cyrillic", "CYR", "p", "\u0440"], ["Cyrillic", "CYR", "q", "\u051B"],
  ["Cyrillic", "CYR", "s", "\u0455"], ["Cyrillic", "CYR", "x", "\u0445"],
  ["Cyrillic", "CYR", "y", "\u0443"],
  ["Greek", "GRK", "A", "\u0391"], ["Greek", "GRK", "B", "\u0392"],
  ["Greek", "GRK", "C", "\u03F9"], ["Greek", "GRK", "E", "\u0395"],
  ["Greek", "GRK", "H", "\u0397"], ["Greek", "GRK", "I", "\u0399"],
  ["Greek", "GRK", "K", "\u039A"], ["Greek", "GRK", "M", "\u039C"],
  ["Greek", "GRK", "N", "\u039D"], ["Greek", "GRK", "O", "\u039F"],
  ["Greek", "GRK", "P", "\u03A1"], ["Greek", "GRK", "T", "\u03A4"],
  ["Greek", "GRK", "X", "\u03A7"], ["Greek", "GRK", "Y", "\u03A5"],
  ["Greek", "GRK", "Z", "\u0396"], ["Greek", "GRK", "c", "\u03F2"],
  ["Greek", "GRK", "i", "\u03B9"], ["Greek", "GRK", "o", "\u03BF"],
  ["Greek", "GRK", "p", "\u03C1"], ["Greek", "GRK", "v", "\u03BD"],
  ["Greek", "GRK", "x", "\u03C7"],
];

const HOMOGLYPHS = new Map(
  HOMOGLYPH_GROUPS.flatMap(([script, label, skeleton, characters]) =>
    [...characters].map((character) => [character, { script, label, skeleton }]),
  ),
);

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

function characterScript(value) {
  if (/^\p{Script=Latin}$/u.test(value)) return "Latin";
  if (/^\p{Script=Cyrillic}$/u.test(value)) return "Cyrillic";
  if (/^\p{Script=Greek}$/u.test(value)) return "Greek";
  return "";
}

function isSpoofRunCharacter(value) {
  return /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{N}._:@/\\-]$/u.test(value);
}

function annotateHomoglyphs(tokens) {
  let cursor = 0;
  while (cursor < tokens.length) {
    if (!isSpoofRunCharacter(tokens[cursor].value)) {
      cursor += 1;
      continue;
    }

    // Inspect each contiguous run once, even when every other character is a
    // candidate. Re-scanning the whole run per candidate makes long input quadratic.
    const start = cursor;
    const scripts = new Set();
    const candidates = [];
    while (cursor < tokens.length && isSpoofRunCharacter(tokens[cursor].value)) {
      const token = tokens[cursor];
      const script = characterScript(token.value);
      if (script) scripts.add(script);
      const match = HOMOGLYPHS.get(token.value);
      if (match && !token.finding) candidates.push({ token, match });
      cursor += 1;
    }
    if (scripts.size < 2 || !candidates.length) continue;

    // Share the run text and script summary instead of copying them per finding.
    const run = tokens.slice(start, cursor).map(({ value }) => value).join("");
    const mixedScripts = [...scripts];
    candidates.forEach(({ token, match }) => {
      token.finding = {
        value: token.value,
        index: token.index,
        type: "homoglyph",
        short: `≈${match.skeleton}`,
        name: `${match.script === "Cyrillic" ? "西里尔" : "希腊"}字符，外形接近字母 ${match.skeleton}`,
        code: codePointLabel(token.value),
        script: match.script,
        skeleton: match.skeleton,
        mixedScripts,
        run,
      };
    });
  }
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
    tokens.push({ value, finding, index: stringIndex });
    stringIndex += [...value].length;
  }

  annotateHomoglyphs(tokens);
  return tokens;
}

function buildFindings(tokens) {
  return tokens.filter((token) => token.finding).map((token) => token.finding);
}

function assessFindings(findings) {
  const runPreviews = new Map();
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
    } else if (finding.type === "homoglyph") {
      severity = "risk";
      explanation = `“${finding.value}”看起来像字母 ${finding.skeleton}，但电脑会把它们当成两个不同字符`;
      origin = "可能是正常的多语言文字，也可能被人用来伪装网址、账号、文件名或代码";
      // A single mixed-script run can contain thousands of findings. Bound and
      // reuse its display text instead of building a full-line action per glyph.
      if (!runPreviews.has(finding.run)) {
        const preview = [...finding.run.slice(0, 160)].slice(0, 80).join("");
        runPreviews.set(finding.run, preview + (preview.length < finding.run.length ? "…" : ""));
      }
      action = `先核对“${runPreviews.get(finding.run)}”的来源，不要直接登录、付款或运行；重要地址建议自己重新输入`;
      recovery = "需人工确认";
    } else if (finding.type === "punct") {
      severity = "structure";
      explanation = "常见的智能排版标点，本身可见且通常无需清理";
      origin = "通常由 Typora、Word、输入法或智能标点功能产生";
      action = "文章排版可保留；代码或机器输入可转换为 ASCII 标点";
      recovery = "无需处理";
    } else if (finding.short === "REPL") {
      severity = "risk";
      explanation = "原字符已在上游解码时丢失，当前粘贴文本无法恢复";
      origin = "通常是文件被错误方式打开，或复制来源本身已经损坏";
      action = "回到原文件，用原来的应用或记事本重新打开后再复制；删除 � 也无法猜回原字符";
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

function analyzeText(text) {
  const tokens = tokenize(text);
  return { tokens, findings: assessFindings(buildFindings(tokens)) };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ZERO_WIDTH, AI_COPY_MARKERS, SPECIAL_SPACES, BIDI, PUNCTUATION, isUnicodeTag, codePointLabel, classify, characterScript, isSpoofRunCharacter, annotateHomoglyphs, tokenize, buildFindings, assessFindings, analyzeText };
}
