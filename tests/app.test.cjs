const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class FakeClassList {
  add() {}
  remove() {}
  toggle() {}
}

class FakeElement {
  constructor() {
    this.checked = false;
    this.classList = new FakeClassList();
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.style = {};
    this.textContent = "";
    this.value = "";
  }

  addEventListener() {}
  append() {}
  focus() {}
  replaceChildren() {}
  setAttribute() {}
}

function createContext() {
  const elements = new Map();
  const get = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new FakeElement());
    return elements.get(selector);
  };

  get("#clean-zero").checked = true;
  get("#clean-bidi").checked = true;
  get("#clean-space").checked = true;

  const plainTab = new FakeElement();
  plainTab.dataset.source = "plain";
  const htmlTab = new FakeElement();
  htmlTab.dataset.source = "html";

  const document = {
    createDocumentFragment: () => new FakeElement(),
    createElement: () => new FakeElement(),
    createRange: () => ({ selectNodeContents() {} }),
    createTextNode: (text) => ({ textContent: text }),
    execCommand: () => true,
    querySelector: get,
    querySelectorAll: (selector) => {
      if (selector === ".source-tab") return [plainTab, htmlTab];
      if (selector === ".clean-options input") {
        return [get("#clean-zero"), get("#clean-bidi"), get("#clean-replacement"), get("#clean-space"), get("#clean-punct"), get("#clean-lines")];
      }
      return [];
    },
  };

  class FakeDOMParser {
    parseFromString(html) {
      return {
        body: {
          querySelectorAll: () => html.match(/<([a-z][^\s/>]*)\b[^>]*>/gi) || [],
        },
      };
    }
  }

  const context = vm.createContext({
    DOMParser: FakeDOMParser,
    TextDecoder,
    console,
    document,
    navigator: { clipboard: { writeText: async () => {} } },
    setTimeout,
    window: {
      clearTimeout,
      getSelection: () => ({ addRange() {}, removeAllRanges() {} }),
      setTimeout,
    },
  });

  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  vm.runInContext(source, context);
  return { context, elements };
}

function evaluate(context, expression) {
  return JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context));
}

test("classifies zero-width, NBSP, bidi, punctuation, and CRLF", () => {
  const { context } = createContext();
  const findings = evaluate(
    context,
    `buildFindings(tokenize("A\\u00A0B\\u200BC\\u202ED\\u202C—\\r\\n"))`,
  );

  assert.deepEqual(
    findings.map(({ type, short }) => [type, short]),
    [
      ["space", "NBSP"],
      ["zero", "ZWSP"],
      ["bidi", "RLO"],
      ["bidi", "PDF"],
      ["punct", "EMDASH"],
      ["line", "CRLF"],
    ],
  );
});

test("classifies every supported zero-width format and supplementary Unicode tag", () => {
  const { context } = createContext();
  const findings = evaluate(
    context,
    `buildFindings(tokenize("\\u034F\\u00AD\\u180E\\u200B\\u200C\\u200D\\u2060\\u2061\\u2062\\u2063\\u2064\\uFEFF\\u{E0061}\\u{E007F}"))`,
  );

  assert.deepEqual(findings.map(({ short, code }) => [short, code]), [
    ["CGJ", "U+034F"],
    ["SHY", "U+00AD"],
    ["MVS", "U+180E"],
    ["ZWSP", "U+200B"],
    ["ZWNJ", "U+200C"],
    ["ZWJ", "U+200D"],
    ["WJ", "U+2060"],
    ["FUNC", "U+2061"],
    ["ITIMES", "U+2062"],
    ["ISEP", "U+2063"],
    ["IPLUS", "U+2064"],
    ["BOM", "U+FEFF"],
    ["TAG", "U+E0061"],
    ["TAGEND", "U+E007F"],
  ]);
});

