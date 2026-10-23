import assert from "node:assert/strict";
import { test } from "node:test";
import * as siteproof from "../dist/index.js";
const { scoreSite } = siteproof;

test("public library exposes scoring without generator functions", () => {
  assert.deepEqual(Object.keys(siteproof).sort(), ["scoreSite", "version"]);
});

test("scoring counts untested GEO facts as zero rather than claiming full readiness", async () => {
  const html = '<head><title>Example</title><meta name="description" content="Summary"><link rel="canonical" href="https://example.com/"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script></head>';
  const fetcher = async (url) => url.endsWith("/robots.txt") ? new Response(null, { status: 404 }) :
    new Response(html, { headers: { "content-type": "text/html" } });
  const scores = await scoreSite("https://example.com/", undefined, { fetcher });
  assert.equal(scores.geo, 65);
  assert.ok(scores.seo >= 0 && scores.seo <= 100);
});

test("scoring rejects off-origin targets and credentialed URLs", async () => {
  await assert.rejects(() => scoreSite("https://elsewhere.example/", { siteUrl: "https://example.com" }), /configured site origin/);
  await assert.rejects(() => scoreSite("https://user:password@example.com/"), /without credentials/);
});
