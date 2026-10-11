import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateSeoHealth, extractPageMetadata } from "../dist/index.js";

const url = "https://example.com/article";
const complete = extractPageMetadata('<head><title>Article</title><meta name="description" content="Summary"><link rel="canonical" href="https://example.com/article"><meta property="og:title" content="Article"><meta property="og:description" content="Summary"><meta property="og:image" content="https://example.com/cover.png"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Article"}</script></head>', url);

test("scores checked SEO dimensions and exposes untested coverage", () => {
  const score = calculateSeoHealth(complete, [], { robotsChecked: true });
  assert.equal(score.score, 100);
  assert.equal(score.coverage, 100);
  assert.ok(score.checks.every((check) => check.status === "pass"));

  const partial = calculateSeoHealth(complete, [], { robotsChecked: false });
  assert.equal(partial.score, 100);
  assert.equal(partial.coverage, 90);
  assert.equal(partial.checks.find((check) => check.name === "crawlability").status, "not_checked");
});

test("reduces scores for errors and warnings without hiding them", () => {
  const score = calculateSeoHealth(complete, [
    { code: "title_missing", severity: "error", message: "Title missing" },
    { code: "canonical_relative", severity: "warning", message: "Relative canonical" },
  ], { robotsChecked: true });
  assert.equal(score.score, 75);
  assert.deepEqual(score.checks.filter((check) => check.status !== "pass").map((check) => [check.name, check.status]), [
    ["title", "fail"], ["canonical", "warning"],
  ]);
});

test("failed HTML response does not award points for checks that could not run", () => {
  const failed = extractPageMetadata("", url, 404, "text/html");
  const score = calculateSeoHealth(failed, [{ code: "page_not_html", severity: "error", message: "404" }]);
  assert.equal(score.score, 0);
  assert.equal(score.coverage, 10);
  assert.ok(score.checks.slice(1).every((check) => check.status === "not_checked"));
});
