import assert from "node:assert/strict";
import { test } from "node:test";
import { validateConfig } from "../dist/config.js";

test("preview configuration cannot declare indexable routes", () => {
  const preview = { siteUrl: "https://preview.example.com", environment: "preview", routes: [{ match: "/", indexable: true }] };
  assert.equal(validateConfig(preview).ok, false);
  const safe = { siteUrl: preview.siteUrl, environment: "preview" };
  assert.equal(validateConfig(safe).ok, true);
});