test("AI-copy hint explains possible sources without claiming AI authorship", () => {
  const { context } = createContext();
  const hint = vm.runInContext(
    `buildAiCopyHint(assessFindings(buildFindings(tokenize("AI\\u200B回答\\u2060结束\\u{E0061}"))))`,
    context,
  );

  assert.match(hint, /3 个/);
  assert.match(hint, /肉眼看不见/);
  assert.match(hint, /复制 AI 回答、网页或 PDF/);
  assert.match(hint, /搜索匹配失败、链接失效/);
  assert.match(hint, /先别直接使用/);
  assert.match(hint, /不能证明内容由 AI 生成/);
});

test("legitimate emoji and language joiners do not trigger the AI-copy hint", () => {
  const { context } = createContext();
  const hint = vm.runInContext(
    `buildAiCopyHint(assessFindings(buildFindings(tokenize("emoji\\u200D组合\\u200C文字\\u180E"))))`,
    context,
  );

  assert.equal(hint, "");
});

test("emoji ZWJ keeps the user-facing AI-copy callout hidden", () => {
  const { context, elements } = createContext();
  elements.get("#text-input").value = "开发者 👩‍💻";
  vm.runInContext("analyze()", context);

  assert.equal(elements.get("#origin-hint").hidden, true);
  assert.equal(elements.get("#origin-hint").textContent, "");
});

test("AI-copy hint is visible in the verdict and keeps code-point positions accurate", () => {
  const { context, elements } = createContext();
  elements.get("#text-input").value = "🤖AI\u200B输出\u200B";
  vm.runInContext("analyze()", context);

  assert.equal(elements.get("#origin-hint").hidden, false);
  assert.match(elements.get("#origin-hint").textContent, /2 个/);
  assert.match(elements.get("#origin-hint").textContent, /不能证明内容由 AI 生成/);
  const groups = evaluate(context, "aggregateFindings(state.findings)");
  assert.deepEqual(groups.find(({ short }) => short === "ZWSP").positions, [3, 6]);
});

test("zero-width cleaning removes supplementary Unicode tags and counts each change", () => {
  const { context } = createContext();
  const cleaned = vm.runInContext(`cleanText("A\\u200BB\\u{E0061}C\\u{E007F}")`, context);
  const changes = vm.runInContext(`countPlannedChanges("A\\u200BB\\u{E0061}C\\u{E007F}")`, context);

  assert.equal(cleaned, "ABC");
  assert.equal(changes, 3);
});

test("grades consistent, mixed, and exotic line endings separately", () => {
  const { context } = createContext();
  const consistent = evaluate(
    context,
    `assessFindings(buildFindings(tokenize("A\\r\\nB\\r\\nC")))`,
  );
  const mixed = evaluate(
    context,
    `assessFindings(buildFindings(tokenize("A\\nB\\nC\\r\\nD")))`,
  );
  const exotic = evaluate(
    context,
    `assessFindings(buildFindings(tokenize("A\\u2028B")))`,
  );

  assert.deepEqual(consistent.map(({ severity }) => severity), ["structure", "structure"]);
  assert.deepEqual(mixed.map(({ short, severity }) => [short, severity]), [
    ["LF", "structure"],
    ["LF", "structure"],
    ["CRLF", "notice"],
  ]);
  assert.deepEqual(exotic.map(({ short, severity }) => [short, severity]), [["LS", "notice"]]);
});

test("distinguishes normal typography, contextual characters, and risky controls", () => {
  const { context } = createContext();
  const findings = evaluate(
    context,
    `assessFindings(buildFindings(tokenize("“A”\\u200D\\u202Ename\\u202C\\uFEFF\\uFFFD")))`,
  );

  assert.deepEqual(findings.map(({ short, severity }) => [short, severity]), [
    ["LDQUO", "structure"],
    ["RDQUO", "structure"],
    ["ZWJ", "notice"],
    ["RLO", "risk"],
    ["PDF", "risk"],
    ["BOM", "risk"],
    ["REPL", "risk"],
  ]);

  const replacement = findings.find(({ short }) => short === "REPL");
  assert.equal(replacement.recovery, "无法恢复");
  assert.match(replacement.action, /正确编码重新打开/);
});

