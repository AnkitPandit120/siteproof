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

test("CLI previews JSON-LD from a verified live page without writing a file", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<h1>Siteproof Pro</h1>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const cwd = mkdtempSync(join(tmpdir(), "siteproof-cli-"));
  try {
    writeFileSync(join(cwd, "siteproof.config.json"), JSON.stringify({
      siteUrl: `http://127.0.0.1:${server.address().port}`,
      facts: { product: { value: "Siteproof Pro" } },
      bindings: [{ route: "/pricing", selector: "h1", fact: "product" }],
      jsonLdTemplates: [{ route: "/pricing", type: "Product", properties: { name: "product" } }],
    }));
    const result = await runAsync(["jsonld", "preview", "/pricing"], cwd);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).name, "Siteproof Pro");
    assert.match(result.stderr, /Preview only/);
    assert.deepEqual((await import("node:fs")).readdirSync(cwd), ["siteproof.config.json"]);
    const hash = result.stderr.match(/Preview hash: ([a-f0-9]{64})/)[1];
    const wrong = await runAsync(["jsonld", "write", "/pricing", "schema.json", "--reviewed", "0".repeat(64)], cwd);
    assert.equal(wrong.status, 1);
    const written = await runAsync(["jsonld", "write", "/pricing", "schema.json", "--reviewed", hash], cwd);
    assert.equal(written.status, 0, written.stderr);
    assert.equal(readFileSync(join(cwd, "schema.json"), "utf8"), result.stdout);
    const repeated = await runAsync(["jsonld", "write", "/pricing", "schema.json", "--reviewed", hash], cwd);
    assert.equal(repeated.status, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
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
    const json = await runAsync(["collect", "--json"], cwd);
    assert.equal(json.status, 0, json.stderr);
    assert.equal(JSON.parse(json.stdout).schemaVersion, 1);
    assert.deepEqual(JSON.parse(json.stdout).urls, [`${siteUrl}/`, `${siteUrl}/pricing`, `${siteUrl}/blog`]);
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

test("CLI requires noindex on preview pages", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end('<head><title>Preview</title><meta name="description" content="Draft"><link rel="canonical" href="/draft"></head>');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const cwd = mkdtempSync(join(tmpdir(), "siteproof-cli-"));
  try {
    writeFileSync(join(cwd, "siteproof.config.json"), JSON.stringify({ siteUrl: `http://127.0.0.1:${server.address().port}`, environment: "preview" }));
    const result = await runAsync(["check", "/draft"], cwd);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).environment, "preview");
    assert.ok(JSON.parse(result.stdout).findings.some((finding) => finding.code === "noindex_missing"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("CLI checks page metadata using the matching route requirements", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/robots.txt") {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("content-type", "text/html");
    response.end("<html><head><title>Local title</title></head></html>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const cwd = mkdtempSync(join(tmpdir(), "siteproof-cli-"));
  try {
    const siteUrl = `http://127.0.0.1:${server.address().port}`;
    writeFileSync(join(cwd, "siteproof.config.json"), JSON.stringify({
      siteUrl,
      routes: [{ match: "/title-only", required: ["title"] }],
    }));
    const passing = await runAsync(["check", "/title-only"], cwd);
    assert.equal(passing.status, 0, passing.stderr);
    assert.deepEqual(JSON.parse(passing.stdout).findings, []);

    const failing = await runAsync(["check", "/other"], cwd);
    assert.equal(failing.status, 1, failing.stderr);
    assert.deepEqual(JSON.parse(failing.stdout).findings.map((finding) => finding.code), ["description_missing", "canonical_missing"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("CLI explains when robots rules block an indexable page", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/robots.txt") {
      response.setHeader("content-type", "text/plain");
      response.end("User-agent: *\nDisallow: /private/\n");
    } else {
      response.setHeader("content-type", "text/html");
      response.end("<head><title>Private page</title><meta name='description' content='Info'><link rel='canonical' href='/private/page'></head>");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const cwd = mkdtempSync(join(tmpdir(), "siteproof-cli-"));
  try {
    const siteUrl = `http://127.0.0.1:${server.address().port}`;
    writeFileSync(join(cwd, "siteproof.config.json"), JSON.stringify({ siteUrl }));
    const result = await runAsync(["check", "/private/page"], cwd);
    assert.equal(result.status, 1, result.stderr);
    const findings = JSON.parse(result.stdout).findings;
    assert.ok(findings.some((finding) => finding.code === "robots_blocked" && /line 2/.test(finding.evidence)));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("CLI reports sitemap coverage against configured routes", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/sitemap.xml") {
      response.setHeader("content-type", "application/xml");
      response.end(`<urlset><url><loc>http://127.0.0.1:${server.address().port}/</loc></url><url><loc>http://127.0.0.1:${server.address().port}/private</loc></url></urlset>`);
    } else response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const cwd = mkdtempSync(join(tmpdir(), "siteproof-cli-"));
  try {
    const siteUrl = `http://127.0.0.1:${server.address().port}`;
    writeFileSync(join(cwd, "siteproof.config.json"), JSON.stringify({
      siteUrl,
      pages: ["/pricing"],
      routes: [{ match: "/private", sitemap: "excluded" }],
    }));
    const result = await runAsync(["coverage"], cwd);
    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).findings.map((finding) => finding.code), [
      "required_route_missing", "excluded_route_listed",
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("CLI generates sitemap XML from configured pages", () => {
  const cwd = mkdtempSync(join(tmpdir(), "siteproof-cli-"));
  try {
    writeFileSync(join(cwd, "siteproof.config.json"), JSON.stringify({
      siteUrl: "https://example.com", pages: ["/pricing"],
      routes: [{ match: "/private", indexable: false }, { match: "/blog/**" }],
    }));
    const result = run(["sitemap", "generate"], cwd);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /https:\/\/example.com\/pricing/);
    assert.doesNotMatch(result.stdout, /private/);
    assert.match(result.stderr, /Wildcard routes need explicit page paths/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("CLI generates robots rules from explicit configuration", () => {
  const cwd = mkdtempSync(join(tmpdir(), "siteproof-cli-"));
  try {
    writeFileSync(join(cwd, "siteproof.config.json"), JSON.stringify({
      siteUrl: "https://example.com", robotsRules: [{ userAgents: ["Googlebot"], disallow: ["/search/"] }],
    }));
    const result = run(["robots", "generate"], cwd);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /User-agent: Googlebot\nDisallow: \/search\//);
    assert.match(result.stdout, /Sitemap: https:\/\/example.com\/sitemap.xml/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("CLI shows JSON-LD nodes and identifies invalid blocks", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/robots.txt") return response.writeHead(404).end();
    response.setHeader("content-type", "text/html");
    response.end("<head><title>Article</title><meta name='description' content='Article'><link rel='canonical' href='https://example.com/article'><script type='application/ld+json'>{\"@context\":\"https://schema.org\",\"@type\":\"Article\"}</script><script type='application/ld+json'>{broken</script></head>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const cwd = mkdtempSync(join(tmpdir(), "siteproof-cli-"));
  try {
    const siteUrl = `http://127.0.0.1:${server.address().port}`;
    writeFileSync(join(cwd, "siteproof.config.json"), JSON.stringify({ siteUrl }));
    const result = await runAsync(["check", "/article"], cwd);
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.structuredData.nodes[0].types, ["Article"]);
    assert.ok(report.findings.some((finding) => finding.code === "json_ld_invalid_json" && /block 2/.test(finding.message)));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("CLI includes social findings and a concise result summary", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/robots.txt") return response.writeHead(404).end();
    response.setHeader("content-type", "text/html");
    response.end("<head><title>Page</title><meta name='description' content='Page summary'><link rel='canonical' href='/page'><meta property='og:title' content='Page'></head>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const cwd = mkdtempSync(join(tmpdir(), "siteproof-cli-"));
  try {
    const siteUrl = `http://127.0.0.1:${server.address().port}`;
    writeFileSync(join(cwd, "siteproof.config.json"), JSON.stringify({
      siteUrl, routes: [{ match: "/page", required: ["title", "description", "canonical", "ogImage"] }],
    }));
    const result = await runAsync(["check", "/page"], cwd);
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.summary.status, "fail");
    assert.ok(report.seoHealth.score < 100);
    assert.equal(report.seoHealth.coverage, 95);
    assert.ok(report.findings.some((finding) => finding.code === "og_image_missing" && finding.severity === "error"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("CLI compares a bound trusted fact with page text", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/robots.txt") return response.writeHead(404).end();
    response.setHeader("content-type", "text/html");
    response.end("<head><title>Pricing</title><meta name='description' content='Plans'><link rel='canonical' href='/pricing'></head><body><p data-price>₹599/month</p></body>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const cwd = mkdtempSync(join(tmpdir(), "siteproof-cli-"));
  try {
    const siteUrl = `http://127.0.0.1:${server.address().port}`;
    writeFileSync(join(cwd, "siteproof.config.json"), JSON.stringify({
      siteUrl,
      facts: { proPrice: { value: 499, currency: "INR", billingPeriod: "month" } },
      bindings: [{ route: "/pricing", selector: "[data-price]", fact: "proPrice" }],
    }));
    const result = await runAsync(["check", "/pricing"], cwd);
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.facts.bindings[0].status, "fail");
    assert.ok(report.findings.some((finding) => finding.code === "fact_value_mismatch" && /499/.test(finding.evidence)));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(cwd, { recursive: true, force: true });
  }
});
