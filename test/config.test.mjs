import assert from "node:assert/strict";
import { test } from "node:test";
import { validateConfig } from "../dist/config.js";

test("accepts a site with route rules and explicitly bound facts", () => {
  const config = {
    siteUrl: "https://example.com",
    routes: [
      { match: "/blog/**", indexable: true, required: ["title", "canonical"] },
      { match: "/search", indexable: false },
    ],
    facts: { proPrice: { value: 499, currency: "INR", billingPeriod: "month" } },
    bindings: [{ route: "/pricing", selector: "[data-price]", fact: "proPrice" }],
  };

  assert.deepEqual(validateConfig(config), { ok: true, config });
});

test("rejects obsolete generation settings and an unknown fact binding", () => {
  const result = validateConfig({
    siteUrl: "https://example.com",
    routes: [{ match: "/private", indexable: false, sitemap: "required" }],
    bindings: [{ route: "/pricing", selector: "[data-price]", fact: "missing" }],
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.path === "$.routes[0].sitemap"));
  assert.ok(result.issues.some((issue) => issue.path === "$.bindings[0].fact"));
});

test("rejects credential-bearing origins and misspelled settings", () => {
  const result = validateConfig({ siteUrl: "https://user:pass@example.com", routs: [] });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.path === "$.siteUrl"));
  assert.ok(result.issues.some((issue) => issue.path === "$.routs"));
});

test("accepts numeric plan limits with units and rejects units on prices", () => {
  const valid = { siteUrl: "https://example.com", facts: { projects: { value: 10, unit: "projects" } } };
  assert.equal(validateConfig(valid).ok, true);
  const invalid = validateConfig({ siteUrl: "https://example.com", facts: { price: { value: 499, currency: "INR", unit: "projects" } } });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.issues.some((issue) => issue.path === "$.facts.price.unit"));
});
