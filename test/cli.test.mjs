import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

function runAsync(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args]);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("CLI exposes one scoring command", () => {
  assert.match(run(["--help"]).stdout, /siteproof score <page URL>/);
  assert.equal(run(["--version"]).stdout.trim(), "0.1.0-beta.1");
  assert.equal(run(["collect"]).status, 2);
  assert.equal(run(["sitemap", "generate"]).status, 2);
});

test("CLI prints only SEO and GEO scores", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/robots.txt") return response.writeHead(404).end();
    response.setHeader("content-type", "text/html");
    response.end(`<head><title>Example</title><meta name="description" content="Summary"><link rel="canonical" href="http://127.0.0.1:${server.address().port}/"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script></head><h1>Example</h1>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const directory = mkdtempSync(join(tmpdir(), "siteproof-score-"));
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    const plain = await runAsync(["score", url]);
    assert.equal(plain.status, 0, plain.stderr);
    assert.match(plain.stdout, /^SEO \d+\/100\nGEO 65\/100\n$/);
    writeFileSync(join(directory, "config.json"), JSON.stringify({
      siteUrl: new URL(url).origin,
      facts: { name: { value: "Example" } },
      bindings: [{ route: "/", selector: "h1", fact: "name" }],
    }));
    const json = await runAsync(["score", url, "--config", join(directory, "config.json"), "--json"]);
    assert.equal(json.status, 0, json.stderr);
    assert.deepEqual(Object.keys(JSON.parse(json.stdout)), ["seo", "geo"]);
    assert.equal(JSON.parse(json.stdout).geo, 100);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});
