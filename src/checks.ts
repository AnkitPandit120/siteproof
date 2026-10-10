import type { RequiredTag } from "./config.js";
import type { PageMetadata } from "./page.js";

export interface SeoFinding {
  code: string;
  severity: "error" | "warning";
  message: string;
  evidence?: string;
}

export interface SeoCheckOptions {
  required?: RequiredTag[];
  indexable?: boolean;
}

function hasDirective(values: string[], directive: string): boolean {
  return values.some((value) => value.toLowerCase().split(",").some((part) =>
    part.trim().split(":").at(-1)?.trim().split(/\s+/)[0] === directive));
}

export function checkSeoMetadata(page: PageMetadata, options: SeoCheckOptions = {}): SeoFinding[] {
  const findings: SeoFinding[] = [];
  const required = options.required ?? ["title", "description", "canonical"];
  const add = (code: string, severity: SeoFinding["severity"], message: string, evidence?: string): void => {
    findings.push({ code, severity, message, ...(evidence ? { evidence } : {}) });
  };

  if (page.status < 200 || page.status >= 300 || !page.contentType?.toLowerCase().includes("text/html")) {
    add("page_not_html", "error", "The page did not return a successful HTML response", String(page.status));
    return findings;
  }

  if (required.includes("title") && !page.title) add("title_missing", "error", "Add a page title");
  if (page.titles.length > 1) add("title_multiple", "warning", "Keep one title element in the document head", String(page.titles.length));

  if (required.includes("description") && page.descriptions.length === 0) {
    add("description_missing", "error", "Add a meta description");
  }
  if (page.descriptions.length > 1) {
    add("description_multiple", "warning", "Keep one meta description in the document head", String(page.descriptions.length));
  }

  if (required.includes("canonical") && page.canonicals.length === 0) {
    add("canonical_missing", "error", "Add a canonical link");
  }
  if (page.canonicals.length > 1) {
    add("canonical_multiple", "error", "Keep one canonical link in the document head", String(page.canonicals.length));
  }
  for (const href of page.canonicals) {
    let canonical: URL;
    try {
      canonical = new URL(href, page.url);
    } catch {
      add("canonical_invalid", "error", "Use a valid canonical URL", href);
      continue;
    }
    if (!["http:", "https:"].includes(canonical.protocol) || canonical.username || canonical.password) {
      add("canonical_invalid", "error", "Use an HTTP or HTTPS canonical URL without credentials", href);
    } else {
      if (!/^https?:\/\//i.test(href)) add("canonical_relative", "warning", "Use an absolute canonical URL", href);
      if (canonical.origin !== new URL(page.url).origin) {
        add("canonical_external", "warning", "Review a canonical URL on another origin", canonical.href);
      }
      if (canonical.hash) add("canonical_fragment", "warning", "Remove the fragment from the canonical URL", href);
    }
  }

  const metaNoindex = hasDirective(page.robots, "noindex") || hasDirective(page.robots, "none");
  const headerNoindex = hasDirective(page.xRobotsTag, "noindex") || hasDirective(page.xRobotsTag, "none");
  const noindex = metaNoindex || headerNoindex;
  if (options.indexable !== false && noindex) {
    add("unexpected_noindex", "error", "Remove the noindex directive from a page intended for search", metaNoindex ? "meta robots" : "X-Robots-Tag");
  }
  if (options.indexable === false && !noindex) {
    add("noindex_missing", "error", "Add a noindex meta tag or X-Robots-Tag header");
  }

  return findings;
}
