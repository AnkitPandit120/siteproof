import assert from "node:assert/strict";
import { test } from "node:test";
import { checkStructuredData } from "../dist/structured-data.js";
import { extractPageMetadata } from "../dist/page.js";

const url = "https://example.com/article";
const pageWith = (...blocks) => extractPageMetadata(`<head>${blocks.map((block) => `<script type="application/ld+json">${block}</script>`).join("")}</head>`, url);

test("reads flat blocks, arrays, and nested graph nodes", () => {
  const page = pageWith(
    '{"@context":"https://schema.org","@type":"Article","headline":"A"}',
    '{"@context":"https://schema.org","@graph":[{"@type":["Organization","LocalBusiness"],"@id":"https://example.com/#org"},{"@graph":[{"@type":"WebPage"}]}]}',
    '[{"@context":"http://schema.org","@type":"Person"}]',
  );
  const result = checkStructuredData(page);
  assert.deepEqual(result.nodes.map((node) => node.types), [["Article"], ["Organization", "LocalBusiness"], ["WebPage"], ["Person"]]);
  assert.equal(result.nodes[1].path, "$.@graph[0]");
  assert.deepEqual(result.findings, []);
});

test("keeps block numbers and paths for syntax and structure errors", () => {
  const result = checkStructuredData(pageWith("", "{bad", '{"@context":"https://schema.org","@graph":[{"name":"Untyped"}]}', "42"));
  assert.deepEqual(result.findings.map((finding) => [finding.block, finding.path, finding.code]), [
    [1, "$", "json_ld_empty"],
    [2, "$", "json_ld_invalid_json"],
    [3, "$.@graph[0]", "json_ld_missing_type"],
    [4, "$", "json_ld_invalid_root"],
  ]);
});

test("warns when a typed node has no schema context", () => {
  const result = checkStructuredData(pageWith('{"@type":"Article","headline":"A"}'));
  assert.deepEqual(result.findings.map((finding) => finding.code), ["json_ld_missing_context"]);
});
