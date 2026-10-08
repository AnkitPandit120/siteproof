#!/usr/bin/env node
import { version } from "./index.js";

const [command] = process.argv.slice(2);

if (command === "--version" || command === "-v") {
  console.log(version);
} else {
  console.log("Siteproof is under development. See README.md for the delivery plan.");
  process.exitCode = command === "--help" || command === "-h" ? 0 : 2;
}
