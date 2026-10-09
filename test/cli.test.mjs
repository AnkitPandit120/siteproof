import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function run(args, cwd = process.cwd()) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
}

function runAsync(args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("CLI reports its version", () => {
  const result = run(["--version"]);

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "0.0.0");
});

test("CLI rejects unsupported commands", () => {
  const result = run(["unknown"]);

  assert.equal(result.status, 2);
});

test("CLI creates and validates a config without overwriting it", () => {
  const cwd = mkdtempSync(join(tmpdir(), "siteproof-cli-"));
  try {
    const created = run(["init", "--url", "https://example.com"], cwd);
    assert.equal(created.status, 0, created.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(cwd, "siteproof.config.json"), "utf8")), {
      siteUrl: "https://example.com",
      routes: [],
    });

    const validated = run(["config", "validate"], cwd);
    assert.equal(validated.status, 0, validated.stderr);
    assert.match(validated.stdout, /Valid configuration/);

    const repeated = run(["init", "--url", "https://other.example"], cwd);
    assert.equal(repeated.status, 1);
    assert.match(repeated.stderr, /already exists/);
    assert.equal(JSON.parse(readFileSync(join(cwd, "siteproof.config.json"), "utf8")).siteUrl, "https://example.com");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("CLI reports configuration errors with their location", () => {
  const cwd = mkdtempSync(join(tmpdir(), "siteproof-cli-"));
  try {
    writeFileSync(join(cwd, "siteproof.config.json"), JSON.stringify({ siteUrl: "https://example.com", routs: [] }));
    const result = run(["config", "validate"], cwd);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\$\.routs: Unknown setting/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("CLI collects configured and sitemap URLs from a local site", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/sitemap.xml") {
      response.setHeader("content-type", "application/xml");
      response.end(`<urlset><url><loc>http://127.0.0.1:${server.address().port}/blog</loc></url></urlset>`);
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const cwd = mkdtempSync(join(tmpdir(), "siteproof-cli-"));
  try {
    const siteUrl = `http://127.0.0.1:${server.address().port}`;
    writeFileSync(join(cwd, "siteproof.config.json"), JSON.stringify({ siteUrl, pages: ["/pricing"] }));
    const result = await runAsync(["collect"], cwd);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.trim().split("\n"), [`${siteUrl}/`, `${siteUrl}/pricing`, `${siteUrl}/blog`]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("CLI inspects metadata from a local page", async () => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<html><head><title>Local title</title><meta name='description' content='Local description'></head></html>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const cwd = mkdtempSync(join(tmpdir(), "siteproof-cli-"));
  try {
    const siteUrl = `http://127.0.0.1:${server.address().port}`;
    writeFileSync(join(cwd, "siteproof.config.json"), JSON.stringify({ siteUrl }));
    const result = await runAsync(["inspect", "/about"], cwd);
    assert.equal(result.status, 0, result.stderr);
    const page = JSON.parse(result.stdout);
    assert.equal(page.url, `${siteUrl}/about`);
    assert.equal(page.title, "Local title");
    assert.deepEqual(page.descriptions, ["Local description"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(cwd, { recursive: true, force: true });
  }
});
