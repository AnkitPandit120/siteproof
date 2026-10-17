import type { RouteRule, SiteproofConfig } from "./config.js";

export interface GeneratedSitemap {
  xml: string;
  urls: string[];
  omittedPatterns: string[];
}

function ruleFor(path: string, rules: RouteRule[]): RouteRule | undefined {
  return rules.filter((rule) => rule.match === path ||
    (rule.match.endsWith("/**") && path.startsWith(rule.match.slice(0, -2))))
    .sort((a, b) => b.match.length - a.match.length)[0];
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function generateSitemap(config: SiteproofConfig): GeneratedSitemap {
  if (config.environment === "preview") throw new Error("Preview sites must not publish a sitemap");
  const origin = new URL(config.siteUrl).origin;
  const rules = config.routes ?? [];
  const paths = new Set(["/", ...(config.pages ?? []),
    ...rules.filter((rule) => !rule.match.includes("*")).map((rule) => rule.match),
    ...(config.bindings ?? []).map((binding) => binding.route)]);
  const urls: string[] = [];
  for (const path of paths) {
    const rule = ruleFor(path, rules);
    if (rule?.indexable === false || rule?.sitemap === "excluded") continue;
    urls.push(new URL(path, origin).href);
  }
  urls.sort();
  const omittedPatterns = rules.filter((rule) => rule.match.includes("*")).map((rule) => rule.match);
  const entries = urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
  return { xml, urls, omittedPatterns };
}
