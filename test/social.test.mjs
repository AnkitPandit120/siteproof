import assert from "node:assert/strict";
import { test } from "node:test";
import { checkSocialMetadata } from "../dist/social.js";
import { extractPageMetadata } from "../dist/page.js";

const url = "https://example.com/article";
const codes = (html, required = false) => checkSocialMetadata(extractPageMetadata(`<head>${html}</head>`, url), required).map((finding) => finding.code);

test("does not require social tags on pages without social metadata unless configured", () => {
  assert.deepEqual(codes(""), []);
  assert.deepEqual(codes("", true), ["og_title_missing", "og_description_missing", "og_image_missing"]);
});

test("checks incomplete social cards, duplicate tags, and malformed URLs", () => {
  const html = '<meta property="og:title" content="Article"><meta property="og:title" content="Again"><meta property="og:image" content="javascript:bad"><meta name="twitter:card" content="giant">';
  assert.deepEqual(codes(html), ["og_description_missing", "social_tag_multiple", "social_url_invalid", "twitter_card_invalid"]);
});

test("accepts valid Open Graph and Twitter metadata", () => {
  const html = '<meta property="og:title" content="Article"><meta property="og:description" content="A summary"><meta property="og:image" content="/cover.png"><meta property="og:url" content="https://example.com/article"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="https://example.com/cover.png">';
  assert.deepEqual(codes(html, true), []);
});
