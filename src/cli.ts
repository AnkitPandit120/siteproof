#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateConfig, version } from "./index.js";

const defaultConfig = "siteproof.config.json";
const help = `Siteproof ${version}

Usage:
  siteproof init --url <site origin>
  siteproof config validate [config file]
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

async function validateFile(args: string[]): Promise<number> {
  if (args.length > 1) {
    console.error("Usage: siteproof config validate [config file]");
    return 2;
  }
  const path = resolve(args[0] ?? defaultConfig);
  let input: unknown;
  try {
    input = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    console.error(`Could not read JSON config at ${path}: ${(error as Error).message}`);
    return 1;
  }
  const result = validateConfig(input);
  if (!result.ok) {
    printIssues(result.issues);
    return 1;
  }
  console.log(`Valid configuration: ${path}`);
  return 0;
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
