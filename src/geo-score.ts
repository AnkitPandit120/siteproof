import type { FactCheckResult } from "./facts.js";
import type { PageMetadata } from "./page.js";
import type { ScoreCheck, SeoHealthScore } from "./score.js";
import type { StructuredDataResult } from "./structured-data.js";

export type GeoReadinessScore = SeoHealthScore;

export function calculateGeoReadiness(page: PageMetadata, facts: FactCheckResult, structured: StructuredDataResult): GeoReadinessScore {
  const html = page.status >= 200 && page.status < 300 && Boolean(page.contentType?.toLowerCase().includes("text/html"));
  const checks: ScoreCheck[] = [
    { name: "accessible_page", weight: 25, status: html ? "pass" : "fail", findingCodes: html ? [] : ["page_not_html"] },
    { name: "description", weight: 15, status: !html ? "not_checked" : page.descriptions.length ? "pass" : "fail", findingCodes: html && !page.descriptions.length ? ["description_missing"] : [] },
    { name: "structured_data", weight: 25, status: !html || !structured.blocks ? "not_checked" : structured.findings.some((finding) => finding.severity === "error") ? "fail" : structured.findings.length ? "warning" : "pass", findingCodes: structured.findings.map((finding) => finding.code) },
    { name: "verified_facts", weight: 35, status: !html || !facts.bindings.length ? "not_checked" : facts.bindings.some((binding) => binding.status === "fail") ? "fail" : facts.bindings.some((binding) => binding.status === "not_checked") ? "not_checked" : "pass", findingCodes: facts.findings.map((finding) => finding.code) },
  ];
  const assessedWeight = checks.reduce((sum, check) => sum + (check.status === "not_checked" ? 0 : check.weight), 0);
  const earned = checks.reduce((sum, check) => sum + check.weight * (check.status === "pass" ? 1 : check.status === "warning" ? 0.5 : 0), 0);
  return { score: assessedWeight ? Math.round(earned / assessedWeight * 100) : 0, coverage: assessedWeight, assessedWeight, totalWeight: 100, checks };
}
