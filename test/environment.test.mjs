import assert from "node:assert/strict";
import { test } from "node:test";
import { generateRobots, generateSitemap, validateConfig } from "../dist/index.js";

test("preview configuration cannot declare indexable routes or generate a sitemap", () => {
  const preview = { siteUrl: "https://preview.example.com", environment: "preview", routes: [{ match: "/", indexable: true }] };
  assert.equal(validateConfig(preview).ok, false);
  const safe = { siteUrl: preview.siteUrl, environment: "preview" };
  assert.equal(validateConfig(safe).ok, true);
  assert.throws(() => generateSitemap(safe), /Preview sites/);
  assert.equal(generateRobots(safe), "User-agent: *\nAllow: /\n");
});
