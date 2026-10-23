import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateGeoReadiness } from "../dist/geo-score.js";
import { checkFactBindings } from "../dist/facts.js";
import { checkStructuredData } from "../dist/structured-data.js";
import { extractPageMetadata } from "../dist/page.js";

const config = { siteUrl: "https://example.com", facts: { name: { value: "Acme" } }, bindings: [{ route: "/", selector: "h1", fact: "name" }] };

test("GEO score reports coverage and verified facts separately", () => {
  const html = '<head><meta name="description" content="About Acme"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script></head><h1>Acme</h1>';
  const page = extractPageMetadata(html, "https://example.com/");
  const score = calculateGeoReadiness(page, checkFactBindings(html, page.url, config), checkStructuredData(page));
  assert.equal(score.score, 100);
  assert.equal(score.coverage, 100);
  const unverified = calculateGeoReadiness(page, checkFactBindings("<h1>Other</h1>", page.url, config), checkStructuredData(page));
  assert.equal(unverified.checks.find((check) => check.name === "verified_facts").status, "fail");
  assert.ok(unverified.score < 100);
});

test("GEO score does not award untested dimensions", () => {
  const page = extractPageMetadata("<h1>Acme</h1>", "https://example.com/");
  const score = calculateGeoReadiness(page, { bindings: [], findings: [] }, checkStructuredData(page));
  assert.equal(score.coverage, 40);
  assert.equal(score.checks.find((check) => check.name === "structured_data").status, "not_checked");
});
