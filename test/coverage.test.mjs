import assert from "node:assert/strict";
import { test } from "node:test";
import { checkSitemapCoverage } from "../dist/index.js";

const origin = "https://example.com";
const config = {
  siteUrl: origin,
  pages: ["/pricing"],
  routes: [
    { match: "/private/**", indexable: false },
    { match: "/blog/**", sitemap: "required" },
    { match: "/blog/draft", sitemap: "excluded" },
    { match: "/optional", sitemap: "optional" },
  ],
};

function collection(pages, extra = {}) {
  return {
    urls: pages,
    sitemapPageUrls: pages,
    sitemapUrls: [`${origin}/sitemap.xml`],
    issues: [],
    truncated: false,
    ...extra,
  };
}

test("reports missing required routes and listed excluded routes", () => {
  const result = checkSitemapCoverage(config, collection([`${origin}/`, `${origin}/private/data`, `${origin}/blog/draft`]));
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings.map((finding) => [finding.code, finding.route]), [
    ["required_route_missing", "/pricing"],
    ["excluded_route_listed", "/private/data"],
    ["excluded_route_listed", "/blog/draft"],
  ]);
});

test("does not fail missing routes when sitemap collection is incomplete", () => {
  const incomplete = checkSitemapCoverage(config, collection([], { truncated: true }));
  assert.equal(incomplete.complete, false);
  assert.ok(incomplete.findings.some((finding) => finding.code === "sitemap_incomplete"));
  assert.ok(incomplete.findings.filter((finding) => finding.code === "required_route_missing").every((finding) => finding.severity === "warning"));
  const unavailable = checkSitemapCoverage(config, collection([], { sitemapUrls: [], issues: [{ source: "sitemap", message: "404" }] }));
  assert.deepEqual(unavailable.findings.map((finding) => finding.code), ["sitemap_unavailable"]);
});

test("recognizes a required wildcard with at least one page and honors exact overrides", () => {
  const result = checkSitemapCoverage(config, collection([`${origin}/`, `${origin}/pricing`, `${origin}/blog/post`]));
  assert.deepEqual(result.findings, []);
});
