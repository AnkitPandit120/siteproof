import assert from "node:assert/strict";
import { test } from "node:test";
import { checkRobots, parseRobots, readRobots } from "../dist/index.js";

const url = "https://example.com/private/help";

test("groups adjacent user agents and applies the most specific group", () => {
  const groups = parseRobots(`User-agent: *\nDisallow: /\nUser-agent: Googlebot\nUser-agent: Bingbot\nDisallow: /private/\nAllow: /private/help\n`);
  assert.equal(groups.length, 2);
  assert.equal(checkRobots(groups, "Googlebot", url).allowed, true);
  const blocked = checkRobots(groups, "Bingbot", "https://example.com/private/secret");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.rule.line, 5);
  assert.equal(checkRobots(groups, "Otherbot", url).allowed, false);
});

test("matches wildcards, end anchors, and allow ties", () => {
  const groups = parseRobots("User-agent: *\nDisallow: /*.pdf$\nDisallow: /sale\nAllow: /sale\n");
  assert.equal(checkRobots(groups, "Googlebot", "https://example.com/file.pdf").allowed, false);
  assert.equal(checkRobots(groups, "Googlebot", "https://example.com/file.pdf?download=1").allowed, true);
  assert.equal(checkRobots(groups, "Googlebot", "https://example.com/sale").allowed, true);
});

test("treats missing robots files as open and reports server or size errors", async () => {
  const missing = await readRobots("https://example.com", { fetcher: async () => new Response(null, { status: 404 }) });
  assert.deepEqual(missing.groups, []);
  assert.equal(missing.error, undefined);
  const failed = await readRobots("https://example.com", { fetcher: async () => new Response(null, { status: 503 }) });
  assert.match(failed.error, /503/);
  const large = await readRobots("https://example.com", { maxBytes: 4, fetcher: async () => new Response("Disallow: /") });
  assert.match(large.error, /exceeds/);
});
