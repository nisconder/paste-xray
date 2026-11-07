const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync, spawnSync } = require("node:child_process");
const test = require("node:test");
const vm = require("node:vm");
const { scanDiff, decodeGitPath, displayText } = require("../bin/diff-xray.cjs");
const { analyzeText } = require("../core.js");
const cli = path.resolve(__dirname, "../bin/diff-xray.cjs");
const patch = (text) => `diff --git a/example.js b/example.js\n--- a/example.js\n+++ b/example.js\n@@ -0,0 +1 @@\n+${text}\n`;
const run = (args, input, cwd) => spawnSync(process.execPath, [cli, ...args], { input, cwd, encoding: "utf8" });

test("CLI reuses the browser engine and emits code-point columns after emoji", () => {
  const text = "😀const pаypal = '\u202E';";
  const result = scanDiff(patch(text));
  assert.deepEqual(result.findings.map(({ code, column, severity }) => ({ code, column, severity })),
    analyzeText(text).findings.filter(({ severity }) => severity !== "structure")
      .map(({ code, index, severity }) => ({ code, column: index + 1, severity })));
  assert.equal(result.findings[0].column, 9);
});

test("removed and context lines are not scanned; target coordinates survive multiple hunks and files", () => {
  const result = scanDiff(`diff --git a/one.js b/one.js
--- a/one.js
+++ b/one.js
@@ -10,3 +10,3 @@
-deleted\u202E
+clean
 context\u202E
-old
+added\u200B
@@ -40 +40,2 @@
-old
+a
+++literal\u202E
diff --git a/two file.js b/two file.js
--- a/two file.js
+++ b/two file.js
@@ -0,0 +1 @@
+\u202E
`);
  assert.equal(result.addedLines, 5);
  assert.equal(result.scannedFiles, 2);
  assert.deepEqual(result.findings.map(({ path, line, column }) => [path, line, column]),
    [["one.js", 12, 6], ["one.js", 41, 10], ["two file.js", 1, 1]]);
});

test("Git C-quoted paths decode UTF-8, tabs, quotes and backslashes without filesystem access", () => {
  assert.equal(decodeGitPath('"b/\\344\\270\\255\\346\\226\\207\\t\\"x\\\\.js"'), '中文\t"x\\.js');
  assert.equal(decodeGitPath("b/space name.js\t2026-01-01"), "space name.js");
  assert.equal(decodeGitPath("/dev/null"), null);
  assert.throws(() => decodeGitPath('"b/unfinished'), /Unterminated/);
});

test("CRLF transport, standalone unified patches and no-final-newline markers are accepted", () => {
  const result = scanDiff("--- a/one\r\n+++ b/one\r\n@@ -1 +1 @@\r\n-old\r\n+safe\u200B\r\n\\ No newline at end of file\r\n--- a/two\r\n+++ b/two\r\n@@ -0,0 +1 @@\r\n+plain\r\n");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].code, "U+200B");
  assert.equal(result.addedLines, 2);
});

test("empty, deletion-only and binary changes do not create false positive additions", () => {
  assert.equal(scanDiff("").addedLines, 0);
  const deletion = "diff --git a/old b/old\n--- a/old\n+++ /dev/null\n@@ -1 +0,0 @@\n-\u202E\n";
  assert.equal(scanDiff(deletion).findings.length, 0);
  assert.equal(scanDiff("diff --git a/pic b/pic\nBinary files a/pic and b/pic differ\n").skippedBinaryFiles, 1);
});

test("BOM at a later target line is mid-document even when it starts an added line", () => {
  const result = scanDiff(patch("\uFEFFtext").replace("+1 @@", "+20 @@"));
  assert.equal(result.findings[0].line, 20);
  assert.equal(result.findings[0].column, 1);
  assert.equal(result.findings[0].severity, "risk");
  assert.equal(scanDiff(patch("\uFEFFtext")).findings[0].severity, "notice");
});

