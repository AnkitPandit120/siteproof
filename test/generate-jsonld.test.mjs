import assert from "node:assert/strict";
import { test } from "node:test";
import { previewJsonLd, validateConfig } from "../dist/index.js";

const config = {
  siteUrl: "https://example.com",
  facts: { product: { value: "Siteproof Pro" }, price: { value: 499, currency: "INR", billingPeriod: "month" } },
  bindings: [
    { route: "/pricing", selector: "h1", fact: "product" },
    { route: "/pricing", selector: "[data-price]", fact: "price" },
  ],
  jsonLdTemplates: [{ route: "/pricing", type: "Product", properties: { name: "product", price: "price" } }],
};

test("generates JSON-LD only from facts verified on the page", () => {
  assert.equal(validateConfig(config).ok, true);
  const preview = previewJsonLd("<h1>Siteproof Pro</h1><p data-price>₹499/month</p>", "/pricing", config);
  assert.deepEqual(preview.errors, []);
  assert.deepEqual(JSON.parse(preview.json), { "@context": "https://schema.org", "@type": "Product", name: "Siteproof Pro", price: 499 });
  assert.deepEqual(preview.verifiedFacts, ["product", "price"]);
});

test("refuses a preview when any cited fact is missing, changed, or ambiguous", () => {
  for (const html of [
    "<h1>Siteproof Pro</h1>",
    "<h1>Siteproof Pro</h1><p data-price>₹599/month</p>",
    "<h1>Siteproof Pro</h1><p data-price>₹499 and ₹599/month</p>",
  ]) {
    const preview = previewJsonLd(html, "/pricing", config);
    assert.equal(preview.json, null);
    assert.ok(preview.errors.some((error) => error.includes("price")));
  }
});

test("rejects template facts that are not bound to the same route", () => {
  const invalid = { ...config, jsonLdTemplates: [{ route: "/about", type: "Product", properties: { name: "product" } }] };
  assert.equal(validateConfig(invalid).ok, false);
});
