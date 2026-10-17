import { load } from "cheerio";

export interface PageMetadata {
  url: string;
  status: number;
  contentType: string | null;
  title: string | null;
  titles: string[];
  descriptions: string[];
  canonicals: string[];
  robots: string[];
  xRobotsTag: string[];
  openGraph: Record<string, string[]>;
  twitter: Record<string, string[]>;
  jsonLd: string[];
}

export interface PageReadOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface PageDocument {
  metadata: PageMetadata;
  html: string;
}

function clean(value: string | undefined): string | null {
  const text = value?.replace(/\s+/g, " ").trim();
  return text || null;
}

function addField(target: Record<string, string[]>, key: string, value: string): void {
  (target[key] ??= []).push(value);
}

export function extractPageMetadata(
  html: string,
  url: string,
  status = 200,
  contentType: string | null = "text/html",
  xRobotsTag: string[] = [],
): PageMetadata {
  const $ = load(html);
  const head = $("head");
  const descriptions: string[] = [];
  const titles = head.find("title").toArray().map((element) => clean($(element).text())).filter((value): value is string => value !== null);
  const canonicals: string[] = [];
  const robots: string[] = [];
  const openGraph: Record<string, string[]> = {};
  const twitter: Record<string, string[]> = {};
  const jsonLd: string[] = [];

  head.find("meta").each((_, element) => {
    const name = $(element).attr("name")?.trim().toLowerCase();
    const property = $(element).attr("property")?.trim().toLowerCase();
    const content = clean($(element).attr("content"));
    if (!content) return;
    if (name === "description") descriptions.push(content);
    if (name === "robots" || name === "googlebot") robots.push(content);
    if (property?.startsWith("og:")) addField(openGraph, property, content);
    if (name?.startsWith("twitter:")) addField(twitter, name, content);
  });

  head.find("link[rel]").each((_, element) => {
    const rel = $(element).attr("rel")?.trim().toLowerCase().split(/\s+/);
    if (!rel?.includes("canonical")) return;
    const href = clean($(element).attr("href"));
    if (href) canonicals.push(href);
  });

  $("script[type]").each((_, element) => {
    if ($(element).attr("type")?.trim().toLowerCase() !== "application/ld+json") return;
    jsonLd.push($(element).html()?.trim() ?? "");
  });

  return {
    url,
    status,
    contentType,
    title: titles[0] ?? null,
    titles,
    descriptions,
    canonicals,
    robots,
    xRobotsTag,
    openGraph,
    twitter,
    jsonLd,
  };
}

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error(`Page exceeds ${maxBytes} bytes`);
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

export async function readPageDocument(url: string, siteUrl: string, options: PageReadOptions = {}): Promise<PageDocument> {
  const target = new URL(url);
  if (target.origin !== new URL(siteUrl).origin || target.username || target.password || !["http:", "https:"].includes(target.protocol)) {
    throw new Error(`Page URL is off-site or unsupported: ${url}`);
  }
  const timeoutMs = options.timeoutMs ?? 8_000;
  const maxBytes = options.maxBytes ?? 2_000_000;
  if (![timeoutMs, maxBytes].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new RangeError("Page limits must be positive integers");
  }
  const response = await (options.fetcher ?? fetch)(target.href, {
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "text/html" },
  });
  const contentType = response.headers.get("content-type");
  const xRobotsTag = response.headers.get("x-robots-tag")?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
  if (!response.ok || !contentType?.toLowerCase().includes("text/html")) {
    return { metadata: extractPageMetadata("", target.href, response.status, contentType, xRobotsTag), html: "" };
  }
  const html = await readBounded(response, maxBytes);
  return { metadata: extractPageMetadata(html, target.href, response.status, contentType, xRobotsTag), html };
}

export async function readPage(url: string, siteUrl: string, options: PageReadOptions = {}): Promise<PageMetadata> {
  return (await readPageDocument(url, siteUrl, options)).metadata;
}
