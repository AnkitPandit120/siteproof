import type { SiteproofConfig } from "./config.js";

export function generateRobots(config: SiteproofConfig): string {
  if (config.environment === "preview") return "User-agent: *\nAllow: /\n";
  const groups = config.robotsRules ?? [];
  const sections = groups.map((group) => [
    ...group.userAgents.map((agent) => `User-agent: ${agent}`),
    ...(group.allow ?? []).map((path) => `Allow: ${path}`),
    ...(group.disallow ?? []).map((path) => `Disallow: ${path}`),
  ].join("\n"));
  const sitemapUrl = new URL(config.sitemapUrl ?? "/sitemap.xml", config.siteUrl).href;
  return [...sections, `Sitemap: ${sitemapUrl}`].join("\n\n") + "\n";
}
