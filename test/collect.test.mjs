import assert from "node:assert/strict";
import { test } from "node:test";
import { collectUrls } from "../dist/index.js";

const origin = "https://example.com";

function xmlResponse(body) {
  return new Response(body, { status: 200, headers: { "content-type": "application/xml" } });
}

test("collects explicit pages and nested sitemap URLs once", async () => {
  const requested = [];
  const documents = new Map([
    [`${origin}/sitemap.xml`, `<?xml version="1.0"?><sitemapindex><sitemap><loc>${origin}/posts.xml</loc></sitemap></sitemapindex>`],
    [`${origin}/posts.xml`, `<?xml version="1.0"?><urlset><url><loc>${origin}/blog/a</loc></url><url><loc>${origin}/pricing</loc></url></urlset>`],
  ]);
  const result = await collectUrls({
    siteUrl: origin,
    pages: ["/pricing"],
    routes: [{ match: "/search", indexable: false }, { match: "/blog/**" }],
  }, {
    fetcher: async (url) => {
      requested.push(url);
      return xmlResponse(documents.get(url));
    },
  });

  assert.deepEqual(requested, [`${origin}/sitemap.xml`, `${origin}/posts.xml`]);
  assert.deepEqual(result.urls, [`${origin}/`, `${origin}/pricing`, `${origin}/search`, `${origin}/blog/a`]);
  assert.deepEqual(result.sitemapUrls, requested);
  assert.deepEqual(result.sitemapPageUrls, [`${origin}/blog/a`, `${origin}/pricing`]);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.issues, []);
});

test("rejects off-site URLs and stops at the page limit", async () => {
  const result = await collectUrls({ siteUrl: origin, pages: ["/a"] }, {
    maxPages: 2,
    fetcher: async () => xmlResponse(`<urlset>
      <url><loc>https://other.example/private</loc></url>
      <url><loc>${origin}/b</loc></url>
    </urlset>`),
  });

  assert.deepEqual(result.urls, [`${origin}/`, `${origin}/a`]);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.sitemapPageUrls, [`${origin}/b`]);
  assert.match(result.issues[0].message, /off-site/);
});

test("does not fetch a cross-origin redirect or an oversized sitemap", async () => {
  const redirected = await collectUrls({ siteUrl: origin }, {
    fetcher: async () => new Response(null, { status: 302, headers: { location: "https://other.example/sitemap.xml" } }),
  });
  assert.deepEqual(redirected.sitemapUrls, []);
  assert.match(redirected.issues[0].message, /302/);

  const oversized = await collectUrls({ siteUrl: origin }, {
    maxBytes: 15,
    fetcher: async () => xmlResponse("<urlset><url><loc>https://example.com/a</loc></url></urlset>"),
  });
  assert.deepEqual(oversized.sitemapUrls, []);
  assert.match(oversized.issues[0].message, /exceeds/);
});

test("stops recursive sitemap discovery at its file limit", async () => {
  const result = await collectUrls({ siteUrl: origin }, {
    maxSitemaps: 1,
    fetcher: async () => xmlResponse(`<sitemapindex><sitemap><loc>${origin}/second.xml</loc></sitemap></sitemapindex>`),
  });
  assert.deepEqual(result.sitemapUrls, [`${origin}/sitemap.xml`]);
  assert.equal(result.truncated, true);
  assert.ok(result.issues.some((issue) => /Stopped after 1/.test(issue.message)));
});