test("invalid and truncated input fails instead of reporting a clean scan", () => {
  for (const input of ["hello", patch("ok").replace("+1 @@", "+1,2 @@"),
    "diff --cc x\n@@@ -1 -1 +1 @@@\n", "@@ -0,0 +1 @@\n+bad\n"]) {
    assert.throws(() => scanDiff(input));
    assert.equal(run(["--stdin"], input).status, 2);
  }
  assert.equal(run(["--stdin"], Buffer.from([0xff])).status, 2);
  assert.equal(run(["--stdin", "--fail-on", "wat"], "").status, 2);
});

test("CI exit policy distinguishes risk, notice, normal multilingual text and input errors", () => {
  assert.equal(run(["--stdin"], patch("\u202E")).status, 1);
  assert.equal(run(["--stdin"], patch("hello\u200B")).status, 0);
  assert.equal(run(["--stdin", "--fail-on", "notice"], patch("hello\u200B")).status, 1);
  assert.equal(run(["--stdin", "--fail-on", "never"], patch("\u202E")).status, 0);
  assert.equal(run(["--stdin"], patch("Привет мир 中文 👩‍💻")).status, 0);
  const result = run(["--stdin", "--json"], patch("hello\u200B"));
  assert.equal(JSON.parse(result.stdout).findings[0].line, 1);
  assert.equal(JSON.parse(result.stdout).failOn, "risk");
});

test("terminal output escapes control characters in source and hostile paths", () => {
  const result = run(["--stdin"], patch("a\u202E\u001B[31m"));
  assert.match(result.stdout, /\\u\{202E\}/);
  assert.match(result.stdout, /\\u\{1B\}/);
  assert.doesNotMatch(result.stdout, /\u202E|\u001B/);
  assert.equal(displayText("x\n\u202E.js"), "x\\u{A}\\u{202E}.js");
});

test("long mixed-script lines retain exact positions while bounding repeated context and advice", () => {
  const result = scanDiff(patch("aа".repeat(2000)));
  assert.equal(result.findings.length, 2000);
  assert.equal(result.findings.at(-1).column, 4000);
  assert.ok(result.findings.every(({ context, action }) => context.length <= 83 && action.length < 200));
  assert.ok(JSON.stringify(result).length < 1500000);
});

test("resource limits fail explicitly and do not silently truncate findings", () => {
  assert.throws(() => scanDiff(patch("x".repeat(200001))), /200,000/);
  assert.throws(() => scanDiff(patch("\u200B".repeat(10001))), /10,000 findings/);
  assert.equal(run(["--stdin"], "x".repeat(16 * 1024 * 1024 + 1)).status, 2);
});

test("actual Git index is scanned by default, worktree is opt-in, files remain untouched", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "paste-xray-git-"));
  try {
    const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
    git("init", "--quiet");
    const name = "中文 file.js";
    fs.writeFileSync(path.join(root, name), "first\nsecond\u202E\n");
    git("add", "--", name);
    fs.writeFileSync(path.join(root, name), "plain worktree\n");
    const staged = run(["--json"], undefined, root);
    assert.equal(staged.status, 1, staged.stderr);
    assert.equal(JSON.parse(staged.stdout).findings[0].path, name);
    assert.equal(JSON.parse(staged.stdout).findings[0].line, 2);
    assert.equal(run(["--worktree"], undefined, root).status, 0);
    assert.equal(fs.readFileSync(path.join(root, name), "utf8"), "plain worktree\n");
    const index = git("show", `:${name}`).toString();
    assert.match(index, /second\u202E/);
  } finally {
    const resolved = fs.realpathSync(root);
    assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
    assert.ok(path.basename(resolved).startsWith("paste-xray-git-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

test("Worker imports the shared engine and returns serializable results with request IDs", () => {
  let received;
  const context = vm.createContext({ self: { postMessage: (data) => { received = data; } } });
  context.importScripts = (url) => {
    assert.equal(url, "core.js?v=20261107-1");
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../core.js"), "utf8"), context);
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../analysis-worker.js"), "utf8"), context);
  context.self.onmessage({ data: { id: 42, text: "a\u202E" } });
  assert.equal(received.id, 42);
  assert.equal(structuredClone(received).findings[0].code, "U+202E");
});
