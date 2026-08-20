import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

export interface Mutation {
  id: number;
  file: string;
  line: number;
  column: number;
  original: string;
  replacement: string;
  start: number;
  end: number;
}

export interface MutationResult extends Mutation {
  status: "killed" | "survived" | "timeout";
  exitCode: number | null;
}

const EXCLUDED_DIRS = new Set([".git", ".next", "coverage", "dist", "build", "node_modules", "target", "vendor"]);
const REPLACEMENTS = new Map<string, string>([
  ["===", "!=="], ["!==", "==="], ["==", "!="], ["!=", "=="],
  [">", "<="], ["<", ">="], [">=", "<"], ["<=", ">"],
  ["&&", "||"], ["||", "&&"], ["true", "false"], ["false", "true"],
  ["+", "-"], ["-", "+"],
]);

function lineColumn(text: string, offset: number): [number, number] {
  let line = 1;
  let lastBreak = -1;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) { line += 1; lastBreak = index; }
  }
  return [line, offset - lastBreak];
}

export function discoverFiles(root: string, filters: readonly string[] = []): string[] {
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name) && entry.name !== "test" && entry.name !== "tests") walk(join(directory, entry.name));
        continue;
      }
      if (!entry.isFile() || (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx"))) continue;
      if (entry.name.endsWith(".d.ts") || /(?:^|\.)((spec)|(test))\.[cm]?tsx?$/.test(entry.name)) continue;
      const path = join(directory, entry.name);
      const rel = relative(root, path).replaceAll("\\", "/");
      if (filters.length === 0 || filters.some((fragment) => rel.includes(fragment))) files.push(path);
    }
  };
  walk(root);
  return files.sort();
}

export function enumerateMutations(path: string, root = process.cwd(), startId = 1): Mutation[] {
  const text = readFileSync(path, "utf8");
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard, text);
  const mutations: Mutation[] = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    const start = scanner.getTokenPos();
    const end = scanner.getTextPos();
    const original = text.slice(start, end);
    const replacement = REPLACEMENTS.get(original);
    if (replacement === undefined) continue;
    const [line, column] = lineColumn(text, start);
    mutations.push({
      id: startId + mutations.length,
      file: relative(root, path).replaceAll("\\", "/"),
      line,
      column,
      original,
      replacement,
      start,
      end,
    });
  }
  return mutations;
}

export function collectMutations(root: string, filters: readonly string[] = []): Mutation[] {
  const out: Mutation[] = [];
  for (const file of discoverFiles(root, filters)) out.push(...enumerateMutations(file, root, out.length + 1));
  return out;
}

export function runCommand(command: string, root: string, timeoutMs: number, inherit = false): { code: number | null; timeout: boolean } {
  const result = spawnSync(command, {
    cwd: root,
    shell: true,
    stdio: inherit ? "inherit" : "ignore",
    timeout: timeoutMs,
  });
  const timeout = Boolean(result.error && (result.error as any).code === "ETIMEDOUT");
  return { code: result.status, timeout };
}

export function runMutations(root: string, mutations: readonly Mutation[], testCommand: string, timeoutMs: number, maxMutants: number | null = null): MutationResult[] {
  const results: MutationResult[] = [];
  for (const mutation of mutations) {
    if (maxMutants !== null && results.length >= maxMutants) break;
    const path = join(root, mutation.file);
    const originalText = readFileSync(path, "utf8");
    const mutatedText = originalText.slice(0, mutation.start) + mutation.replacement + originalText.slice(mutation.end);
    writeFileSync(path, mutatedText);
    try {
      const execution = runCommand(testCommand, root, timeoutMs);
      results.push({
        ...mutation,
        status: execution.timeout ? "timeout" : execution.code === 0 ? "survived" : "killed",
        exitCode: execution.code,
      });
    } finally {
      writeFileSync(path, originalText);
    }
  }
  return results;
}
