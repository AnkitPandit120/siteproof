#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { calculateGeoReadiness, calculateSeoHealth, checkFactBindings, checkRobots, checkSeoMetadata, checkSitemapCoverage, checkSocialMetadata, checkStructuredData, collectUrls, generateRobots, generateSitemap, makeFindingReport, previewJsonLd, readPage, readPageDocument, readRobots, validateConfig, version } from "./index.js";
import type { SiteproofConfig } from "./index.js";

const defaultConfig = "siteproof.config.json";
const help = `Siteproof ${version}

Usage:
  siteproof init --url <site origin>
  siteproof config validate [config file]
  siteproof collect [config file] [--json]
  siteproof coverage [config file]
  siteproof sitemap generate [config file]
  siteproof robots generate [config file]
  siteproof jsonld preview <page path> [config file]
  siteproof jsonld write <page path> <output file> --reviewed <preview hash> [config file]
  siteproof inspect <page path> [config file]
  siteproof check <page path> [config file]
  siteproof --version
  siteproof --help

The default config file is ${defaultConfig}.
`;

function printIssues(issues: { path: string; message: string }[]): void {
  for (const issue of issues) console.error(`${issue.path}: ${issue.message}`);
}

async function init(args: string[]): Promise<number> {
  if (args.length !== 2 || args[0] !== "--url") {
    console.error("Usage: siteproof init --url <site origin>");
    return 2;
  }
  const config = { siteUrl: args[1], routes: [] };
  const result = validateConfig(config);
  if (!result.ok) {
    printIssues(result.issues);
    return 1;
  }
  try {
    await writeFile(defaultConfig, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" });
    console.log(`Created ${defaultConfig}`);
    return 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      console.error(`${defaultConfig} already exists; no file was changed`);
      return 1;
    }
    throw error;
  }
}

async function loadConfig(path: string): Promise<SiteproofConfig | undefined> {
  let input: unknown;
  try {
    input = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    console.error(`Could not read JSON config at ${path}: ${(error as Error).message}`);
    return;
  }
  const result = validateConfig(input);
  if (!result.ok) {
    printIssues(result.issues);
    return;
  }
  return result.config;
}

async function validateFile(args: string[]): Promise<number> {
  if (args.length > 1) {
    console.error("Usage: siteproof config validate [config file]");
    return 2;
  }
  const path = resolve(args[0] ?? defaultConfig);
  if (!await loadConfig(path)) return 1;
  console.log(`Valid configuration: ${path}`);
  return 0;
}

async function collect(args: string[]): Promise<number> {
  const json = args.includes("--json");
  const files = args.filter((arg) => arg !== "--json");
  if (files.length > 1 || args.length !== files.length + Number(json)) {
    console.error("Usage: siteproof collect [config file] [--json]");
    return 2;
  }
  const config = await loadConfig(resolve(files[0] ?? defaultConfig));
  if (!config) return 1;
  const result = await collectUrls(config);
  if (json) console.log(JSON.stringify({ schemaVersion: 1, environment: config.environment ?? "production", ...result }, null, 2));
  else {
    for (const url of result.urls) console.log(url);
    for (const issue of result.issues) console.error(`${issue.source}: ${issue.message}`);
    if (result.truncated) console.error("Collection was truncated by a configured limit");
  }
  return result.issues.length || result.truncated ? 1 : 0;
}

async function coverage(args: string[]): Promise<number> {
  if (args.length > 1) {
    console.error("Usage: siteproof coverage [config file]");
    return 2;
  }
  const config = await loadConfig(resolve(args[0] ?? defaultConfig));
  if (!config) return 1;
  const collection = await collectUrls(config);
  const result = checkSitemapCoverage(config, collection);
  console.log(JSON.stringify({ schemaVersion: 1, environment: config.environment ?? "production", ...result, collectionIssues: collection.issues }, null, 2));
  return result.findings.some((finding) => finding.severity === "error") || !result.complete ? 1 : 0;
}

async function sitemapGenerate(args: string[]): Promise<number> {
  if (args.length > 1) {
    console.error("Usage: siteproof sitemap generate [config file]");
    return 2;
  }
  const config = await loadConfig(resolve(args[0] ?? defaultConfig));
  if (!config) return 1;
  const result = generateSitemap(config);
  process.stdout.write(result.xml);
  if (result.omittedPatterns.length) {
    console.error(`Wildcard routes need explicit page paths: ${result.omittedPatterns.join(", ")}`);
  }
  return 0;
}

async function robotsGenerate(args: string[]): Promise<number> {
  if (args.length > 1) {
    console.error("Usage: siteproof robots generate [config file]");
    return 2;
  }
  const config = await loadConfig(resolve(args[0] ?? defaultConfig));
  if (!config) return 1;
  process.stdout.write(generateRobots(config));
  return 0;
}

