import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { extractPageMetadata, readPage, readPageDocument } from "../dist/index.js";

const fixture = readFileSync(new URL("./fixtures/article.html", import.meta.url), "utf8");

test("extracts title, duplicate descriptions, canonical, social tags, and JSON-LD", () => {
  const page = extractPageMetadata(fixture, "https://example.com/article");

  assert.equal(page.title, "An article & its metadata");
  assert.deepEqual(page.descriptions, ["First description", "Second description"]);
  assert.deepEqual(page.canonicals, ["https://example.com/article"]);
  assert.deepEqual(page.robots, ["index,follow"]);
  assert.deepEqual(page.openGraph["og:title"], ["Social title"]);
  assert.deepEqual(page.openGraph["og:image"], ["https://example.com/social.png"]);
  assert.deepEqual(page.twitter["twitter:card"], ["summary_large_image"]);
  assert.equal(JSON.parse(page.jsonLd[0])["@type"], "Article");
});

test("reads a page and keeps response status and X-Robots-Tag", async () => {
  const page = await readPage("https://example.com/article", "https://example.com", {
    fetcher: async () => new Response(fixture, {
      headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow" },
    }),
  });

  assert.equal(page.status, 200);
  assert.deepEqual(page.xRobotsTag, ["noindex", "nofollow"]);
  assert.equal(page.title, "An article & its metadata");
});

test("can return bounded HTML with metadata for fact checks", async () => {
  const document = await readPageDocument("https://example.com/article", "https://example.com", {
    fetcher: async () => new Response(fixture, { headers: { "content-type": "text/html" } }),
  });
  assert.equal(document.html, fixture);
  assert.equal(document.metadata.title, "An article & its metadata");
});

test("rejects off-site URLs and cross-origin redirects", async () => {
  await assert.rejects(() => readPage("https://other.example/a", "https://example.com"), /off-site/);
  const page = await readPage("https://example.com/a", "https://example.com", {
    fetcher: async () => new Response(null, { status: 302, headers: { location: "https://other.example/a" } }),
  });
  assert.equal(page.status, 302);
  assert.equal(page.title, null);
});

test("does not parse non-HTML or oversized responses", async () => {
  const nonHtml = await readPage("https://example.com/file", "https://example.com", {
    fetcher: async () => new Response("<title>Wrong</title>", { headers: { "content-type": "application/pdf" } }),
  });
  assert.equal(nonHtml.title, null);
  assert.equal(nonHtml.contentType, "application/pdf");

  await assert.rejects(() => readPage("https://example.com/a", "https://example.com", {
    maxBytes: 8,
    fetcher: async () => new Response(fixture, { headers: { "content-type": "text/html" } }),
  }), /exceeds/);
});
