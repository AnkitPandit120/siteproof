import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { SiteproofConfig } from "./config.js";

export interface CollectionIssue {
  source: string;
  message: string;
}

export interface CollectionResult {
  urls: string[];
  sitemapUrls: string[];
  sitemapPageUrls: string[];
  issues: CollectionIssue[];
  truncated: boolean;
}

export interface CollectionOptions {
  maxPages?: number;
  maxSitemaps?: number;
  maxBytes?: number;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  processEntities: false,
  removeNSPrefix: true,
});

function entries(value: unknown): Record<string, unknown>[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).filter(
    (item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item),
  );
}

function canonicalUrl(value: string, origin: string): string | undefined {
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.username || url.password || !["http:", "https:"].includes(url.protocol)) return;
    url.hash = "";
    return url.href;
  } catch {
    return;
  }
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error(`Sitemap exceeds ${maxBytes} bytes`);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function collectUrls(config: SiteproofConfig, options: CollectionOptions = {}): Promise<CollectionResult> {
  const origin = new URL(config.siteUrl).origin;
  const maxPages = options.maxPages ?? 500;
  const maxSitemaps = options.maxSitemaps ?? 10;
  const maxBytes = options.maxBytes ?? 1_000_000;
  const timeoutMs = options.timeoutMs ?? 8_000;
  if (![maxPages, maxSitemaps, maxBytes, timeoutMs].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new RangeError("Collection limits must be positive integers");
  }

  const urls = new Set<string>();
  const sitemapUrls = new Set<string>();
  const sitemapPageUrls = new Set<string>();
  const issues: CollectionIssue[] = [];
  let truncated = false;

  function addPage(value: string, source: string, fromSitemap = false): void {
    const url = canonicalUrl(value, origin);
    if (!url) {
      issues.push({ source, message: `Skipped an invalid or off-site page URL: ${value}` });
    } else {
      if (fromSitemap && !sitemapPageUrls.has(url)) {
        if (sitemapPageUrls.size >= maxPages) truncated = true;
        else sitemapPageUrls.add(url);
      }
      if (!urls.has(url)) {
        if (urls.size >= maxPages) truncated = true;
        else urls.add(url);
      }
    }
  }

  addPage("/", "siteUrl");
  for (const page of config.pages ?? []) addPage(page, "pages");
  for (const rule of config.routes ?? []) {
    if (!rule.match.includes("*")) addPage(rule.match, "routes");
  }
  for (const binding of config.bindings ?? []) addPage(binding.route, "bindings");

  const firstSitemap = canonicalUrl(config.sitemapUrl ?? "/sitemap.xml", origin);
  if (!firstSitemap) {
    issues.push({ source: "sitemapUrl", message: "Sitemap URL is invalid or off-site" });
    return { urls: [...urls], sitemapUrls: [], sitemapPageUrls: [], issues, truncated };
  }
  const queue = [firstSitemap];
  const visited = new Set<string>();
  while (queue.length) {
    if (visited.size >= maxSitemaps) {
      truncated = true;
      issues.push({ source: "sitemap", message: `Stopped after ${maxSitemaps} sitemap files` });
      break;
    }
    const sitemap = queue.shift()!;
    if (visited.has(sitemap)) continue;
    visited.add(sitemap);
    let response: Response;
    try {
      response = await (options.fetcher ?? fetch)(sitemap, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "application/xml, text/xml, */*" },
      });
    } catch (error) {
      issues.push({ source: sitemap, message: `Could not fetch sitemap: ${(error as Error).message}` });
      continue;
    }
    if (!response.ok) {
      issues.push({ source: sitemap, message: `Sitemap returned HTTP ${response.status}` });
      continue;
    }
    let xml: string;
    try {
      xml = await readLimited(response, maxBytes);
    } catch (error) {
      issues.push({ source: sitemap, message: (error as Error).message });
      continue;
    }
    if (/<!DOCTYPE/i.test(xml)) {
      issues.push({ source: sitemap, message: "Sitemap DOCTYPE declarations are not supported" });
      continue;
    }
    if (XMLValidator.validate(xml) !== true) {
      issues.push({ source: sitemap, message: "Sitemap is invalid XML" });
      continue;
    }
    const document = parser.parse(xml) as Record<string, unknown>;
    const urlset = document.urlset as Record<string, unknown> | undefined;
    const index = document.sitemapindex as Record<string, unknown> | undefined;
    if (!urlset && !index) {
      issues.push({ source: sitemap, message: "Expected a sitemap urlset or sitemapindex" });
      continue;
    }
    sitemapUrls.add(sitemap);
    for (const entry of entries(urlset?.url)) {
      if (typeof entry.loc === "string") addPage(entry.loc, sitemap, true);
    }
    for (const entry of entries(index?.sitemap)) {
      if (typeof entry.loc !== "string") continue;
      const child = canonicalUrl(entry.loc, origin);
      if (!child) {
        issues.push({ source: sitemap, message: `Skipped an invalid or off-site sitemap URL: ${entry.loc}` });
      } else if (!visited.has(child) && !queue.includes(child)) {
        queue.push(child);
      }
    }
  }

  return { urls: [...urls], sitemapUrls: [...sitemapUrls], sitemapPageUrls: [...sitemapPageUrls], issues, truncated };
}
