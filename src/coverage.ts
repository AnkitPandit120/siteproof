import type { CollectionResult } from "./collect.js";
import type { RouteRule, SiteproofConfig, SitemapSetting } from "./config.js";

export interface CoverageFinding {
  code: "required_route_missing" | "excluded_route_listed" | "sitemap_unavailable" | "sitemap_incomplete";
  severity: "error" | "warning";
  route: string;
  message: string;
}

export interface CoverageResult {
  sitemapPages: number;
  checkedRoutes: number;
  findings: CoverageFinding[];
  complete: boolean;
}

function matches(pattern: string, path: string): boolean {
  return pattern.endsWith("/**") ? path.startsWith(pattern.slice(0, -2)) : pattern === path;
}

function setting(rule: RouteRule): SitemapSetting {
  return rule.sitemap ?? (rule.indexable === false ? "excluded" : "required");
}

function ruleForPath(rules: RouteRule[], path: string): RouteRule | undefined {
  return rules.filter((rule) => matches(rule.match, path))
    .sort((a, b) => b.match.length - a.match.length)[0];
}

export function checkSitemapCoverage(config: SiteproofConfig, collection: CollectionResult): CoverageResult {
  const origin = new URL(config.siteUrl).origin;
  const sitemapPages = new Set(collection.sitemapPageUrls);
  const findings: CoverageFinding[] = [];
  const complete = collection.sitemapUrls.length > 0 && !collection.truncated && collection.issues.length === 0;
  if (!collection.sitemapUrls.length) {
    findings.push({ code: "sitemap_unavailable", severity: "warning", route: config.sitemapUrl ?? "/sitemap.xml", message: "No readable sitemap was found; coverage cannot be verified" });
  } else if (!complete) {
    findings.push({ code: "sitemap_incomplete", severity: "warning", route: config.sitemapUrl ?? "/sitemap.xml", message: "Sitemap collection had errors or reached a limit; missing routes are provisional" });
  }

  const rules = config.routes ?? [];
  const expected = new Set(["/", ...(config.pages ?? []), ...rules.filter((rule) => !rule.match.includes("*")).map((rule) => rule.match)]);
  for (const path of expected) {
    const rule = ruleForPath(rules, path);
    const policy = rule ? setting(rule) : "required";
    const url = new URL(path, origin).href;
    if (policy === "required" && !sitemapPages.has(url) && collection.sitemapUrls.length) {
      findings.push({ code: "required_route_missing", severity: complete ? "error" : "warning", route: path, message: "Required route is missing from the sitemap" });
    }
  }

  for (const url of sitemapPages) {
    const path = new URL(url).pathname;
    const rule = ruleForPath(rules, path);
    if (rule && setting(rule) === "excluded") {
      findings.push({ code: "excluded_route_listed", severity: "error", route: path, message: "Excluded route is listed in the sitemap" });
    }
  }

  for (const rule of rules) {
    if (!rule.match.endsWith("/**") || setting(rule) !== "required" || !collection.sitemapUrls.length) continue;
    if (![...sitemapPages].some((url) => matches(rule.match, new URL(url).pathname))) {
      findings.push({ code: "required_route_missing", severity: complete ? "error" : "warning", route: rule.match, message: "Required route pattern has no sitemap pages" });
    }
  }

  return { sitemapPages: sitemapPages.size, checkedRoutes: expected.size + rules.filter((rule) => rule.match.endsWith("/**")).length, findings, complete };
}