test("default cleaning removes risky controls and normalizes special spaces", () => {
  const { context } = createContext();
  const cleaned = vm.runInContext(`cleanText("left\\u00A0mid\\u200Bright\\u202E.txt\\u202C—\\r\\n")`, context);

  assert.equal(cleaned, "left midright.txt—\r\n");
});

test("optional punctuation and newline cleaning is deterministic", () => {
  const { context, elements } = createContext();
  elements.get("#clean-punct").checked = true;
  elements.get("#clean-lines").checked = true;

  const cleaned = vm.runInContext(`cleanText("“A” — B…\\r\\nC\\rD")`, context);
  const changes = vm.runInContext(`countPlannedChanges("“A” — B…\\r\\nC\\rD")`, context);

  assert.equal(cleaned, '"A" - B...\nC\nD');
  assert.equal(changes, 6);
});

test("replacement character deletion is explicit and cannot imply recovery", () => {
  const { context, elements } = createContext();
  elements.get("#clean-replacement").checked = true;
  const cleaned = vm.runInContext(`cleanText("传输失败\\uFFFD，继续")`, context);
  const changes = vm.runInContext(`countPlannedChanges("传输失败\\uFFFD，继续")`, context);

  assert.equal(cleaned, "传输失败，继续");
  assert.equal(changes, 1);
});

test("replacement character produces a concrete unrecoverable verdict", () => {
  const { context, elements } = createContext();
  elements.get("#text-input").value = "运行失败\u2060\uFFFD";
  vm.runInContext("analyze()", context);

  assert.equal(elements.get("#verdict-title").textContent, "原字符已经丢失");
  assert.match(elements.get("#verdict-copy").textContent, /正确编码重新打开/);
  assert.equal(elements.get("#issue-count").textContent, 2);
});

test("HTML tag counter reports clipboard markup", () => {
  const { context } = createContext();
  const count = vm.runInContext(`countHtmlTags("<p>Hello <strong>world</strong><span hidden>x</span></p>")`, context);
  assert.equal(count, 3);
});

test("flags mixed-script homoglyphs in domains without accusing normal Cyrillic text", () => {
  const { context } = createContext();
  const suspicious = evaluate(
    context,
    `assessFindings(buildFindings(tokenize("https://\u0440\u0430ypal.com/login")))`,
  );
  const normal = evaluate(
    context,
    `assessFindings(buildFindings(tokenize("Привет мир")))`,
  );

  assert.deepEqual(suspicious.map(({ type, skeleton, severity }) => [type, skeleton, severity]), [
    ["homoglyph", "p", "risk"],
    ["homoglyph", "a", "risk"],
  ]);
  assert.equal(normal.filter(({ type }) => type === "homoglyph").length, 0);
});

test("decodes UTF-8 and BOM-marked UTF-16 files while preserving the BOM for inspection", () => {
  const { context } = createContext();
  const utf8 = vm.runInContext(
    `decodeTextBuffer(new Uint8Array([0xEF, 0xBB, 0xBF, 0x41]).buffer)`,
    context,
  );
  const utf16 = vm.runInContext(
    `decodeTextBuffer(new Uint8Array([0xFF, 0xFE, 0x41, 0x00]).buffer)`,
    context,
  );

  assert.equal(utf8, "\uFEFFA");
  assert.equal(utf16, "\uFEFFA");
});

test("loads an accepted local text file into the analyzer without a network step", async () => {
  const { context, elements } = createContext();
  context.testFile = {
    name: "audit.txt",
    type: "text/plain",
    size: 5,
    arrayBuffer: async () => new Uint8Array([0x68, 0x65, 0x6C, 0x6C, 0x6F]).buffer,
  };

  await vm.runInContext("loadTextFile(testFile)", context);

  assert.equal(elements.get("#text-input").value, "hello");
  assert.match(elements.get("#clipboard-status").textContent, /本地文件 · audit\.txt/);
  assert.equal(vm.runInContext("state.source.kind", context), "file");
});

