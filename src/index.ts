#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { collectMutations, runCommand, runMutations } from "./core.js";

const VERSION = "0.1.0";
const DEFAULT_TEST = "npm test";
const DEFAULT_MANIFEST = "target/mutation/mutations.json";

function help(): void {
  console.log(`mutate4ts ${VERSION}

Usage: mutate4ts [options] [path-fragment ...]

Options:
  --root <path>             Project root
  --test-command <cmd>      Unit-test command. Default: npm test
  --timeout <seconds>       Per-mutant timeout. Default: 60
  --max-mutants <number>    Limit the run
  --list                    List mutation sites without running tests
  --skip-baseline           Do not verify the original test suite first
  --manifest <path>         JSON manifest path
  --json                    Print JSON
  --fail-on-survivors       Exit 2 when a mutant survives
  --version                 Print version
  --help                    Print help
`);
}

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    root: { type: "string" }, "test-command": { type: "string" }, timeout: { type: "string" },
    "max-mutants": { type: "string" }, list: { type: "boolean" }, "skip-baseline": { type: "boolean" },
    manifest: { type: "string" }, json: { type: "boolean" }, "fail-on-survivors": { type: "boolean" },
    version: { type: "boolean" }, help: { type: "boolean" },
  }});
  if (values.help) { help(); process.exit(0); }
  if (values.version) { console.log(VERSION); process.exit(0); }
  const root = resolve(values.root ?? ".");
  const command = values["test-command"] ?? DEFAULT_TEST;
  const timeoutMs = Number(values.timeout ?? "60") * 1000;
  const maxMutants = values["max-mutants"] === undefined ? null : Number(values["max-mutants"]);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("--timeout must be positive");
  if (maxMutants !== null && (!Number.isInteger(maxMutants) || maxMutants <= 0)) throw new Error("--max-mutants must be a positive integer");
  const mutations = collectMutations(root, positionals);
  if (values.list) {
    console.log(values.json ? JSON.stringify(mutations, null, 2) : mutations.map((m) => `${m.id}\t${m.file}:${m.line}:${m.column}\t${m.original} -> ${m.replacement}`).join("\n"));
    process.exit(0);
  }
  if (!values["skip-baseline"] && runCommand(command, root, timeoutMs, true).code !== 0) throw new Error("baseline tests failed");
  const results = runMutations(root, mutations, command, timeoutMs, maxMutants);
  const manifest = resolve(root, values.manifest ?? DEFAULT_MANIFEST);
  mkdirSync(dirname(manifest), { recursive: true });
  writeFileSync(manifest, JSON.stringify(results, null, 2) + "\n");
  if (values.json) console.log(JSON.stringify(results, null, 2));
  else {
    const killed = results.filter((r) => r.status !== "survived").length;
    const survived = results.length - killed;
    console.log(`Mutation Report\n===============\nMutants: ${results.length}\nKilled: ${killed}\nSurvived: ${survived}`);
    for (const result of results.filter((r) => r.status === "survived")) console.log(`SURVIVED ${result.file}:${result.line}:${result.column} ${result.original} -> ${result.replacement}`);
  }
  if (values["fail-on-survivors"] && results.some((result) => result.status === "survived")) process.exit(2);
} catch (error) {
  console.error(`mutate4ts: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
