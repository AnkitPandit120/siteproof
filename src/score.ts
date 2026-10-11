import type { SeoFinding } from "./checks.js";
import type { PageMetadata } from "./page.js";

export interface ScoreCheck {
  name: string;
  weight: number;
  status: "pass" | "warning" | "fail" | "not_checked";
  findingCodes: string[];
}

export interface SeoHealthScore {
  score: number;
  coverage: number;
  assessedWeight: number;
  totalWeight: number;
  checks: ScoreCheck[];
}

export interface ScoreOptions {
  socialRequired?: boolean;
  robotsChecked?: boolean;
}

const checks = [
  { name: "response", weight: 10, codes: ["page_not_html"] },
  { name: "title", weight: 15, codes: ["title_missing", "title_multiple"] },
  { name: "description", weight: 15, codes: ["description_missing", "description_multiple"] },
  { name: "canonical", weight: 20, codes: ["canonical_missing", "canonical_multiple", "canonical_invalid", "canonical_relative", "canonical_external", "canonical_fragment"] },
  { name: "indexability", weight: 15, codes: ["unexpected_noindex", "noindex_missing"] },
  { name: "crawlability", weight: 10, codes: ["robots_blocked"] },
  { name: "social", weight: 10, codes: ["og_title_missing", "og_description_missing", "og_image_missing", "social_tag_multiple", "social_url_invalid", "twitter_card_invalid", "twitter_card_missing"] },
  { name: "structured_data", weight: 5, codes: ["json_ld_empty", "json_ld_invalid_json", "json_ld_invalid_root", "json_ld_invalid_graph", "json_ld_missing_type", "json_ld_missing_context"] },
] as const;

export function calculateSeoHealth(page: PageMetadata, findings: SeoFinding[], options: ScoreOptions = {}): SeoHealthScore {
  const html = page.status >= 200 && page.status < 300 && Boolean(page.contentType?.toLowerCase().includes("text/html"));
  const socialPresent = Object.keys(page.openGraph).length > 0 || Object.keys(page.twitter).length > 0;
  const results: ScoreCheck[] = checks.map((check) => {
    const applicable = check.name === "response" || (html &&
      (check.name !== "crawlability" || options.robotsChecked === true) &&
      (check.name !== "social" || socialPresent || options.socialRequired === true) &&
      (check.name !== "structured_data" || page.jsonLd.length > 0));
    const related = findings.filter((finding) => (check.codes as readonly string[]).includes(finding.code));
    const status: ScoreCheck["status"] = !applicable ? "not_checked" :
      related.some((finding) => finding.severity === "error") ? "fail" :
        related.length ? "warning" : "pass";
    return { name: check.name, weight: check.weight, status, findingCodes: related.map((finding) => finding.code) };
  });
  const assessedWeight = results.reduce((total, result) => total + (result.status === "not_checked" ? 0 : result.weight), 0);
  const earned = results.reduce((total, result) => total + result.weight *
    (result.status === "pass" ? 1 : result.status === "warning" ? 0.5 : 0), 0);
  return {
    score: assessedWeight ? Math.round(earned / assessedWeight * 100) : 0,
    coverage: Math.round(assessedWeight),
    assessedWeight,
    totalWeight: 100,
    checks: results,
  };
}
