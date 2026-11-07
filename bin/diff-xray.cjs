#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const { analyzeText } = require("../core.js");
const MAX_DIFF_BYTES = 16 * 1024 * 1024;
const MAX_LINE_UNITS = 200000;
const MAX_FINDINGS = 10000;

// Git quotes unusual paths with C escapes and octal UTF-8 bytes, not JSON escapes.
function decodeGitPath(header) {
  let value;
  if (header.startsWith('"')) {
    const bytes = [];
    let closed = false;
    for (let i = 1; i < header.length; i++) {
      const char = header[i];
      if (char === '"') { closed = true; break; }
      if (char !== "\\") {
        const point = String.fromCodePoint(header.codePointAt(i));
        bytes.push(...Buffer.from(point));
        i += point.length - 1;
        continue;
      }
      const next = header[++i];
      if (/[0-7]/.test(next || "")) {
        const octal = header.slice(i).match(/^[0-7]{1,3}/)[0];
        bytes.push(parseInt(octal, 8));
        i += octal.length - 1;
      } else {
        const escapes = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };
        if (!(next in escapes)) throw new Error("Unsupported quoted Git path escape");
        bytes.push(escapes[next]);
      }
    }
    if (!closed) throw new Error("Unterminated quoted Git path");
    value = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
  } else {
    value = header.split("\t", 1)[0];
  }
  return value === "/dev/null" ? null : value.replace(/^b\//, "");
}

function scanDiff(patch) {
  const findings = [];
  const files = new Set();
  let addedLines = 0;
  let target = null;
  let lineNumber = 0;
  let remainingOld = 0;
  let remainingNew = 0;
  let inHunk = false;
  let skippedBinaryFiles = 0;
  const finishHunk = () => {
    if (inHunk && (remainingOld || remainingNew)) throw new Error("Truncated or malformed diff hunk");
    inHunk = false;
  };

  for (const raw of patch.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.startsWith("diff --cc ") || line.startsWith("diff --combined ") || line.startsWith("@@@")) {
      throw new Error("Combined merge diffs are unsupported; provide a unified diff");
    }
    if (line.startsWith("@@ ")) {
      finishHunk();
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!match) throw new Error("Malformed unified diff hunk header");
      if (target === null && Number(match[4] ?? 1) > 0) throw new Error("Hunk has no target file header");
      remainingOld = Number(match[2] ?? 1);
      remainingNew = Number(match[4] ?? 1);
      lineNumber = Number(match[3]);
      inHunk = true;
      continue;
    }
    // Interpret hunk data before headers: added source lines may start with +++.
    if (inHunk && (remainingOld || remainingNew)) {
      if (line.startsWith("\\ No newline at end of file")) continue;
      if (line.startsWith("+")) {
        if (remainingNew <= 0 || target === null) throw new Error("Malformed added diff line");
        const text = line.slice(1);
        if (text.length > MAX_LINE_UNITS) throw new Error("An added line exceeds 200,000 UTF-16 units; split the change and retry");
        files.add(target);
        addedLines++;
        const analysis = analyzeText(text);
        for (const finding of analysis.findings) {
          if (finding.severity === "structure") continue;
          if (findings.length >= MAX_FINDINGS) throw new Error("More than 10,000 findings; split the change and retry");
          const start = Math.max(0, finding.index - 40);
          const end = Math.min(analysis.tokens.length, finding.index + 41);
          const context = (start ? "…" : "") + analysis.tokens.slice(start, end).map(({ value }) => value).join("")
            + (end < analysis.tokens.length ? "…" : "");
          findings.push({ path: target, line: lineNumber, column: finding.index + 1,
            code: finding.code, type: finding.type, short: finding.short,
            severity: finding.severity, reason: finding.explanation, action: finding.action,
            context, contextStartColumn: start + 1 });
        }
        remainingNew--;
        lineNumber++;
      } else if (line.startsWith("-")) {
        if (remainingOld <= 0) throw new Error("Malformed removed diff line");
        remainingOld--;
      } else if (line.startsWith(" ")) {
        if (remainingOld <= 0 || remainingNew <= 0) throw new Error("Malformed context diff line");
        remainingOld--;
        remainingNew--;
        lineNumber++;
      } else {
        throw new Error("Truncated or malformed diff hunk");
      }
      continue;
    }
    if (line.startsWith("diff --git ")) { finishHunk(); target = null; }
    else if (line.startsWith("--- ")) { finishHunk(); target = null; }
    else if (line.startsWith("+++ ")) { finishHunk(); target = decodeGitPath(line.slice(4)); }
    else if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) skippedBinaryFiles++;
    else if (/^[+ -]/.test(line) && inHunk) throw new Error("Diff hunk contains extra lines");
  }
  finishHunk();
  // Refuse arbitrary input rather than returning a misleading clean result.
  if (patch.trim() && !/^diff --git |^--- |^Binary files |^GIT binary patch/m.test(patch)) {
    throw new Error("Expected a unified Git diff (empty input is allowed)");
  }
  return { schemaVersion: 1, scannedFiles: files.size, addedLines, skippedBinaryFiles, findings };
}

