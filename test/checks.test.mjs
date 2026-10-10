import assert from "node:assert/strict";
import { test } from "node:test";
import { checkSeoMetadata, extractPageMetadata } from "../dist/index.js";

const url = "https://example.com/article";
const codes = (html, options) => checkSeoMetadata(extractPageMetadata(html, url), options).map((finding) => finding.code);

test("reports missing title, description, and canonical on a successful page", () => {
  assert.deepEqual(codes("<html><head></head></html>"), ["title_missing", "description_missing", "canonical_missing"]);
});

test("accepts complete metadata and route-specific requirements", () => {
  const html = '<head><title>Article</title><meta name="description" content="About the article"><link rel="canonical" href="https://example.com/article"></head>';
  assert.deepEqual(codes(html), []);
  assert.deepEqual(codes("<head><title>Article</title></head>", { required: ["title"] }), []);
});

test("reports duplicates and canonical problems with evidence", () => {
  const html = '<head><title>One</title><title>Two</title><meta name="description" content="First"><meta name="description" content="Second"><link rel="canonical" href="/article#section"><link rel="canonical" href="https://other.example/article"></head>';
  const findings = checkSeoMetadata(extractPageMetadata(html, url));
  assert.deepEqual(findings.map((finding) => finding.code), [
    "title_multiple", "description_multiple", "canonical_multiple", "canonical_relative", "canonical_fragment", "canonical_external",
  ]);
  assert.equal(findings.find((finding) => finding.code === "canonical_external").evidence, "https://other.example/article");
});

test("does not call a failed or non-HTML response a missing-title page", () => {
  const failed = extractPageMetadata("", url, 404, "text/html");
  const nonHtml = extractPageMetadata("", url, 200, "application/pdf");
  assert.deepEqual(checkSeoMetadata(failed).map((finding) => finding.code), ["page_not_html"]);
  assert.deepEqual(checkSeoMetadata(nonHtml).map((finding) => finding.code), ["page_not_html"]);
});
