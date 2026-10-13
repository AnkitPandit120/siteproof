import assert from "node:assert/strict";
import { test } from "node:test";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { generateSitemap } from "../dist/index.js";

test("generates valid XML from finite configured routes without excluded pages", () => {
  const result = generateSitemap({
    siteUrl: "https://example.com",
    pages: ["/pricing", "/draft"],
    routes: [
      { match: "/blog/**", sitemap: "required" },
      { match: "/draft", indexable: false },
      { match: "/pricing", sitemap: "required" },
    ],
    bindings: [{ route: "/blog/first", selector: "h1", fact: "name" }],
  });
  assert.deepEqual(result.urls, ["https://example.com/", "https://example.com/blog/first", "https://example.com/pricing"]);
  assert.deepEqual(result.omittedPatterns, ["/blog/**"]);
  assert.equal(XMLValidator.validate(result.xml), true);
  const xml = new XMLParser({ ignoreAttributes: true }).parse(result.xml);
  assert.deepEqual(xml.urlset.url.map((entry) => entry.loc), result.urls);
});

test("escapes URL query delimiters if a future route source supplies them", () => {
  const result = generateSitemap({ siteUrl: "https://example.com", pages: ["/a?x=1&y=2"] });
  assert.match(result.xml, /\/a\?x=1&amp;y=2/);
});
