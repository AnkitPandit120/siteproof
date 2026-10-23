#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { scoreSite, version } from "./index.js";
import { validateConfig } from "./config.js";
import type { SiteproofConfig } from "./config.js";

const help = `Siteproof ${version}

Usage:
  siteproof score <page URL> [--config <file>] [--json]
  siteproof --version
  siteproof --help

Examples:
  siteproof score http://localhost:3000/
  siteproof score http://localhost:3000/pricing --config siteproof.config.json
`;

async function loadConfig(path: string): Promise<SiteproofConfig> {
  const input: unknown = JSON.parse(await readFile(resolve(path), "utf8"));
  const result = validateConfig(input);
  if (!result.ok) throw new Error(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
  return result.config;
}

async function main(args: string[]): Promise<number> {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log(help);
    return 0;
  }
  if (args.length === 1 && ["--version", "-v"].includes(args[0])) {
    console.log(version);
    return 0;
  }
  if (args[0] !== "score" || !args[1]) {
    console.error(help);
    return 2;
  }
  const url = args[1];
  let configPath: string | undefined;
  let json = false;
  for (let index = 2; index < args.length; index++) {
    if (args[index] === "--json" && !json) {
      json = true;
    } else if (args[index] === "--config" && !configPath && args[index + 1]) {
      configPath = args[++index];
    } else {
      console.error(help);
      return 2;
    }
  }
  const config = configPath ? await loadConfig(configPath) : undefined;
  const scores = await scoreSite(url, config);
  if (json) console.log(JSON.stringify(scores));
  else console.log(`SEO ${scores.seo}/100\nGEO ${scores.geo}/100`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (error: unknown) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  },
);
