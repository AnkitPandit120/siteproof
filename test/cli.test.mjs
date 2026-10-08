import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("CLI reports its version", () => {
  const result = spawnSync(process.execPath, ["dist/cli.js", "--version"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "0.0.0");
});

test("CLI rejects unsupported commands", () => {
  const result = spawnSync(process.execPath, ["dist/cli.js", "unknown"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
});
