import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { enumerateMutations, runMutations } from "../dist/core.js";

test("scanner ignores comments and strings", () => {
  const root = mkdtempSync(join(tmpdir(), "mutate4ts-"));
  try {
    const file = join(root, "sample.ts");
    writeFileSync(file, "// true === false\nconst text = 'true && false';\nexport const f = (x: boolean) => x === true && false;\n");
    const mutations = enumerateMutations(file, root);
    assert.deepEqual(mutations.map((m) => m.original), ["===", "true", "&&", "false"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("source is restored after a mutant", () => {
  const root = mkdtempSync(join(tmpdir(), "mutate4ts-"));
  try {
    mkdirSync(join(root, "src"));
    const file = join(root, "src", "sample.ts");
    const original = "export const value = true;\n";
    writeFileSync(file, original);
    const mutation = enumerateMutations(file, root)[0];
    const results = runMutations(root, [mutation], "node -e \"process.exit(1)\"", 5000);
    assert.equal(results[0].status, "killed");
    assert.equal(readFileSync(file, "utf8"), original);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
