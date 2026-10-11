import assert from "node:assert/strict";
import { test } from "node:test";
import { makeFindingReport } from "../dist/index.js";

test("puts errors first and summarizes the outcome without losing evidence", () => {
  const report = makeFindingReport("https://example.com", [
    { code: "warning", severity: "warning", message: "Review", evidence: "source" },
    { code: "error", severity: "error", message: "Fix" },
  ]);
  assert.deepEqual(report.summary, { errors: 1, warnings: 1, status: "fail" });
  assert.deepEqual(report.findings.map((finding) => finding.code), ["error", "warning"]);
  assert.equal(report.findings[1].evidence, "source");
  assert.deepEqual(makeFindingReport("https://example.com", []).summary, { errors: 0, warnings: 0, status: "pass" });
});
