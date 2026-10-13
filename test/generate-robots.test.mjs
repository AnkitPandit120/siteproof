import assert from "node:assert/strict";
import { test } from "node:test";
import { checkRobots, generateRobots, parseRobots, validateConfig } from "../dist/index.js";

test("generates crawler groups only from explicit rules", () => {
  const config = {
    siteUrl: "https://example.com",
    routes: [{ match: "/private", indexable: false }],
    robotsRules: [
      { userAgents: ["*"], disallow: ["/admin/"], allow: ["/admin/help/"] },
      { userAgents: ["GPTBot", "CCBot"], disallow: ["/"] },
    ],
  };
  assert.equal(validateConfig(config).ok, true);
  const text = generateRobots(config);
  assert.match(text, /Sitemap: https:\/\/example.com\/sitemap.xml/);
  assert.doesNotMatch(text, /\/private/);
  const groups = parseRobots(text);
  assert.equal(checkRobots(groups, "Googlebot", "https://example.com/admin/help/page").allowed, true);
  assert.equal(checkRobots(groups, "GPTBot", "https://example.com/").allowed, false);
});

test("rejects rule injection and emits only a sitemap when no crawler rules are given", () => {
  const invalid = validateConfig({ siteUrl: "https://example.com", robotsRules: [{ userAgents: ["*"], disallow: ["/safe\nAllow: /"] }] });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.issues.some((issue) => issue.path === "$.robotsRules[0].disallow"));
  assert.equal(generateRobots({ siteUrl: "https://example.com" }), "Sitemap: https://example.com/sitemap.xml\n");
});
