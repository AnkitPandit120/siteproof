import { validateConfig } from "./config.js";
import type { SiteproofConfig, RouteRule } from "./config.js";
import { checkSeoMetadata } from "./checks.js";
import { checkFactBindings } from "./facts.js";
import { calculateGeoReadiness } from "./geo-score.js";
import { readPageDocument } from "./page.js";
import { checkRobots, readRobots } from "./robots.js";
import { calculateSeoHealth } from "./score.js";
import { checkSocialMetadata } from "./social.js";
import { checkStructuredData } from "./structured-data.js";

export interface SiteScores {
  seo: number;
  geo: number;
}

export interface ScoreSiteOptions {
  fetcher?: typeof fetch;
}

function ruleFor(path: string, rules: RouteRule[]): RouteRule | undefined {
  return rules.filter((rule) => rule.match === path ||
    (rule.match.endsWith("/**") && path.startsWith(rule.match.slice(0, -2))))
    .sort((a, b) => b.match.length - a.match.length)[0];
}

/** Return conservative 0–100 SEO and GEO scores for one HTML page. */
export async function scoreSite(url: string, config?: SiteproofConfig, options: ScoreSiteOptions = {}): Promise<SiteScores> {
  const target = new URL(url);
  if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) {
    throw new Error("Score target must be an HTTP or HTTPS URL without credentials");
  }
  const settings = config ?? { siteUrl: target.origin };
  const validation = validateConfig(settings);
  if (!validation.ok) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
  if (new URL(settings.siteUrl).origin !== target.origin) {
    throw new Error("Score target must match the configured site origin");
  }
  const document = await readPageDocument(target.href, settings.siteUrl, { fetcher: options.fetcher });
  const page = document.metadata;
  const rule = ruleFor(target.pathname, settings.routes ?? []);
  const intendedIndexable = settings.environment === "preview" ? false : rule?.indexable;
  const findings = checkSeoMetadata(page, { required: rule?.required, indexable: intendedIndexable });
  findings.push(...checkSocialMetadata(page, rule?.required?.includes("ogImage")));
  const facts = checkFactBindings(document.html, page.url, settings);
  for (const finding of facts.findings) {
    findings.push({ code: finding.code, severity: finding.severity, message: finding.message });
  }
  const structured = checkStructuredData(page);
  for (const finding of structured.findings) {
    findings.push({ code: finding.code, severity: finding.severity, message: finding.message });
  }
  const robots = await readRobots(settings.siteUrl, { fetcher: options.fetcher });
  if (!robots.error && !checkRobots(robots.groups, "Googlebot", page.url).allowed) {
    findings.push({ code: "robots_blocked", severity: intendedIndexable === false ? "warning" : "error", message: "Crawler cannot access this page" });
  }
  const seo = calculateSeoHealth(page, findings, {
    robotsChecked: !robots.error,
    socialRequired: rule?.required?.includes("ogImage"),
  });
  const geo = calculateGeoReadiness(page, facts, structured);
  // The check functions score assessed dimensions only. A public two-number score
  // must also account for dimensions that could not be checked.
  return {
    seo: Math.round(seo.score * seo.coverage / 100),
    geo: Math.round(geo.score * geo.coverage / 100),
  };
}
