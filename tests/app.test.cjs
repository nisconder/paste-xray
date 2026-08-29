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
  assert.match(css, /\.source-tab span\[hidden\]\s*\{\s*display:\s*none;/);
});
