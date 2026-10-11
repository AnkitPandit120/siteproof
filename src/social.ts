import type { PageMetadata } from "./page.js";
import type { SeoFinding } from "./checks.js";

function first(values: string[] | undefined): string | undefined {
  return values?.[0];
}

function validHttpUrl(value: string, base: string): boolean {
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function checkSocialMetadata(page: PageMetadata, requireOgImage = false): SeoFinding[] {
  if (page.status < 200 || page.status >= 300 || !page.contentType?.toLowerCase().includes("text/html")) return [];
  const findings: SeoFinding[] = [];
  const add = (code: string, severity: SeoFinding["severity"], message: string, evidence?: string): void => {
    findings.push({ code, severity, message, ...(evidence ? { evidence } : {}) });
  };
  const og = page.openGraph;
  const twitter = page.twitter;
  const hasSocial = Object.keys(og).length > 0 || Object.keys(twitter).length > 0;
  if (!hasSocial && !requireOgImage) return findings;

  for (const key of ["og:title", "og:description", "og:image"]) {
    if (!first(og[key])) add(`${key.replace(":", "_")}_missing`, key === "og:image" && requireOgImage ? "error" : "warning", `Add ${key} for social previews`);
  }
  for (const key of ["og:title", "og:description", "og:image", "og:url", "twitter:card", "twitter:title", "twitter:description", "twitter:image"]) {
    const values = key.startsWith("og:") ? og[key] : twitter[key];
    if (values && values.length > 1) add("social_tag_multiple", "warning", `Keep one ${key} value`, `${key}: ${values.length} values`);
  }
  for (const key of ["og:image", "og:url", "twitter:image"]) {
    const value = first(key.startsWith("og:") ? og[key] : twitter[key]);
    if (value && !validHttpUrl(value, page.url)) add("social_url_invalid", "error", `Use an HTTP or HTTPS URL for ${key}`, value);
  }
  const card = first(twitter["twitter:card"]);
  if (card && !["summary", "summary_large_image", "app", "player"].includes(card)) {
    add("twitter_card_invalid", "warning", "Use a supported Twitter card type", card);
  }
  if (Object.keys(twitter).length && !card) add("twitter_card_missing", "warning", "Add twitter:card to define the card layout");
  return findings;
}