test("standalone HTML report escapes scanned text and includes findings", () => {
  const { context, elements } = createContext();
  elements.get("#text-input").value = '<script>alert("x")</script> https://\u0440\u0430ypal.com';
  vm.runInContext("analyze()", context);
  const report = vm.runInContext(`buildReportHtml(new Date("2026-08-30T00:00:00Z"))`, context);

  assert.match(report, /Content-Security-Policy/);
  assert.match(report, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(report, /<script>/);
  assert.match(report, /CYR→p/);
  assert.match(report, /分享前请确认其中没有密码、密钥、个人信息/);
});

test("input UI exposes local file drop and report export controls", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

  assert.match(html, /id="file-input"[^>]+type="file"/s);
  assert.match(html, /id="file-drop-overlay"/);
  assert.match(html, /id="report-button"[^>]+disabled/);
  assert.match(html, /独立 HTML/);
});

test("destructive cleaning choices are disabled by default in the interface", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  for (const id of ["clean-zero", "clean-bidi", "clean-replacement", "clean-space", "clean-punct", "clean-lines"]) {
    const tag = html.match(new RegExp(`<input[^>]+id="${id}"[^>]*>`))?.[0];
    assert.ok(tag, `${id} exists`);
    assert.doesNotMatch(tag, /\schecked(?:\s|\/>)/);
  }
});

test("Chinese hero title uses two non-breaking layout lines", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const lines = html.match(/class="hero-title-line(?: hero-title-accent)?"/g) || [];

  assert.equal(lines.length, 2);
  assert.match(html, /hero-title-line">让不可见字符<\/span>/);
  assert.match(html, /hero-title-line hero-title-accent">留下指纹。<\/span>/);
});

test("empty HTML count badge remains hidden", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(css, /\.source-tab-count\[hidden\]\s*\{\s*display:\s*none;/);
});

test("clipboard format switch has structured labels and an integrated focus state", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

  assert.match(html, /source-tab-label">纯文本<\/span>\s*<small>text\/plain<\/small>/);
  assert.match(html, /source-tab-label">HTML 源码<\/span>\s*<small>text\/html<\/small>/);
  assert.match(css, /\.source-tab\.is-active\s*\{[^}]*background:\s*var\(--blue\)/s);
  assert.match(css, /\.source-tab:focus-visible\s*\{[^}]*outline:\s*0/s);
});

test("severity colors stay consistent across x-ray tokens, legend, and findings", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

  for (const severity of ["risk", "notice", "structure"]) {
    assert.match(css, new RegExp(`\\.xray-token\\.severity-${severity}\\s*\\{[^}]*var\\(--severity-${severity}\\)`, "s"));
    assert.match(css, new RegExp(`\\.legend-${severity}\\s*\\{[^}]*var\\(--severity-${severity}\\)`, "s"));
  }
  assert.doesNotMatch(css, /\.xray-token\.type-(?:zero|space|bidi|punct|unknown)\s*\{[^}]*background:/s);
});

test("problem sample tells a coherent high-stakes AI-copy scenario", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.match(source, /先别直接使用：这段内容从 AI 回答复制而来/);
  assert.match(source, /却藏着\\u200B肉眼看不见的字符/);
  assert.match(source, /原字符已经丢失\\u2060\\uFFFD/);
  assert.match(source, /可疑文件：src\/\\u202Etxt\.exe\\u202C/);
});

test("deployed CSS and JavaScript URLs carry the same cache-busting version", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const styleVersion = html.match(/styles\.css\?v=([^"']+)/)?.[1];
  const scriptVersion = html.match(/app\.js\?v=([^"']+)/)?.[1];

  assert.ok(styleVersion);
  assert.equal(scriptVersion, styleVersion);
});