function displayText(text) {
  return [...text].map((char) => /[\p{Cf}\p{Cc}\p{Zl}\p{Zp}]/u.test(char)
    || (/\p{Zs}/u.test(char) && char !== " ")
    ? `\\u{${char.codePointAt(0).toString(16).toUpperCase()}}` : char).join("");
}

function readStdin() {
  const chunks = [];
  let size = 0;
  const buffer = Buffer.alloc(65536);
  for (;;) {
    const count = fs.readSync(0, buffer, 0, buffer.length, null);
    if (!count) break;
    size += count;
    if (size > MAX_DIFF_BYTES) throw new Error("Diff exceeds the 16 MiB limit; split the change and retry");
    chunks.push(Buffer.from(buffer.subarray(0, count)));
  }
  return Buffer.concat(chunks);
}

function main(args) {
  const help = "Usage: node bin/diff-xray.cjs [--staged | --worktree | --stdin] [--json] [--fail-on risk|notice|never]\n"
    + "Default: staged changes; report risk and notice findings; exit 1 on risk.\n"
    + "Exit 0: threshold not met; 1: findings meet threshold; 2: input or Git error.\n"
    + "No files are changed. Requires Node.js 18+. --stdin accepts UTF-8 unified diffs up to 16 MiB.\n";
  let mode = "--staged";
  let explicitMode = false;
  let json = false;
  let failOn = "risk";
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") { process.stdout.write(help); return 0; }
    if (["--staged", "--worktree", "--stdin"].includes(arg)) {
      if (explicitMode) throw new Error("Choose one input mode");
      mode = arg;
      explicitMode = true;
    } else if (arg === "--json") json = true;
    else if (arg === "--fail-on") {
      failOn = args[++i];
      if (!["risk", "notice", "never"].includes(failOn)) throw new Error("--fail-on must be risk, notice, or never");
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  const buffer = mode === "--stdin" ? readStdin() : execFileSync("git", [
    "--no-pager", "-c", "core.quotepath=false", "diff", "--no-ext-diff", "--no-textconv",
    "--no-color", "--no-renames", "--unified=0", ...(mode === "--staged" ? ["--cached"] : []), "--",
  ], { maxBuffer: MAX_DIFF_BYTES, stdio: ["ignore", "pipe", "pipe"] });
  const patch = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  const result = scanDiff(patch);
  result.input = mode.slice(2);
  result.failOn = failOn;
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    for (const finding of result.findings) {
      process.stdout.write(`${displayText(finding.path)}:${finding.line}:${finding.column} [${finding.severity}] ${finding.code} ${finding.short}: ${displayText(finding.reason)}\n  ${displayText(finding.context)}\n`);
    }
    process.stdout.write(`Scanned ${result.addedLines} added lines in ${result.scannedFiles} files; ${result.findings.length} findings; ${result.skippedBinaryFiles} binary files skipped.\n`);
  }
  return failOn !== "never" && result.findings.some(({ severity }) => severity === "risk" || failOn === "notice") ? 1 : 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`diff-xray: ${displayText(error.message)}\n`);
    process.exitCode = 2;
  }
}

module.exports = { scanDiff, decodeGitPath, displayText, main };
