import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function run(args, cwd = process.cwd()) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
}

test("CLI reports its version", () => {
  const result = run(["--version"]);

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "0.0.0");
});

test("CLI rejects unsupported commands", () => {
  const result = run(["unknown"]);

  assert.equal(result.status, 2);
});

test("CLI creates and validates a config without overwriting it", () => {
  const cwd = mkdtempSync(join(tmpdir(), "siteproof-cli-"));
  try {
    const created = run(["init", "--url", "https://example.com"], cwd);
    assert.equal(created.status, 0, created.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(cwd, "siteproof.config.json"), "utf8")), {
      siteUrl: "https://example.com",
      routes: [],
    });

    const validated = run(["config", "validate"], cwd);
    assert.equal(validated.status, 0, validated.stderr);
    assert.match(validated.stdout, /Valid configuration/);

    const repeated = run(["init", "--url", "https://other.example"], cwd);
    assert.equal(repeated.status, 1);
    assert.match(repeated.stderr, /already exists/);
    assert.equal(JSON.parse(readFileSync(join(cwd, "siteproof.config.json"), "utf8")).siteUrl, "https://example.com");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("CLI reports configuration errors with their location", () => {
  const cwd = mkdtempSync(join(tmpdir(), "siteproof-cli-"));
  try {
    writeFileSync(join(cwd, "siteproof.config.json"), JSON.stringify({ siteUrl: "https://example.com", routs: [] }));
    const result = run(["config", "validate"], cwd);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\$\.routs: Unknown setting/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
