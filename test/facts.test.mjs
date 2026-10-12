import assert from "node:assert/strict";
import { test } from "node:test";
import { checkFactBindings } from "../dist/index.js";

const config = {
  siteUrl: "https://example.com",
  facts: {
    price: { value: 499, currency: "INR", billingPeriod: "month" },
    product: { value: "Siteproof Pro" },
  },
  bindings: [
    { route: "/pricing", selector: "[data-price]", fact: "price" },
    { route: "/pricing", selector: "h1", fact: "product" },
  ],
};

test("compares configured facts with visible text on their route", () => {
  const result = checkFactBindings("<h1>Siteproof Pro</h1><p data-price>₹499/month</p>", "https://example.com/pricing", config);
  assert.deepEqual(result.bindings.map((binding) => binding.status), ["pass", "pass"]);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(checkFactBindings("", "https://example.com/about", config), { bindings: [], findings: [] });
});

test("reports missing selectors, ambiguous selectors, and mismatched values", () => {
  const missing = checkFactBindings("<h1>Siteproof Pro</h1>", "https://example.com/pricing", config);
  assert.equal(missing.findings[0].code, "fact_selector_missing");
  const mismatch = checkFactBindings("<h1>Other</h1><p data-price>₹599/month</p>", "https://example.com/pricing", config);
  assert.deepEqual(mismatch.findings.map((finding) => finding.code), ["fact_value_mismatch", "fact_value_mismatch"]);
  const multiple = checkFactBindings("<h1>One</h1><h1>Two</h1>", "https://example.com/pricing", config);
  assert.ok(multiple.findings.some((finding) => finding.code === "fact_selector_multiple"));
});

test("marks unavailable HTML as unverified", () => {
  const result = checkFactBindings("", "https://example.com/pricing", config);
  assert.ok(result.bindings.every((binding) => binding.status === "not_checked"));
  assert.ok(result.findings.every((finding) => finding.code === "fact_page_unavailable"));
});