async function jsonLdGenerate(args: string[], write: boolean): Promise<number> {
  const valid = write ? args.length >= 4 && args.length <= 5 && args[2] === "--reviewed" && /^[a-f0-9]{64}$/.test(args[3]) : args.length >= 1 && args.length <= 2;
  if (!valid || !/^\/(?!\/)[^?#]*$/.test(args[0])) {
    console.error(write ? "Usage: siteproof jsonld write <page path> <output file> --reviewed <preview hash> [config file]" : "Usage: siteproof jsonld preview <page path> [config file]");
    return 2;
  }
  const config = await loadConfig(resolve((write ? args[4] : args[1]) ?? defaultConfig));
  if (!config) return 1;
  const url = new URL(args[0], config.siteUrl);
  const document = await readPageDocument(url.href, config.siteUrl);
  if (document.metadata.status >= 400 || !document.html) {
    console.error(`Cannot verify visible facts on ${url.href}`);
    return 1;
  }
  const preview = previewJsonLd(document.html, url.pathname, config);
  if (preview.errors.length) {
    for (const error of preview.errors) console.error(error);
    return 1;
  }
  const hash = createHash("sha256").update(preview.json!).digest("hex");
  if (write) {
    if (hash !== args[3]) {
      console.error("The page or generated JSON-LD changed since preview. Preview it again before writing.");
      return 1;
    }
    try {
      await writeFile(resolve(args[1]), preview.json!, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        console.error(`Output file already exists: ${args[1]}`);
        return 1;
      }
      throw error;
    }
    console.log(`Wrote reviewed JSON-LD to ${args[1]}`);
  } else {
    process.stdout.write(preview.json!);
    console.error(`Preview only. Verified facts: ${preview.verifiedFacts.join(", ")}. Preview hash: ${hash}`);
  }
  return 0;
}

async function inspect(args: string[]): Promise<number> {
  if (args.length < 1 || args.length > 2 || !args[0].startsWith("/") || args[0].startsWith("//")) {
    console.error("Usage: siteproof inspect <page path> [config file]");
    return 2;
  }
  const config = await loadConfig(resolve(args[1] ?? defaultConfig));
  if (!config) return 1;
  const url = new URL(args[0], config.siteUrl);
  const page = await readPage(url.href, config.siteUrl);
  console.log(JSON.stringify(page, null, 2));
  return page.status >= 400 ? 1 : 0;
}

async function check(args: string[]): Promise<number> {
  if (args.length < 1 || args.length > 2 || !args[0].startsWith("/") || args[0].startsWith("//")) {
    console.error("Usage: siteproof check <page path> [config file]");
    return 2;
  }
  const config = await loadConfig(resolve(args[1] ?? defaultConfig));
  if (!config) return 1;
  const path = new URL(args[0], config.siteUrl).pathname;
  const rule = config.routes?.find((candidate) => candidate.match === path) ??
    config.routes?.filter((candidate) => candidate.match.endsWith("/**") &&
      path.startsWith(candidate.match.slice(0, -2))).sort((a, b) => b.match.length - a.match.length)[0];
  const document = await readPageDocument(new URL(args[0], config.siteUrl).href, config.siteUrl);
  const page = document.metadata;
  const intendedIndexable = config.environment === "preview" ? false : rule?.indexable;
  const findings = checkSeoMetadata(page, { required: rule?.required, indexable: intendedIndexable });
  findings.push(...checkSocialMetadata(page, rule?.required?.includes("ogImage")));
  const facts = checkFactBindings(document.html, page.url, config);
  for (const finding of facts.findings) {
    findings.push({
      code: finding.code,
      severity: finding.severity,
      message: `${finding.fact} at ${finding.selector}: ${finding.message}`,
      evidence: finding.observed === undefined ? finding.expected : `Expected ${finding.expected}; found ${finding.observed}`,
    });
  }
  const structuredData = checkStructuredData(page);
  for (const finding of structuredData.findings) {
    findings.push({ code: finding.code, severity: finding.severity, message: `JSON-LD block ${finding.block} at ${finding.path}: ${finding.message}` });
  }
  const robots = await readRobots(config.siteUrl);
  if (robots.error) {
    findings.push({ code: "robots_unavailable", severity: "warning", message: "Could not verify robots.txt", evidence: robots.error });
  } else {
    const decision = checkRobots(robots.groups, "Googlebot", page.url);
    if (!decision.allowed) {
      findings.push({
        code: "robots_blocked",
        severity: intendedIndexable === false ? "warning" : "error",
        message: intendedIndexable === false
          ? "Googlebot cannot read this page's noindex directive"
          : "Googlebot is blocked from a page intended for search",
        evidence: decision.rule ? `robots.txt line ${decision.rule.line}: ${decision.rule.type}: ${decision.rule.path}` : undefined,
      });
    }
  }
  const report = makeFindingReport(page.url, findings);
  const seoHealth = calculateSeoHealth(page, findings, {
    robotsChecked: !robots.error,
    socialRequired: rule?.required?.includes("ogImage"),
  });
  const geoReadiness = calculateGeoReadiness(page, facts, structuredData);
  console.log(JSON.stringify({ schemaVersion: 1, environment: config.environment ?? "production", ...report, seoHealth, geoReadiness, facts, structuredData: { blocks: structuredData.blocks, nodes: structuredData.nodes } }, null, 2));
  return report.summary.errors ? 1 : 0;
}

async function main(args: string[]): Promise<number> {
  if (args.length === 1 && (args[0] === "--version" || args[0] === "-v")) {
    console.log(version);
    return 0;
  }
  if (args.length === 0 || (args.length === 1 && ["--help", "-h"].includes(args[0]))) {
    console.log(help);
    return 0;
  }
  if (args[0] === "init") return init(args.slice(1));
  if (args[0] === "config" && args[1] === "validate") return validateFile(args.slice(2));
  if (args[0] === "collect") return collect(args.slice(1));
  if (args[0] === "coverage") return coverage(args.slice(1));
  if (args[0] === "sitemap" && args[1] === "generate") return sitemapGenerate(args.slice(2));
  if (args[0] === "robots" && args[1] === "generate") return robotsGenerate(args.slice(2));
  if (args[0] === "jsonld" && args[1] === "preview") return jsonLdGenerate(args.slice(2), false);
  if (args[0] === "jsonld" && args[1] === "write") return jsonLdGenerate(args.slice(2), true);
  if (args[0] === "inspect") return inspect(args.slice(1));
  if (args[0] === "check") return check(args.slice(1));

  console.error(`Unknown command: ${args.join(" ")}`);
  console.error(help);
  return 2;
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (error: unknown) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  },
);
